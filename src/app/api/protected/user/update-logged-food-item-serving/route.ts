import { NextRequest, NextResponse } from "next/server"
import { GetUserIdOnRequest } from "@/utils/supabase/GetUserIdFromRequest"
import { calculateNutrientData } from "@/foodMessageProcessing/common/calculateNutrientData"
import { createAdminSupabase } from "@/utils/supabase/serverAdmin"
import { FoodItemWithNutrientsAndServing } from "@/app/dashboard/utils/FoodHelper"
import { Tables } from "types/supabase"
import { validateServingUpdate } from "./validateServingUpdate"

export const dynamic = "force-dynamic"

const nutrientFields = [
  "addedSugarG", "alcoholG", "caffeineMg", "calciumMg", "carbG", "cholesterolMg",
  "copperMg", "fiberG", "iodineMcg", "ironMg", "kcal", "magnesiumMg", "manganeseMg",
  "monounsatFatG", "omega3Mg", "omega6Mg", "phosphorusMg", "polyunsatFatG", "potassiumMg",
  "proteinG", "satFatG", "seleniumMcg", "sodiumMg", "sugarG", "totalFatG", "transFatG",
  "unsatFatG", "vitaminAMcg", "vitaminB12Mcg", "vitaminB1Mg", "vitaminB2Mg",
  "vitaminB3Mg", "vitaminB5Mg", "vitaminB6Mg", "vitaminB7Mcg", "vitaminB9Mcg",
  "vitaminCMg", "vitaminDMcg", "vitaminEMg", "vitaminKMcg", "waterMl", "zincMg"
] as const

const foodColumns = `id,userId,defaultServingWeightGram,kcalPerServing,totalFatPerServing,
  satFatPerServing,transFatPerServing,carbPerServing,sugarPerServing,addedSugarPerServing,
  proteinPerServing,fiberPerServing,Nutrient(nutrientName,nutrientAmountPerDefaultServing),
  Serving(id,foodItemId,servingName)`
const loggedColumns = ["id", "userId", "status", "deletedAt", "messageId", "foodItemId",
  "grams", "updatedAt", ...nutrientFields].join(",")

type PortionFood = FoodItemWithNutrientsAndServing & {
  Serving: { id: number; foodItemId: number; servingName: string }[]
}
type LoadedFood = Tables<"LoggedFoodItem"> & {
  Message: Pick<Tables<"Message">, "status" | "userId" | "deletedAt"> | null
  FoodItem: PortionFood | null
}

function failure(message: string, status: number) {
  return NextResponse.json({ message }, { status })
}

export async function POST(request: NextRequest) {
  try {
    const { userId, error: authError } = await GetUserIdOnRequest()
    if (authError || !userId) return failure("Authentication required", 401)

    let body: unknown
    try { body = await request.json() } catch { return failure("Invalid JSON request", 400) }
    if (!body || typeof body !== "object" || Array.isArray(body)) return failure("Invalid request", 400)
    const { loggedFoodItemId, updateData } = body as Record<string, unknown>
    if (typeof loggedFoodItemId !== "number" || !Number.isSafeInteger(loggedFoodItemId) || loggedFoodItemId <= 0) {
      return failure("Invalid food ID", 400)
    }
    const change = validateServingUpdate(updateData)
    if (!change) return failure("Invalid portion or update fields", 422)

    const supabase = createAdminSupabase()
    const { data: rawFood, error: readError } = await supabase
      .from("LoggedFoodItem")
      .select(`${loggedColumns}, Message(status, userId, deletedAt), FoodItem(${foodColumns})`)
      .eq("id", loggedFoodItemId)
      .eq("userId", userId)
      .is("deletedAt", null)
      .maybeSingle()
    if (readError) throw readError
    const loggedFoodItem = rawFood as unknown as LoadedFood | null
    if (!loggedFoodItem) return failure("Food is unavailable", 404)
    if (loggedFoodItem.status === "Needs Processing") return failure("Food is still processing", 409)
    if (loggedFoodItem.messageId !== null &&
        (!loggedFoodItem.Message || loggedFoodItem.Message.userId !== userId ||
          loggedFoodItem.Message.deletedAt ||
          ["PROCESSING", "RECEIVED", "SENDING"].includes(loggedFoodItem.Message.status))) {
      return failure("Meal is unavailable or still processing", 409)
    }

    const foodItemId = change.foodItemId ?? loggedFoodItem.foodItemId
    let foodItem: PortionFood | null = null
    if (foodItemId !== null) {
      if (foodItemId === loggedFoodItem.foodItemId) {
        foodItem = loggedFoodItem.FoodItem as unknown as PortionFood | null
      } else {
        const { data, error } = await supabase.from("FoodItem")
          .select(foodColumns).eq("id", foodItemId).maybeSingle()
        if (error) throw error
        foodItem = data as unknown as PortionFood | null
      }
      if (!foodItem || (foodItem.userId && foodItem.userId !== userId)) {
        return failure("Food item is unavailable", 404)
      }
      if (foodItem.defaultServingWeightGram !== null && foodItem.defaultServingWeightGram <= 0) {
        return failure("Food item has an invalid serving weight", 422)
      }
    }
    if (change.servingId !== undefined && change.servingId !== null) {
      const serving = foodItem?.Serving?.find(item => item.id === change.servingId)
      if (!serving || serving.foodItemId !== foodItemId ||
          (change.loggedUnit !== undefined && change.loggedUnit !== null && change.loggedUnit !== serving.servingName)) {
        return failure("Serving does not belong to this food", 422)
      }
    }
    if (!foodItem && (!Number.isFinite(loggedFoodItem.grams) || loggedFoodItem.grams <= 0)) {
      return failure("Original portion is invalid", 422)
    }

    const nutrients: Partial<Record<(typeof nutrientFields)[number], number>> = foodItem
      ? calculateNutrientData(change.grams, foodItem)
      : Object.fromEntries(nutrientFields.flatMap(field => {
          const previous = loggedFoodItem[field]
          return typeof previous === "number" && loggedFoodItem.grams > 0
            ? [[field, previous * change.grams / loggedFoodItem.grams]] : []
        }))
    if (Object.values(nutrients).some(value => !Number.isFinite(value))) {
      return failure("Calculated nutrition is invalid", 422)
    }

    // Recheck ownership, deletion and the version at the actual write. A second
    // device or worker may have changed this row after the earlier read.
    let write = supabase.from("LoggedFoodItem")
      .update({ ...change, ...nutrients, foodItemId })
      .eq("id", loggedFoodItemId)
      .eq("userId", userId)
      .is("deletedAt", null)
      .eq("updatedAt", loggedFoodItem.updatedAt)
    write = loggedFoodItem.messageId === null
      ? write.is("messageId", null) : write.eq("messageId", loggedFoodItem.messageId)
    write = loggedFoodItem.status === null
      ? write.is("status", null) : write.eq("status", loggedFoodItem.status)
    const { data: updated, error: updateError } = await write.select().maybeSingle()
    if (updateError) throw updateError
    if (!updated) return failure("Food changed while saving. Refresh and retry.", 409)
    return NextResponse.json(updated)
  } catch (error) {
    console.error("Error updating logged food serving:", error)
    return failure("Could not save the portion. Please retry.", 500)
  }
}
