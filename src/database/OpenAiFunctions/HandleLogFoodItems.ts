// OpenAI
import { findBestServingMatchInstruct } from "../../openai/customFunctions/servingMatchRequestInstruct"
import { findBestServingMatchFunction } from "../../openai/customFunctions/servingMatchRequestFunction"
import { findBestFoodMatchtoLocalDb } from "../../openai/customFunctions/matchFoodItemToLocalDb"
import { FoodItemIdAndEmbedding } from "./utils/foodLoggingTypes"

// Utils
import { foodToLogEmbedding, FoodEmbeddingCache, getFoodEmbedding } from "../../utils/foodEmbedding"
import { FoodItemToLog } from "@/utils/loggedFoodItemInterface"

// App
import { FoodItemWithNutrientsAndServing } from "../../app/dashboard/utils/FoodHelper"
import { findAndAddItemInDatabase } from "../FoodAddFunctions/findAndAddFood"

// Database
import UpdateMessage from "@/database/UpdateMessage"
import { createServerActionClient } from "@supabase/auth-helpers-nextjs"
import { cookies } from "next/headers"
import { Tables } from "types/supabase"
import { createAdminSupabase } from "@/utils/supabase/serverAdmin"
import { Database } from "types/supabase-generated.types"
import { processFoodItemQueue } from "@/app/api/queues/process-food-item/process-food-item"
import { generateFoodIconQueue } from "@/app/api/queues/generate-food-icon/generate-food-icon"



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
