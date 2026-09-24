import { FoodItemWithNutrientsAndServing } from "@/app/dashboard/utils/FoodHelper"
import { createAdminSupabase } from "@/utils/supabase/serverAdmin"
import { vectorToSql } from "@/utils/pgvectorHelper"
import { Tables } from "types/supabase"
import { assignDefaultServingAmount } from "@/foodMessageProcessing/common/assignDefaultServingAmount"
import { completeMissingFoodInfo } from "../completeMissingFoodInfo/completeMissingFoodInfo"
import { classifyFoodCategoryQueue } from "@/app/api/queues/classify-food-category/classify-food-category"

function compareFoodItemsByName(
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

// Function to check if there are missing serving info
function hasMissingServingInfo(food: FoodItemWithNutrientsAndServing): boolean {
  return (
    food.Serving?.some(
      (serving) =>
        serving.servingWeightGram === null ||
        serving.servingWeightGram === undefined ||
        serving.servingWeightGram === 0 ||
        serving.servingName === null ||
        serving.servingName === ""
    ) ?? false
  )
}

function deepCompare(obj1: any, obj2: any, ignoreKeys: string[] = ['id']): boolean {
  // If objects are not the same type, return false
  if (typeof obj1 !== typeof obj2) {
      return false;
  }
  // If both are null or undefined, return true
  if (obj1 === null && obj2 === null) {
      return true;
  }
  // Compare primitives directly
  if (typeof obj1 !== 'object' || typeof obj2 !== 'object') {
      return obj1 === obj2;
  }
  // Compare arrays recursively
  if (Array.isArray(obj1) && Array.isArray(obj2)) {
      if (obj1.length !== obj2.length) {
          return false;
      }
      for (let i = 0; i < obj1.length; i++) {
          if (!deepCompare(obj1[i], obj2[i], ignoreKeys)) {
              return false;
          }
      }
      return true;
  }
  // Compare objects recursively
  const keys1 = Object.keys(obj1).filter(key => !ignoreKeys.includes(key));
  const keys2 = Object.keys(obj2).filter(key => !ignoreKeys.includes(key));
  if (keys1.length !== keys2.length) {
      return false;
  }
  for (let key of keys1) {
      if (!keys2.includes(key) || !deepCompare(obj1[key], obj2[key], ignoreKeys)) {
          return false;
      }
  }
  return true;
}

function getFieldsToUpdate<T>(
  existingObject: Partial<T>,
  newObject: Partial<T>,
  fieldsToIgnore: (keyof T)[] = []
): Partial<T> {
  const fieldsToUpdate: Partial<T> = {};

  for (const key in newObject) {
    if (newObject.hasOwnProperty(key)) {
      const newValue = newObject[key as keyof T];
      const existingValue = existingObject[key as keyof T];

      if (
        newValue !== null &&
        newValue !== existingValue &&
        !fieldsToIgnore.includes(key as keyof T)
      ) {
        fieldsToUpdate[key as keyof T] = newValue;
      }
    }
  }

  return fieldsToUpdate;
}

async function compareAndUpdateFoodItem(
  existingFoodItem: FoodItemWithNutrientsAndServing,
  newFoodItem: FoodItemWithNutrientsAndServing
): Promise<FoodItemWithNutrientsAndServing> {
  const supabase = createAdminSupabase();

  const { Serving: ___, Nutrient: ____, ...strippedExistingFoodItem } = existingFoodItem;
  const { Serving: _, Nutrient: __, ...strippedNewFoodItem } = newFoodItem;

  const fieldsToUpdate = getFieldsToUpdate(
    strippedExistingFoodItem,
    strippedNewFoodItem,
    ["id", "createdAtDateTime", "lastUpdated", "knownAs"]
  );

  if (Object.keys(fieldsToUpdate).length === 0) {
    return {...newFoodItem, id: existingFoodItem.id, Serving: existingFoodItem.Serving, Nutrient: existingFoodItem.Nutrient}
  } else {
    console.log("fieldsToUpdate", fieldsToUpdate);
  }

  const { data: updatedFoodItem, error } = await supabase
    .from("FoodItem")
    .update(fieldsToUpdate)
    .eq("id", existingFoodItem.id)
    .select()
    .single();

  if (error) {
    console.error("Error updating food item", error);
    throw error;
  }

  return {
    ...updatedFoodItem,
    id: existingFoodItem.id,
    Serving: existingFoodItem.Serving,
    Nutrient: existingFoodItem.Nutrient
  } as FoodItemWithNutrientsAndServing;
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
  if (compareFoodItemsByName(food, existingFoodItem as FoodItemWithNutrientsAndServing)) {
    console.log(`Food item ${food.name} already exists in the database - will return the existing food item ID: ${existingFoodItem.id}`)
    return compareAndUpdateFoodItem(existingFoodItem as FoodItemWithNutrientsAndServing, food as FoodItemWithNutrientsAndServing)
  }

  let existingFoodItemByExternalId: FoodItemWithNutrientsAndServing | null = null

  if (food.externalId && food.foodInfoSource) {
    const { data, error: errorByExternalId } = (await supabase
      .from("FoodItem")
      .select("*, Nutrient(*), Serving(*)")
      .eq("externalId", food.externalId)
      .eq("foodInfoSource", food.foodInfoSource)
      .limit(1)
      .single()) as { data: FoodItemWithNutrientsAndServing; error: any }

    existingFoodItemByExternalId = data
  }

  if (existingFoodItemByExternalId) {
    console.log(
      `Food item with externalId ${food.externalId} and foodInfoSource ${food.foodInfoSource} already exists in the database`
    )
    const updatedFoodItem = await compareAndUpdateFoodItem(existingFoodItemByExternalId, food)
    return existingFoodItemByExternalId
  }

  // Check for missing fields and complete them if necessary
  if (
    !food.defaultServingWeightGram ||
    food.weightUnknown ||
    (food.isLiquid && !food.defaultServingLiquidMl) ||
    hasMissingServingInfo(food)
  ) {
    console.log("Trying to complete missing fields")
    const completed = await completeMissingFoodInfo(food, user)
    if (!completed && (!food.defaultServingWeightGram || food.weightUnknown || hasMissingServingInfo(food))) {
      throw new Error("Required serving weight could not be sourced")
    }
    food = completed || food
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

  // Insert the food item
  const { data: newFood, error: insertError } = (await supabase
    .from("FoodItem")
    .insert({
      ...foodWithoutId,
      messageId: messageId,
      bgeBaseEmbedding: embeddingSql,
      foodItemCategoryID: null,
      foodItemCategoryName: null
    })
    .select()
    .single()) as { data: Tables<"FoodItem">; error: any }

  if (insertError) {
    console.error("(addFoodItemToDatabase) Error inserting food item", insertError)
    throw insertError
  }
  // console.log("Insert FoodItem result error:", insertError)

  if (newFood) {
    const { error: addNutrientsError } = await supabase.from("Nutrient").insert(
      food.Nutrient.map((nutrient: any) => ({
        foodItemId: newFood.id,
        nutrientName: nutrient.nutrientName,
        nutrientUnit: nutrient.nutrientUnit,
        nutrientAmountPerDefaultServing: nutrient.nutrientAmountPerDefaultServing
      }))
    )

    if (addNutrientsError) console.error("Error adding nutrients", addNutrientsError)
    const servingsToInsert = food.Serving.map((serving: any) => ({
      foodItemId: newFood.id,
      defaultServingAmount: serving.defaultServingAmount !== "" ? serving.defaultServingAmount : null,
      servingWeightGram: serving.servingWeightGram,
      servingAlternateAmount: serving.servingAlternateAmount !== "" ? serving.servingAlternateAmount : null,
      servingAlternateUnit: serving.servingAlternateUnit !== "" ? serving.servingAlternateUnit : null,
      servingName: serving.servingName
    }))

    const { error: addServingsError } = await supabase.from("Serving").insert(servingsToInsert)

    if (addServingsError) {
      console.error("Error adding servings (addFoodItemToDatabase)", addServingsError)
      console.log("Item to insert", servingsToInsert)
    }
  }
  // If insert is successful, query the inserted item including its subtables
  const { data: newFoodWithServings, error: selectError } = await supabase
    .from("FoodItem")
    .select(`*, Nutrient(*), Serving(*)`)
    .eq("id", newFood.id)
    .single()

  // const { data: servings, error: selectServingError } = await supabase.from("Serving").select().eq("foodItemId", newFood.id)
  // console.log("servings:", servings)

  if (selectError) {
    console.error("Error fetching food item details", selectError)
    throw selectError
  }

  // Enrich after the food and its servings exist. Failure to enqueue cannot
  // turn an otherwise valid food insertion into a failed meal log.
  try { await classifyFoodCategoryQueue.enqueue(String(newFood.id)) }
  catch { console.error("Food saved, but category enrichment could not be queued", {foodId:newFood.id}) }

  // Optionally handle the Nutrient and Serving insertions here if they are not part of the initial creation

  return newFoodWithServings as FoodItemWithNutrientsAndServing
}
