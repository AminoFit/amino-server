import { FoodItemWithNutrientsAndServing } from "@/app/dashboard/utils/FoodHelper"
import { createAdminSupabase } from "@/utils/supabase/serverAdmin"
import { vectorToSql } from "@/utils/pgvectorHelper"
import { LinkIconsOrCreateIfNeeded } from "../foodIconsProcess"
import { Tables } from "types/supabase"
import { assignDefaultServingAmount } from "@/foodMessageProcessing/legacy/FoodAddFunctions/handleServingAmount"
import { completeMissingFoodInfo } from "../completeMissingFoodInfo"

function compareFoodItems(
  item1: FoodItemWithNutrientsAndServing | null,
  item2: FoodItemWithNutrientsAndServing | null
): boolean {
  // Check if either item is null
  if (item1 === null || item2 === null) {
    return false // Consider null items as not matching any other item
  }

  // Normalize the name and brand values to lowercase for case-insensitive comparison
  const name1 = item1.name.toLowerCase().trim()
  const name2 = item2.name.toLowerCase().trim()

  const brand1 = item1.brand?.toLowerCase().trim() || "" // Treat null or undefined as an empty string
  const brand2 = item2.brand?.toLowerCase().trim() || "" // Treat null or undefined as an empty string

  // Compare the normalized name and brand values
  return name1 === name2 && brand1 === brand2
}

export async function addFoodItemToDatabase(
  food: FoodItemWithNutrientsAndServing,
  bgeBaseEmbedding: number[],
  messageId: number,
  user: Tables<"User">
): Promise<FoodItemWithNutrientsAndServing> {
  // Check if a food item with the same name and brand already exists

  const supabase = createAdminSupabase()

  const { data: existingFoodItem, error } = (await supabase
    .from("FoodItem")
    .select("*, Nutrient(*), Serving(*)")
    .ilike("name", `%${food.name}%`)
    .or(`brand.ilike.%${food.brand || ""}%,brand.is.null`)
    .limit(1)
    .single()) as { data: FoodItemWithNutrientsAndServing; error: any }

  // If it exists, return the existing food item ID
  if (compareFoodItems(food, existingFoodItem as FoodItemWithNutrientsAndServing)) {
    console.log(`Food item ${food.name} already exists in the database`)
    return existingFoodItem as FoodItemWithNutrientsAndServing
  }

  // If the food item is missing a field, complete it
  if (!food.defaultServingWeightGram || food.weightUnknown) {
    food = (await completeMissingFoodInfo(food, user)) || food
  }

  if (food.isLiquid && !food.defaultServingLiquidMl) {
    food = (await completeMissingFoodInfo(food, user)) || food
  }

  // Simplify the check for missing serving information
  const hasMissingServingInfo =
    food.Serving?.some(
      (serving) =>
        serving.servingAlternateAmount === null ||
        serving.servingAlternateAmount === undefined ||
        serving.servingAlternateUnit === null ||
        serving.servingAlternateUnit === undefined ||
        serving.servingWeightGram === null ||
        serving.servingWeightGram === undefined ||
        serving.servingWeightGram === 0 ||
        serving.servingName === null ||
        serving.servingName === ""
    ) ?? false // Use nullish coalescing to default to false if food.Serving is undefined

  if (hasMissingServingInfo) {
    food = (await completeMissingFoodInfo(food, user)) || food
  }

  // Format the servings using assignDefaultServingAmount
  food.Serving = assignDefaultServingAmount(food.Serving)

  // Omit the id field from the food object
  const { id, ...foodWithoutId } = food
  delete (foodWithoutId as any).Nutrient
  delete (foodWithoutId as any).Serving

  // Don't add the image from the external database. We create our own images
  delete (foodWithoutId as any).foodImageId

  // Save the vector to the database
  const embeddingArray = new Float32Array(bgeBaseEmbedding)
  const embeddingSql = vectorToSql(Array.from(embeddingArray))

  // CHRIS: Not sure this will work with the subtables. Might need to make multiple queries
  const { data: newFood, error: insertError } = await supabase
    .from("FoodItem")
    .insert({
      ...foodWithoutId,
      messageId: messageId,
      bgeBaseEmbedding: embeddingSql
    })
    .select(`*, Nutrient(*), Serving(*)`)
    .single()

  // console.log("Insert FoodItem result data:", newFood)

  if (insertError) {
    console.error("Error inserting food item", insertError)
    throw insertError
  }
  // console.log("Insert FoodItem result error:", insertError)

  if (newFood) {
    await LinkIconsOrCreateIfNeeded(newFood.id)
    const { error: addNutrientsError } = await supabase.from("Nutrient").insert(
      food.Nutrient.map((nutrient: any) => ({
        foodItemId: newFood.id,
        nutrientName: nutrient.nutrientName,
        nutrientUnit: nutrient.nutrientUnit,
        nutrientAmountPerDefaultServing: nutrient.nutrientAmountPerDefaultServing
      }))
    )

    if (addNutrientsError) console.error("Error adding nutrients", addNutrientsError)
    const { error: addServingsError } = await supabase.from("Serving").insert(
      food.Serving.map((serving: any) => ({
        foodItemId: newFood.id,
        defaultServingAmount: serving.defaultServingAmount,
        servingWeightGram: serving.servingWeightGram,
        servingAlternateAmount: serving.servingAlternateAmount,
        servingAlternateUnit: serving.servingAlternateUnit,
        servingName: serving.servingName
      }))
    )
    if (addServingsError) console.error("Error adding servings", addServingsError)
  }

  return newFood as FoodItemWithNutrientsAndServing
}
