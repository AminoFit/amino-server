// OpenAI
import { findBestServingMatchInstruct } from "../../foodMessageProcessing/legacy/servingMatchRequestInstruct"
import { findBestServingMatchFunction } from "../../foodMessageProcessing/legacy/servingMatchRequestFunction"
import { findBestFoodMatchtoLocalDb } from "../../foodMessageProcessing/matchFoodItemToLocalDb"
import { FoodItemIdAndEmbedding } from "./utils/foodLoggingTypes"

// Utils
import { foodToLogEmbedding, FoodEmbeddingCache, getFoodEmbedding } from "../../utils/foodEmbedding"
import { FoodItemToLog } from "@/utils/loggedFoodItemInterface"
import { isServerTimeData } from "@/foodMessageProcessing/common/processFoodItemsUtils"

// App
import { FoodItemWithNutrientsAndServing } from "../../app/dashboard/utils/FoodHelper"
import { ONE_DAY_IN_MS, ONE_HOUR_IN_MS } from "@/foodMessageProcessing/common/foodProcessingConstants"
// Database
import UpdateMessage from "@/database/UpdateMessage"
import { createServerActionClient } from "@supabase/auth-helpers-nextjs"
import { cookies } from "next/headers"
import { Tables } from "types/supabase"
import { createAdminSupabase } from "@/utils/supabase/serverAdmin"
import { Database } from "types/supabase-generated.types"
import { processFoodItemQueue } from "@/app/api/queues/process-food-item/process-food-item"
import { generateFoodIconQueue } from "@/app/api/queues/generate-food-icon/generate-food-icon"
import { foodItemMissingFieldComplete } from "@/foodMessageProcessing/legacy/foodItemMissingFieldComplete"
import { foodItemCompleteMissingServingInfo } from "@/foodMessageProcessing/legacy/foodItemCompleteMissingServingInfo"
import { vectorToSql } from "@/utils/pgvectorHelper"
import { FoodQuery, findNxFoodInfo } from "@/FoodDbThirdPty/nutritionix/findNxFoodInfo"
import { foodSearchResultsWithSimilarityAndEmbedding } from "@/FoodDbThirdPty/common/commonFoodInterface"
import { checkRateLimit } from "@/utils/apiUsageLogging"
import { searchUsdaByEmbedding } from "@/FoodDbThirdPty/USDA/searchUsdaByEmbedding"
import { findFsFoodInfo } from "@/FoodDbThirdPty/fatsecret/findFsFoodInfo"
import { findBestFoodMatchExternalDb } from "@/foodMessageProcessing/legacy/matchFoodItemtoExternalDb"
import { getCompleteFoodInfo } from "@/FoodDbThirdPty/common/getCompleteFoodInfo"
import { constructFoodItemRequestString } from "./utils/foodLogHelper"

import { foodItemCompletion } from "@/foodMessageProcessing/legacy/foodItemCompletion"
import { FoodInfo, mapOpenAiFoodInfoToFoodItem } from "@/foodMessageProcessing/legacy/foodItemInterface"

import { IconQueue } from "@/bull-queues/BullMqQueues"

// Used to determine if an item is a good match
const COSINE_THRESHOLD = 0.975
// used to determine if an item should be included in a compare list
const COSINE_THRESHOLD_LOW_QUALITY = 0.85

function constructFoodRequestString(foodToLog: FoodItemToLog) {
  let result = foodToLog.full_item_user_message_including_serving || foodToLog.food_database_search_name

  if (foodToLog.brand) {
    // Check if brand exists in full name
    if (result.toLowerCase().indexOf(foodToLog.brand.toLowerCase()) === -1) {
      result += " " + foodToLog.brand
    }
  }

  // Add serving details
  let servingDetails = ""
  if (foodToLog.serving) {
    if (foodToLog.serving.serving_amount) {
      servingDetails += foodToLog.serving.serving_amount + " " + foodToLog.serving.serving_name
    }

    if (foodToLog.serving.serving_amount && foodToLog.serving.total_serving_g_or_ml) {
      servingDetails += " - "
    }

    if (foodToLog.serving.total_serving_g_or_ml) {
      servingDetails += foodToLog.serving.total_serving_g_or_ml + "g"
    }

    if (servingDetails) {
      result += " (" + servingDetails + ")"
    }
  }

  return result
}



async function updateLoggedFoodItem(loggedFoodItemId: number, data: any): Promise<Tables<"LoggedFoodItem"> | null> {
  const supabase = createAdminSupabase()

  const { data: serverTimeData, error: serverTimeError } = await supabase.rpc("get_current_timestamp")

  if (serverTimeError) {
    console.log("serverTimeError error:", serverTimeError)
    throw serverTimeError
  }

  // Extract the timestamp from the server's response
  console.log("serverTimeData", serverTimeData, "is it server time data?", isServerTimeData(serverTimeData))
  const timestamp = isServerTimeData(serverTimeData)
    ? new Date(serverTimeData.current_timestamp).toISOString()
    : new Date().toISOString()

  // Add the timestamp to the data object for updating the updatedAt field
  data.updatedAt = timestamp

  const { data: result, error } = await supabase
    .from("LoggedFoodItem")
    .update(data)
    .eq("id", loggedFoodItemId)
    .select()
    .single()
  if (error) {
    console.log("logFoodItem error:", error)
    throw error
  }

  return result
}


async function LinkIconsOrCreateIfNeeded(foodItemId: number): Promise<void> {
  const supabase = createAdminSupabase()

  let { data: closestIcons, error } = await supabase.rpc("get_top_foodicon_embedding_similarity", {
    food_item_id: foodItemId
  })
  if (error) {
    console.error("Could not get top food icon embedding similarity")
    console.error(error)
    await SendRequestToGenerateIcons([foodItemId])
    return
  }

  if (closestIcons && closestIcons.length > 0) {
    if (closestIcons[0].cosine_similarity > 0.9) {
      // Link the icon
      await supabase
        .from("FoodItemImages")
        .insert([
          {
            foodItemId: foodItemId,
            foodImageId: closestIcons[0].food_icon_id
          }
        ])
        .select()
        .single()
      return
    }
  }
  await SendRequestToGenerateIcons([foodItemId])
}
export async function SendRequestToGenerateIcons(foodItemIds: number[]): Promise<void> {
  console.log("Sending request to generate icons", foodItemIds)
  await Promise.all(
    foodItemIds.map((foodItemId) => {
      return IconQueue.add(
        "Generate food icon",
        { foodItemId },
        {
          attempts: 3,
          backoff: {
            type: "exponential",
            delay: 1000
          }
        }
      )
    })
  )

  // const supabase = createAdminSupabase()
  // const data = foodItemIds.map((foodItemId) => {
  //   return { requested_food_item_id: foodItemId }
  // })
  // await Promise.all(foodItemIds.map((foodItemId) => {
  //   return IconQueue.add('Generate food icon', { requested_food_item_id: foodItemId });
  // })
  // const { data: iconQueue, error: iconError } = await supabase.from("IconQueue").insert(data).select()
  // await IconQueue.add('Generate food icons', { color: 'red' });

  // if (iconError) {
  //   console.error("Error adding to icon queue", iconError)
  // }
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

  // Omit the id field from the food object
  const { id, ...foodWithoutId } = food
  delete (foodWithoutId as any).Nutrient
  delete (foodWithoutId as any).Serving

  // Don't add the image from the external database. We create our own images
  delete (foodWithoutId as any).foodImageId

  // Save the vector to the database
  const embeddingArray = new Float32Array(bgeBaseEmbedding)
  const embeddingSql = vectorToSql(Array.from(embeddingArray))

  console.log("foodWithoutId", foodWithoutId)

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

async function findAndAddItemInDatabase(
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
        console.log("resultFood info", result)
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

    //console.dir(highestSimilarityItem, { depth: null });

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

// async function TestAdd() {
//   const food = {
//     name: "albacore tuna",
//     brand: ""
//   }
//   const supabase = createAdminSupabase()

//   const { data: existingFoodItem, error } = await supabase
//   .from("FoodItem")
//   .select("*, Nutrient(*), Serving(*)")
//   .ilike("name", `%${food.name}%`)
//   .or(`brand.ilike.%${food.brand || ""}%,brand.is.null`)
//   .limit(1)
//   .single()

//   console.log("existingFoodItem", existingFoodItem)
// }

// TestAdd()

// testFoodSearch()
