// FoodDbThirdPty
import { getCompleteFoodInfo } from "@/FoodDbThirdPty/common/getCompleteFoodInfo"
import { FoodQuery, findNxFoodInfo } from "@/FoodDbThirdPty/nutritionix/findNxFoodInfo"
import { findFsFoodInfo } from "@/FoodDbThirdPty/fatsecret/findFsFoodInfo"
import { foodSearchResultsWithSimilarityAndEmbedding } from "@/FoodDbThirdPty/common/commonFoodInterface"

// OpenAI
import { foodItemCompletion } from "../../openai/customFunctions/foodItemCompletion"
import { findBestServingMatchInstruct } from "../../openai/customFunctions/servingMatchRequestInstruct"
import { findBestServingMatchFunction } from "../../openai/customFunctions/servingMatchRequestFunction"
import { findBestFoodMatchExternalDb } from "../../openai/customFunctions/matchFoodItemtoExternalDb"
import { findBestFoodMatchtoLocalDb } from "../../openai/customFunctions/matchFoodItemToLocalDb"
import { foodItemMissingFieldComplete } from "../../openai/customFunctions/foodItemMissingFieldComplete"
import { foodItemCompleteMissingServingInfo } from "../../openai/customFunctions/foodItemCompleteMissingServingInfo"
import { FoodInfo, mapOpenAiFoodInfoToFoodItem } from "../../openai/customFunctions/foodItemInterface"
import { FoodItemIdAndEmbedding } from "./utils/foodLoggingTypes"

// Utils
import { checkRateLimit } from "../../utils/apiUsageLogging"
import { foodToLogEmbedding, FoodEmbeddingCache, getFoodEmbedding } from "../../utils/foodEmbedding"
import { vectorToSql } from "@/utils/pgvectorHelper"
import { FoodItemToLog } from "@/utils/loggedFoodItemInterface"
import { constructFoodItemRequestString } from "./utils/foodLogHelper"

// App
import { FoodItemWithNutrientsAndServing } from "../../app/dashboard/utils/FoodHelper"

// Database
import UpdateMessage from "@/database/UpdateMessage"
import { createServerActionClient } from "@supabase/auth-helpers-nextjs"
import { cookies } from "next/headers"
import { Tables } from "types/supabase"
import { createAdminSupabase } from "@/utils/supabase/serverAdmin"
import { Database } from "types/supabase-generated.types"
import { searchUsdaByEmbedding } from "@/FoodDbThirdPty/USDA/searchUsdaByEmbedding"
import { processFoodItemQueue } from "@/app/api/queues/process-food-item/process-food-item"
import { generateFoodIconQueue } from "@/app/api/queues/generate-food-icon/generate-food-icon"

const ONE_HOUR_IN_MS = 60 * 60 * 1000
const ONE_DAY_IN_MS = 24 * ONE_HOUR_IN_MS

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

/* export async function VerifyHandleLogFoodItems(parameters: any) {
  const foodItems: FoodItemToLog[] = parameters.food_items
  for (let food of foodItems) {
    // Ensure total_weight_grams is not 0
    if (food.serving.total_serving_g_or_ml === 0) {
      throw new Error("The value for total_weight_grams cannot be 0.")
    }
  }
} */

function isServerTimeData(data: any): data is { current_timestamp: number } {
  return data && typeof data === "object" && "current_timestamp" in data
}

export async function HandleLogFoodItems(user: Tables<"User">, parameters: any, lastUserMessageId: number) {
  console.log("parameters", parameters)

  const foodItemsToLog: FoodItemToLog[] = parameters.food_items

  const supabase = await createAdminSupabase()

  // Increment itemsToProcess by foodItemsToLog.length
  await supabase.from("Message").update({ itemsToProcess: foodItemsToLog.length }).eq("id", lastUserMessageId)

  const { data: serverTimeData, error: serverTimeError } = await supabase.rpc("get_current_timestamp")

  if (serverTimeError) {
    throw serverTimeError
  }

  // Extract the timestamp from the server's response
  const timestamp = isServerTimeData(serverTimeData)
    ? new Date(serverTimeData.current_timestamp).toISOString()
    : new Date().toISOString()
  console.log("serverTimeData", serverTimeData)
  // Create all the pending food items
  let { data: foodsNeedProcessing, error } = await supabase
    .from("LoggedFoodItem")
    .insert(
      foodItemsToLog.map((food) => {
        return {
          userId: user.id,
          createdAt: timestamp,
          updatedAt: timestamp,
          consumedOn: food.timeEaten ? new Date(food.timeEaten).toISOString() : new Date().toISOString(),
          messageId: lastUserMessageId,
          status: "Needs Processing",
          extendedOpenAiData: food as any
        }
      })
    )
    .select()

  if (error) {
    console.error("Foods need processing error", error)
  }

  console.log("foodsNeedProcessing", foodsNeedProcessing)

  foodsNeedProcessing = foodsNeedProcessing || []

  const results = []
  foodItemsToLog.forEach((food) => results.push(constructFoodRequestString(food)))

  // Add each pending food item to queue
  for (let food of foodsNeedProcessing) {
    console.log("Adding food item to queue:", food.id)
    await processFoodItemQueue.enqueue(
      `${food.id}` // job to be enqueued
      // { delay: "24h" } // scheduling options
    )

    // const targetUrl = `https://${process.env.VERCEL_URL}/api/process-food-item/${food.id}`
    // console.log("Target URL: ", targetUrl)

    // const fetchUrl = `https://api.serverlessq.com?id=${process.env.SERVERLESSQ_QUEUE_ID}&target=${targetUrl}`

    // const result = await fetch(fetchUrl, {
    //   headers: {
    //     Accept: "application/json",
    //     "x-api-key": process.env.SERVERLESSQ_API_TOKEN!
    //   }
    // })

    console.log(`Added food id to queue: ${food.id}`)
  }

  // Move process food items to POST route on serverlessq

  // const foodAddResultsPromises = []
  // for (let food of foodItemsToLog) {
  //   foodAddResultsPromises.push(HandleLogFoodItem(food, lastUserMessage, user))
  // }
  // const results = (await Promise.all(foodAddResultsPromises)) || []

  if (results.length === 0) {
    return "Sorry, I could not log your food items. Please try again later. E230"
  }

  results.unshift("We're logging your food. It might take a few mins for us to look up all the information:")

  return results.join(" ")
}
function printSearchResults(results: FoodItemIdAndEmbedding[]): void {
  console.log("Searching in database")
  console.log("__________________________________________________________")
  results.forEach((item) => {
    const similarity = item.cosine_similarity.toFixed(3)
    const description = item.brand ? `${item.name} - ${item.brand}` : item.name
    console.log(`Similarity: ${similarity} - Item: ${item.id} - ${description}`)
  })
}

async function findBestMatch(
  cosineSearchResults: FoodItemIdAndEmbedding[],
  food: FoodItemToLog,
  userQueryVectorCache: FoodEmbeddingCache,
  user: Tables<"User">,
  messageId: number
): Promise<FoodItemWithNutrientsAndServing> {
  // Filter items above the COSINE_THRESHOLD
  const bestMatches = cosineSearchResults.filter((item) => item.cosine_similarity >= COSINE_THRESHOLD)

  const supabase = createAdminSupabase()

  if (bestMatches.length) {
    // Return the highest match instantly

    const { data: match } = await supabase
      .from("FoodItem")
      .select(`*, Nutrient(*), Serving(*)`)
      .eq("id", bestMatches[0].id)
      .single()

    if (match) return match as FoodItemWithNutrientsAndServing
    throw new Error(`Failed to find FoodItem with id ${bestMatches[0].id}`)
  }

  // No items above COSINE_THRESHOLD, filter for items above COSINE_THRESHOLD_LOW_QUALITY
  const lowQualityMatches = cosineSearchResults.filter((item) => item.cosine_similarity >= COSINE_THRESHOLD_LOW_QUALITY)

  if (lowQualityMatches.length) {
    const top9Matches = lowQualityMatches.slice(0, 9)
    const localDbMatch = await findBestFoodMatchtoLocalDb(top9Matches, food, userQueryVectorCache, messageId, user)
    if (localDbMatch) {
      // Return the highest match instantly
      const { data: match } = await supabase
        .from("FoodItem")
        .select(`*, Nutrient(*), Serving(*)`)
        .eq("id", localDbMatch.id)
        .single()
      if (match) return match as FoodItemWithNutrientsAndServing
      throw new Error(`Failed to find FoodItem with id ${localDbMatch.id}`)
    }
  }

  // Fetch from external databases
  return await findAndAddItemInDatabase(food, userQueryVectorCache, user, messageId)
}

async function logFoodItem(loggedFoodItemId: number, data: any): Promise<Tables<"LoggedFoodItem"> | null> {
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

export async function HandleLogFoodItem(
  loggedFoodItem: Tables<"LoggedFoodItem">,
  food: FoodItemToLog,
  messageId: number,
  user: Tables<"User">
): Promise<string> {
  const supabase = createServerActionClient<Database>({ cookies })

  const userQueryVectorCache = await foodToLogEmbedding(food)

  let { data: cosineSearchResults, error } = await supabase.rpc("get_cosine_results", {
    p_embedding_cache_id: userQueryVectorCache.embedding_cache_id
  })

  if (!cosineSearchResults) cosineSearchResults = []

  if (error) {
    console.error(error)
  }

  //console.log("result", cosineSearchResults)

  // const cosineSearchResults = (await pris.$queryRaw`
  //   SELECT id, name, brand, "bgeBaseEmbedding"::text as embedding,
  //   1 - ("bgeBaseEmbedding" <=> (SELECT "bgeBaseEmbedding" FROM "foodEmbeddingCache" WHERE id = ${userQueryVectorCache.embedding_cache_id})) AS cosine_similarity
  //   FROM "FoodItem" WHERE "bgeBaseEmbedding" IS NOT NULL ORDER BY cosine_similarity DESC LIMIT 5
  // `) as FoodItemIdAndEmbedding[]

  printSearchResults(cosineSearchResults)

  const bestMatch = await findBestMatch(cosineSearchResults, food, userQueryVectorCache, user, messageId)

  try {
    food = await findBestServingMatchInstruct(food, bestMatch as FoodItemWithNutrientsAndServing, user)
  } catch (err1) {
    try {
      console.log("Error finding best serving match with instruct model, retrying with function", err1)
      food = await findBestServingMatchFunction(food, bestMatch as FoodItemWithNutrientsAndServing, user)
    } catch (err2) {
      throw err2 // or handle the error in a different way if needed
    }
  }

  const data = {
    foodItemId: bestMatch.id,
    servingId: food.serving!.serving_id ? food.serving!.serving_id : null,
    servingAmount: food.serving!.serving_amount,
    loggedUnit: food.serving!.serving_name,
    grams: food.serving!.total_serving_g_or_ml,
    userId: user.id,
    //consumedOn: food.timeEaten ? new Date(food.timeEaten) : new Date(),
    messageId,
    status: "Processed"
  }

  const foodItem = await logFoodItem(loggedFoodItem.id, data)
  if (!foodItem) {
    console.log("Could not log food item")
    return "Sorry, I could not log your food items. Please try again later."
  }

  UpdateMessage({ id: messageId, incrementItemsProcessedBy: 1 })

  console.log("About to queue icon generation")
  // Queue the icon generation
  await generateFoodIconQueue.enqueue(
    `${foodItem.foodItemId}` // job to be enqueued
  )

  console.log("Queued icon generation", foodItem.id)

  return `${bestMatch.name} - ${foodItem.grams}g - ${foodItem.loggedUnit}`
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
    emailVerified: null
  }
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
