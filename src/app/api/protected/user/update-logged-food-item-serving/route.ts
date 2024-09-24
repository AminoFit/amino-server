// src/app/api/protected/user/update-logged-food-item-serving/route.ts
import { NextRequest, NextResponse } from "next/server"
import { GetAminoUserOnRequest } from "@/utils/supabase/GetUserFromRequest"
import { calculateNutrientData } from "@/foodMessageProcessing/common/calculateNutrientData"
import { createClient } from "@supabase/supabase-js"
import { Tables } from "types/supabase"
import { FoodItemWithNutrientsAndServing } from "@/app/dashboard/utils/FoodHelper"

export const dynamic = "force-dynamic"

// Initialize Supabase client
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

// Define nutrient fields
const nutrientFields = [
    "addedSugarG", "alcoholG", "caffeineMg", "calciumMg", "carbG", "cholesterolMg", 
    "copperMg", "fiberG", "iodineMcg", "ironMg", "kcal", "magnesiumMg", "manganeseMg", 
    "monounsatFatG", "omega3Mg", "omega6Mg", "phosphorusMg", "polyunsatFatG", "potassiumMg", 
    "proteinG", "satFatG", "seleniumMcg", "sodiumMg", "sugarG", "totalFatG", "transFatG", 
    "unsatFatG", "vitaminAMcg", "vitaminB12Mcg", "vitaminB1Mg", "vitaminB2Mg", "vitaminB3Mg", 
    "vitaminB5Mg", "vitaminB6Mg", "vitaminB7Mcg", "vitaminB9Mcg", "vitaminCMg", "vitaminDMcg", 
    "vitaminEMg", "vitaminKMcg", "waterMl", "zincMg"
  ];

type NutrientFields = typeof nutrientFields[number];


export async function POST(request: NextRequest) {
  try {
    // 1. Authentication check
    const { aminoUser, error: aminoUserError } = await GetAminoUserOnRequest()
    if (aminoUserError || !aminoUser) {
      return new NextResponse(aminoUserError || "No amino user found", { status: 401 })
    }

    // 2. Get request body
    const { loggedFoodItemId, updateData } = await request.json()
    if (!loggedFoodItemId || !updateData) {
      return new NextResponse("Missing loggedFoodItemId or updateData", { status: 400 })
    }

    // 3. Fetch the logged food item
    const { data: loggedFoodItem, error: loggedFoodItemError } = await supabase
      .from("LoggedFoodItem")
      .select("*")
      .eq("id", loggedFoodItemId)
      .single() as { data: Tables<"LoggedFoodItem">; error: any }

    if (loggedFoodItemError || !loggedFoodItem) {
      return new NextResponse("Failed to fetch logged food item", { status: 404 })
    }

    // 4. Determine if foodItemId has changed
    const newFoodItemId = updateData.foodItemId || loggedFoodItem.foodItemId

    // 5. Fetch the FoodItem data
    let foodItem: FoodItemWithNutrientsAndServing | null = null

    if (newFoodItemId) {
      const { data: fetchedFoodItem, error: foodItemError } = await supabase
        .from("FoodItem")
        .select("*, Nutrient(*), Serving(*)")
        .eq("id", newFoodItemId)
        .single() as { data: FoodItemWithNutrientsAndServing; error: any }

      if (foodItemError || !fetchedFoodItem) {
        return new NextResponse("Failed to fetch food item", { status: 404 })
      }

      foodItem = fetchedFoodItem
    }

    // 6. Calculate new nutrients
    let newNutrients: Partial<Record<NutrientFields, number>> = {}

    if (foodItem) {
      newNutrients = calculateNutrientData(updateData.grams, foodItem)
    } else {
      // If we don't have a foodItemId, scale the previous nutrients
      const scaleFactor = updateData.grams / loggedFoodItem.grams
      newNutrients = nutrientFields.reduce((acc, field) => {
        if (field in loggedFoodItem && typeof loggedFoodItem[field as keyof Tables<"LoggedFoodItem">] === "number") {
          acc[field] = (loggedFoodItem[field as keyof Tables<"LoggedFoodItem">] as number) * scaleFactor
        }
        return acc
      }, {} as Record<NutrientFields, number>)
    }

    // 7. Prepare update data
    const updatedFields = {
      ...updateData,
      ...newNutrients,
      foodItemId: newFoodItemId,
    }

    // 8. Update the logged food item
    const { data: updatedLoggedFoodItem, error: updateError } = await supabase
      .from("LoggedFoodItem")
      .update(updatedFields)
      .eq("id", loggedFoodItemId)
      .select()
      .single()

    if (updateError) {
      return new NextResponse("Failed to update logged food item", { status: 500 })
    }

    return NextResponse.json(updatedLoggedFoodItem)
  } catch (error) {
    console.error("Error in update-logged-food-item-serving:", error)
    return new NextResponse("Internal server error", { status: 500 })
  }
}

// Uncomment the following line to run the test function
//   testUpdateLoggedFoodItem()
