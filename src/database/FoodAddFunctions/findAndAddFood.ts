import { getCompleteFoodInfo } from "@/FoodDbThirdPty/common/getCompleteFoodInfo"
import { foodSearchResultsWithSimilarityAndEmbedding } from "@/FoodDbThirdPty/common/commonFoodInterface"
import { FoodQuery, findNxFoodInfo } from "@/FoodDbThirdPty/nutritionix/findNxFoodInfo"
import { findFsFoodInfo } from "@/FoodDbThirdPty/fatsecret/findFsFoodInfo"
import { searchUsdaByEmbedding } from "@/FoodDbThirdPty/USDA/searchUsdaByEmbedding"
import { FoodItemWithNutrientsAndServing } from "@/app/dashboard/utils/FoodHelper"
import { createAdminSupabase } from "@/utils/supabase/serverAdmin"
import { vectorToSql } from "@/utils/pgvectorHelper"
import { getFoodEmbedding, foodToLogEmbedding } from "@/utils/foodEmbedding"
import { FoodItemToLog } from "@/utils/loggedFoodItemInterface"
import { FoodEmbeddingCache } from "@/utils/foodEmbedding"
import { foodItemCompletion } from "../../openai/customFunctions/foodItemCompletion"
import { FoodInfo, mapOpenAiFoodInfoToFoodItem } from "../../openai/customFunctions/foodItemInterface"
import { findBestFoodMatchExternalDb } from "../../openai/customFunctions/matchFoodItemtoExternalDb"
import { foodItemMissingFieldComplete } from "@/openai/customFunctions/foodItemMissingFieldComplete"
import { foodItemCompleteMissingServingInfo } from "@/openai/customFunctions/foodItemCompleteMissingServingInfo"
import { checkRateLimit } from "../../utils/apiUsageLogging"
import { constructFoodItemRequestString } from "../OpenAiFunctions/utils/foodLogHelper"
import { Tables } from "types/supabase"
import { assignDefaultServingAmount } from "./handleServingAmount"

// Used to determine if an item is a good match
const COSINE_THRESHOLD = 0.975
// used to determine if an item should be included in a compare list
const COSINE_THRESHOLD_LOW_QUALITY = 0.85

export const ONE_HOUR_IN_MS = 60 * 60 * 1000
export const ONE_DAY_IN_MS = 24 * ONE_HOUR_IN_MS

// Helper function to check if a number is a positive integer
function isPositiveInteger(value: any) {
  return typeof value === "number" && value > 0 && value % 1 === 0
}

// Helper function to check if a string is non-empty
function isNonEmptyString(value: any) {
  return typeof value === "string" && value.trim().length > 0
}

// Main check function
function checkIfEmptyServings(servings: Tables<"Serving">[]) {
  for (const serving of servings || []) {
    if (
      !isPositiveInteger(serving.servingWeightGram) ||
      !isPositiveInteger(serving.servingAlternateAmount) ||
      !isNonEmptyString(serving.servingName) || // Check for non-empty servingName
      !isNonEmptyString(serving.servingAlternateUnit)
    ) {
      return true
    }
  }
  return false
}

async function addFoodItemToDatabase(
  food: FoodItemWithNutrientsAndServing,
  bgeBaseEmbedding: number[],
  messageId: number,
  user: Tables<"User">
): Promise<FoodItemWithNutrientsAndServing> {
  // Check if a food item with the same name and brand already exists

  const supabase = createAdminSupabase()

  const { data: existingFoodItem, error } = await supabase
    .from("FoodItem")
    .select("*, Nutrient(*), Serving(*)")
    .ilike("name", `%${food.name}%`)
    .or(`brand.ilike.%${food.brand || ""}%,brand.is.null`)
    .limit(1)
    .single()

  // If it exists, return the existing food item ID
  if (existingFoodItem) {
    return existingFoodItem as FoodItemWithNutrientsAndServing
  }

  // If the food item is missing a field, complete it
  if (!food.defaultServingWeightGram || food.weightUnknown) {
    food = await foodItemMissingFieldComplete(food as FoodItemWithNutrientsAndServing, user)
  }

  // Check for missing servingAlternateAmount and servingAlternateUnit in servings
  for (const serving of food.Serving || []) {
    if (
      serving.servingAlternateAmount === null ||
      serving.servingAlternateAmount === undefined ||
      serving.servingAlternateUnit === null ||
      serving.servingAlternateUnit === undefined
    ) {
      food = await foodItemCompleteMissingServingInfo(food, user)
      break
    }
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

export async function findAndAddItemInDatabase(
  foodToLog: FoodItemToLog,
  queryEmbeddingCache: FoodEmbeddingCache,
  user: Tables<"User">,
  messageId: number
): Promise<FoodItemWithNutrientsAndServing> {
  console.log("food", foodToLog)

  try {
    // Create a new variable based off the user_food_descriptive_name or full_name
    let fullFoodName = foodToLog.food_database_search_name

    // Append the brand name if it is not present in the original string
    if (foodToLog.branded && foodToLog.brand && !fullFoodName.toLowerCase().includes(foodToLog.brand.toLowerCase())) {
      fullFoodName += ` - ${foodToLog.brand}`
    }

    // Construct the query for findNxFoodInfo
    const foodQuery: FoodQuery = {
      food_name: foodToLog.food_database_search_name,
      food_full_name: fullFoodName,
      branded: foodToLog.branded || false,
      queryBgeBaseEmbedding: queryEmbeddingCache.bge_base_embedding!
    }

    const foodInfoResponses: foodSearchResultsWithSimilarityAndEmbedding[] = []

    const getNxFoodInfo = async () => {
      const startTime = Date.now() // Capture start time
      if (await checkRateLimit("nutritionix", 45, ONE_DAY_IN_MS)) {
        try {
          const result = await findNxFoodInfo(foodQuery)
          console.log("Time taken for Nutritionix API:", Date.now() - startTime, "ms") // Log the time taken
          return result
        } catch (err) {
          console.log("Error finding NX food info", err) // Silently fail
          return null
        }
      }
      return null
    }

    const getUsdaFoodInfo = async () => {
      const startTime = Date.now()
      try {
        const usda_find_food_params = {
          food_name: fullFoodName,
          branded: foodToLog.branded || false,
          brand_name: foodToLog.brand || undefined,
          embedding_cache_id: queryEmbeddingCache.embedding_cache_id
        }
        // console.log("usda_find_food_params", usda_find_food_params)
        const result = await searchUsdaByEmbedding(usda_find_food_params)
        console.log("result", result)
        console.log("Time taken for USDA API:", Date.now() - startTime, "ms") // Log the time taken
        return result
      } catch (err) {
        console.log("Error finding USDA food info", err) // Silently fail
        return null
      }
    }

    const getFsFoodInfo = async () => {
      const startTime = Date.now()
      if (await checkRateLimit("fatsecret", 10000, ONE_HOUR_IN_MS)) {
        try {
          const result = await findFsFoodInfo({
            search_expression: fullFoodName,
            branded: foodToLog.branded || false,
            queryBgeBaseEmbedding: queryEmbeddingCache.bge_base_embedding!
          })
          console.log("Time taken for FatSecret API:", Date.now() - startTime, "ms") // Log the time taken
          return result
        } catch (err) {
          console.log("Error finding FatSecret food info", err)
          return null
        }
      }
      return null
    }

    const nullReturn = async () => {
      let DEBUG = 1
      if (DEBUG) {
        return null
      } else {
        return [
          {
            foodBgeBaseEmbedding: [],
            similarityToQuery: 0,
            foodSource: "User",
            foodName: ""
          } as foodSearchResultsWithSimilarityAndEmbedding
        ]
      }
    }

    // Dispatch all API calls simultaneously
    const [nxFoodInfoResponse, usdaFoodInfoResponse, fatSecretInfoResponse] = await Promise.all([
      getNxFoodInfo(),
      getUsdaFoodInfo(),
      getFsFoodInfo()
    ])

    if (nxFoodInfoResponse != null && nxFoodInfoResponse.length > 0) {
      foodInfoResponses.push(...nxFoodInfoResponse)
    }

    if (usdaFoodInfoResponse != null) {
      foodInfoResponses.push(...usdaFoodInfoResponse)
    }

    if (fatSecretInfoResponse != null) {
      foodInfoResponses.push(...fatSecretInfoResponse)
    }

    // Check if the consolidated array is empty
    if (foodInfoResponses.length === 0) {
      console.error("All food sources returned no results.")
      // You can throw an error or return a default value here
      throw new Error("No food information found.")
    }
    // Find the item with the highest similarity score
    let highestSimilarityItem: foodSearchResultsWithSimilarityAndEmbedding | null = foodInfoResponses.reduce(
      (prev, current) => {
        return prev.similarityToQuery > current.similarityToQuery ? prev : current
      },
      foodInfoResponses[0]
    )
    // Sort the foodInfoResponses array in descending order based on similarityToQuery
    foodInfoResponses.sort((a, b) => b.similarityToQuery - a.similarityToQuery)

    // Iterate over the sorted array and print the desired information
    foodInfoResponses.forEach((item, index) => {
      const brandInfo = item.foodBrand ? ` by ${item.foodBrand}` : ""
      console.log(
        `Item ${index + 1}: ${item.foodName}${brandInfo} - Similarity ${item.similarityToQuery} - Source: ${
          item.foodSource
        }`
      )
    })

    // Start by finding the highest similarity item.
    highestSimilarityItem = foodInfoResponses.reduce((prev, current) => {
      return prev.similarityToQuery > current.similarityToQuery ? prev : current
    }, foodInfoResponses[0])

    // Check the highest similarity score
    if (highestSimilarityItem.similarityToQuery <= COSINE_THRESHOLD) {
      const betterMatchItem = await findBestFoodMatchExternalDb(user, foodToLog, foodInfoResponses)
      if (betterMatchItem) {
        highestSimilarityItem = betterMatchItem
      } else {
        highestSimilarityItem = null // Set to null so we can use fallback logic
      }
    }

    // If we have an item check is we are missing a field
    if (highestSimilarityItem) {
      //console.log("Highest similarity item:", highestSimilarityItem!.foodName)
      //console.dir(highestSimilarityItem, { depth: null })
      // Ensure we have the full food item info
      highestSimilarityItem.foodItem = await getCompleteFoodInfo(highestSimilarityItem)

      //console.log("highestSimilarityItem.food", highestSimilarityItem.foodItem)

      let foodItemToSave: FoodItemWithNutrientsAndServing =
        highestSimilarityItem.foodItem! as FoodItemWithNutrientsAndServing

      const newFood = await addFoodItemToDatabase(
        foodItemToSave,
        highestSimilarityItem.foodBgeBaseEmbedding,
        messageId,
        user
      )
      return newFood
    }

    // If we didn't find a match we then rely on GPT-4
    const foodItemCompletionStartTime = Date.now() // Capture start time

    // Fetch complete food info for the top 3 items
    const top3PopulatedFoodItems = await Promise.all(
      foodInfoResponses.slice(0, 3).map(async (item) => {
        item.foodItem = await getCompleteFoodInfo(item)
        return item
      })
    )

    // Construct the request string
    const foodItemRequestString = constructFoodItemRequestString(foodToLog, top3PopulatedFoodItems)
    console.log("foodItemRequestString:\n", foodItemRequestString)
    const { foodItemInfo, model } = await foodItemCompletion(foodItemRequestString, user)
    console.log("Time taken for foodItemCompletion:", Date.now() - foodItemCompletionStartTime, "ms")

    let food: FoodInfo = foodItemInfo
    console.log("food req string:\n", foodItemRequestString)
    const llmFoodItemToSave = mapOpenAiFoodInfoToFoodItem(food, model) as FoodItemWithNutrientsAndServing
    const newFood = await addFoodItemToDatabase(
      llmFoodItemToSave,
      await getFoodEmbedding(llmFoodItemToSave),
      messageId,
      user
    )

    return newFood
  } catch (err) {
    console.log("Error getting food item info", err)
    throw err
  }
}

async function testFoodSearch() {
  const foodItem: FoodItemToLog = {
    food_database_search_name: "Albacore Tuna canned from 365 Whole Foods",
    full_item_user_message_including_serving: "1 can of Albacore Tuna canned from 365 Whole Foods",
    brand: "365 Whole Foods",
    branded: true,
    serving: {
      serving_id: 1,
      serving_amount: 1,
      serving_name: "cup",
      serving_g_or_ml: "g",
      total_serving_g_or_ml: 100
    }
  }
  const queryEmbedding = await foodToLogEmbedding(foodItem)
  const user: Tables<"User"> = {
    id: "clmzqmr2a0000la08ynm5rjju",
    fullName: "John",
    email: "john.doe@example.com",
    phone: "123-456-7890",
    weightKg: 70.5,
    heightCm: 180,
    calorieGoal: 2000,
    proteinGoal: 100,
    carbsGoal: 200,
    fatGoal: 50,
    fitnessGoal: "Maintain",
    unitPreference: "IMPERIAL",
    setupCompleted: false,
    sentContact: false,
    sendCheckins: false,
    tzIdentifier: "America/New_York",
    avatarUrl: null,
    dateOfBirth: null,
    emailVerified: null,
    activityLevel: null
  } as Tables<"User">
  //console.dir(queryEmbedding, { depth: null })
  let result = await findAndAddItemInDatabase(foodItem, queryEmbedding, user, 1)
  console.dir(result, { depth: null })
}

async function testAddFoodToDatabase() {
  const user = {} as Tables<"User">
  let food = {
    id: 0,
    createdAtDateTime: "2023-12-21T19:53:17.075Z",
    UPC: null,
    externalId: "64c6442161f9690007f802d6",
    name: "Fat Free Ultra-Filtered Milk",
    brand: "Fairlife",
    knownAs: [],
    description: null,
    weightUnknown: false,
    defaultServingWeightGram: null,
    defaultServingLiquidMl: 240,
    isLiquid: true,
    kcalPerServing: 80,
    totalFatPerServing: 0,
    satFatPerServing: 0,
    transFatPerServing: 0,
    carbPerServing: 6,
    fiberPerServing: 0,
    sugarPerServing: 6,
    addedSugarPerServing: 0,
    proteinPerServing: 13,
    lastUpdated: "2023-12-21T19:53:17.075Z",
    verified: true,
    userId: null,
    adaEmbedding: null,
    bgeBaseEmbedding: null,
    foodImageId: null,
    foodInfoSource: "NUTRITIONIX",
    messageId: null,
    Serving: [
      {
        id: 0,
        foodItemId: 0,
        defaultServingAmount: null,
        servingWeightGram: null,
        servingAlternateUnit: "cup",
        servingAlternateAmount: 1,
        servingName: "1 cup"
      }
    ],
    Nutrient: [
      {
        id: 0,
        foodItemId: 0,
        nutrientName: "Cholesterol",
        nutrientUnit: "mg",
        nutrientAmountPerDefaultServing: 5
      },
      {
        id: 0,
        foodItemId: 0,
        nutrientName: "Sodium",
        nutrientUnit: "mg",
        nutrientAmountPerDefaultServing: 120
      },
      {
        id: 0,
        foodItemId: 0,
        nutrientName: "Potassium",
        nutrientUnit: "mg",
        nutrientAmountPerDefaultServing: 400
      }
    ]
  } as FoodItemWithNutrientsAndServing

  // If the food item is missing a field, complete it
  if (!food.defaultServingWeightGram || food.weightUnknown) {
    console.log("Missing weight!")
    food = await foodItemMissingFieldComplete(food as FoodItemWithNutrientsAndServing, user)
  }

  console.log("food", food)

  if (checkIfEmptyServings(food.Serving)) {
    console.log("Missing serving info!")
    food = await foodItemCompleteMissingServingInfo(food, user)
  }
  console.log("food", food)
}

async function cleanupServingsInDatabase(foodItemIds: number[], user: Tables<"User">) {
  const supabase = createAdminSupabase()

  for (const foodItemId of foodItemIds) {
    // Fetch the food item along with its servings
    const { data: foodItem, error } = await supabase
      .from("FoodItem")
      .select("*, Serving(*), Nutrient(*)")
      .eq("id", foodItemId)
      .single()

    if (error) {
      console.error(`Error fetching food item ${foodItemId}:`, error)
      continue
    }

    // Check if the servings are complete
    if (checkIfEmptyServings(foodItem.Serving)) {
      console.log(`Incomplete servings for food item ${foodItemId}. Completing...`)

      // Complete the missing serving information
      let updatedFoodItem = await foodItemCompleteMissingServingInfo(foodItem, user)

      updatedFoodItem.Serving = assignDefaultServingAmount(updatedFoodItem.Serving)

      // Update the servings in the database
      for (const serving of updatedFoodItem.Serving) {
        const { error: updateError } = await supabase
          .from("Serving")
          .update({
            defaultServingAmount: serving.defaultServingAmount,
            servingWeightGram: serving.servingWeightGram,
            servingAlternateAmount: serving.servingAlternateAmount,
            servingAlternateUnit: serving.servingAlternateUnit,
            servingName: serving.servingName
          })
          .eq("id", serving.id)

        if (updateError) {
          console.error(`Error updating serving ${serving.id} for food item ${foodItemId}:`, updateError)
        }
      }

      console.log(`Servings updated for food item ${foodItemId}`)
    } else {
      console.log(`Servings are complete for food item ${foodItemId}`)
    }
  }
}

async function testFoodMissing() {
  const foodItem = {
    id: 0,
    createdAtDateTime: "2023-12-22T03:16:20.207Z",
    UPC: null,
    externalId: "62f3908b0082cc0006d94eea",
    name: "Beer, Hazy Juicy Pale Ale, Moon Haze",
    brand: "Blue Moon",
    knownAs: [],
    description: null,
    weightUnknown: false,
    defaultServingWeightGram: null,
    defaultServingLiquidMl: 354.882,
    isLiquid: true,
    kcalPerServing: 180,
    totalFatPerServing: 0,
    satFatPerServing: null,
    transFatPerServing: null,
    carbPerServing: 15.100000381469727,
    fiberPerServing: null,
    sugarPerServing: null,
    addedSugarPerServing: null,
    proteinPerServing: 2.299999952316284,
    lastUpdated: "2023-12-22T03:16:20.207Z",
    verified: true,
    userId: null,
    adaEmbedding: null,
    bgeBaseEmbedding: null,
    foodImageId: null,
    foodInfoSource: "NUTRITIONIX",
    messageId: null,
    Serving: [
      {
        id: 0,
        foodItemId: 0,
        defaultServingAmount: null,
        servingWeightGram: null,
        servingAlternateUnit: "ml",
        servingAlternateAmount: 354.882,
        servingName: "12 fl oz"
      }
    ],
    Nutrient: []
  } as FoodItemWithNutrientsAndServing

  let foodItemToSave: FoodItemWithNutrientsAndServing;
  if (checkIfEmptyServings(foodItem.Serving)) {
    console.log("Missing serving info!")
    foodItemToSave = await foodItemCompleteMissingServingInfo(foodItem, {} as Tables<"User">)
    console.log("foodItemToSave", foodItemToSave)
  }

}
async function cleanupServingsDefaultInDatabase(): Promise<void> {
  const ids = [39,45,91,92,90,109,138,230,319,345,346,1223,410,411,412,413,414,425,450,451,452,453,454,455,517,518,532,584,585,586,587,613,623,655,661,662,686,687,688,689,690,691,694,704,705,706,707,708,709,732,738,768,769,778,779,782,796,809,810,814,815,820,822,823,824,825,826,827,828,861,887,888,889,895,896,897,898,899,903,904,913,917,821,973,983,998,999,1000,1026,1040,1041,1108,1072,1073,1091,1092,1093,1094,1095,1096,1107,1110,1130,1131,1139,1140,1160,1182,1175]
  const supabase = createAdminSupabase()
  // Fetch servings that start with a number followed by a space
  const { data: servings, error } = await supabase
  .from('Serving')
  .select('*')
  .in('id', ids)

  if (error) {
    console.error('Error fetching servings:', error);
    return;
  }

  if (!servings) {
    console.log('No servings found.');
    return;
  }
  console.log('Servings found:', servings.length);
  // console.log('Servings:', servings);
  // Apply assignDefaultServingAmount to each serving
  const updatedServings = assignDefaultServingAmount(servings);

  console.log('Servings to update:', updatedServings);

  // throw new Error("Not implemented")

  // Update the servings in the database in batches
  const batchSize = 500; // Define a suitable batch size
  for (let i = 0; i < updatedServings.length; i += batchSize) {
    const batch = updatedServings.slice(i, i + batchSize);

    // Use a transaction to update in batches
    const updates = batch.map(serving =>
      supabase
        .from('Serving')
        .update({
          defaultServingAmount: serving.defaultServingAmount,
          servingName: serving.servingName,
        })
        .eq('id', serving.id)
    );

    const responses = await Promise.all(updates);

    // Handle response errors
    responses.forEach(response => {
      if (response.error) {
        console.error('Error updating servings:', response.error);
      }
    });
  }

  console.log('Servings updated successfully.');
}
// testFoodMissing()
//   const user = {} as Tables<"User">
//food id 380
//11, 65, 93, 222, 268, 287, 316
//   cleanupServingsInDatabase([65, 93, 222, 268, 287, 316], user)
