// Utils
import { foodToLogEmbedding } from "@/utils/foodEmbedding"
import { FoodItemToLog } from "@/utils/loggedFoodItemInterface"
import { printSearchResults } from "./common/processFoodItemsUtils"

// App
import { FoodItemWithNutrientsAndServing } from "@/app/dashboard/utils/FoodHelper"

// Database
import UpdateMessage from "@/database/UpdateMessage"

import { Tables } from "types/supabase"
import { createAdminSupabase } from "@/utils/supabase/serverAdmin"
import { findBestLoggedFoodItemMatchToFood } from "./findBestLoggedFoodItemMatchToFood"
import { updateLoggedFoodItemWithData } from "./common/updateLoggedFoodItemData"
import { LinkIconsOrCreateIfNeeded } from "./foodIconsProcess"
import { getUserByEmail } from "./common/debugHelper"
import { re } from "mathjs"
import { GetMessageById } from "@/database/GetMessagesForUser"
import { getCachedOrFetchEmbeddings } from "@/utils/embeddingsCache/getCachedOrFetchEmbeddings"
import { getBestFoodEmbeddingMatches } from "./getBestFoodEmbeddingMatches/getBestFoodEmbeddingMatches"
import { findBestServingMatchChatLlama } from "./getServingSizeFromFoodItem/getServingSizeFromFoodItem"

export async function ProcessLogFoodItem(
  loggedFoodItem: Tables<"LoggedFoodItem">,
  food: FoodItemToLog,
  messageId: number,
  user: Tables<"User">
): Promise<string> {
  // const supabase = createServerActionClient<Database>({ cookies })

  const message = await GetMessageById(messageId)

  const messageEmbedding = await getCachedOrFetchEmbeddings("BGE_BASE", [message!.content])
  console.log(`getting embedding for food ${food.full_item_user_message_including_serving}`)
  const userQueryVectorCache = await foodToLogEmbedding(food)

  let cosineSearchResults = (await getBestFoodEmbeddingMatches(userQueryVectorCache.embedding_cache_id, messageEmbedding[0].id)).slice(0, 20)

  // cosineSearchResults.map((result, index) => {
  //   console.log(`${index} - ${result.cosine_similarity.toFixed(3)} - ${result.name} - ${result.brand} - id:${result.id} - externalId:${result.externalId} - source:${result.foodInfoSource}`)
  // })

  const [bestMatch, secondBestMatch] = await findBestLoggedFoodItemMatchToFood(
    cosineSearchResults,
    food,
    userQueryVectorCache,
    user,
    messageId
  )

  console.log("bestMatch", bestMatch.brand ? `${bestMatch.name} - ${bestMatch.brand}` : bestMatch.name)

  try {
    food = await findBestServingMatchChatLlama(food, bestMatch as FoodItemWithNutrientsAndServing, user)
  } catch (err1) {
    throw err1
  }

  let extendedFoodData = { ...food, second_best_match: secondBestMatch }

  const data = {
    foodItemId: bestMatch.id,
    servingId: food.serving!.serving_id ? food.serving!.serving_id : null,
    servingAmount: food.serving!.serving_amount,
    loggedUnit: food.serving!.serving_name,
    grams: food.serving!.total_serving_g_or_ml,
    userId: user.id,
    extendedOpenAiData: extendedFoodData as any,
    //consumedOn: food.timeEaten ? new Date(food.timeEaten) : new Date(),
    messageId,
    status: "Processed"
  }

  const updatedLoggedFoodItem = await updateLoggedFoodItemWithData(loggedFoodItem.id, data)
  if (!updatedLoggedFoodItem) {
    console.log("Could not log food item")
    return "Sorry, I could not log your food items. Please try again later."
  }

  UpdateMessage({ id: messageId, incrementItemsProcessedBy: 1 })

  console.log("About to queue icon generation")
  console.log("food", JSON.stringify(updatedLoggedFoodItem, null, 2))
  console.log("bestMatch.name", bestMatch.name)

  await LinkIconsOrCreateIfNeeded(bestMatch.id)
  return `${bestMatch.name} - ${updatedLoggedFoodItem.grams}g - ${updatedLoggedFoodItem.loggedUnit}`
}

async function testFoodMatching() {
  const supabase = createAdminSupabase()
  const food = {
    food_database_search_name: "salmon sushi",
    full_item_user_message_including_serving: "5 salmon sushi"
  } as FoodItemToLog

  const userQueryVectorCache = await foodToLogEmbedding(food)

  let { data: cosineSearchResults, error } = await supabase.rpc("get_cosine_results", {
    p_embedding_cache_id: userQueryVectorCache.embedding_cache_id,
    amount_of_results: 10
  })

  printSearchResults(cosineSearchResults!)
}

async function getLoggedFoodItem(id: number): Promise<Tables<"LoggedFoodItem"> | null> {
  const supabase = createAdminSupabase()
  const { data, error } = await supabase.from("LoggedFoodItem").select("*").eq("id", id).single()
  return data
}

async function testProcessFood() {


  const messageId = 5643
  const food = {
    food_database_search_name: "eggs fried with margarine",
    full_item_user_message_including_serving: "2 eggs fried with margarine",
    branded: false,
    brand: ""
  } as FoodItemToLog
  const user = await getUserByEmail("seb.grubb@gmail.com")

  const loggedFoodItem = {
    id: 11354,
    consumedOn: "2024-05-02T20:19:26.414Z",
    createdAt: "2024-05-02T20:19:27.177Z",
    updatedAt: "2024-05-02T20:19:37.103Z",
    deletedAt: null,
    embeddingId: null,
    extendedOpenAiData: {
      "brand": "",
      "branded": false,
      "serving": {
        "serving_id": 0,
        "serving_name": "eggs",
        "serving_amount": 2,
        "serving_g_or_ml": "g",
        "full_serving_string": "2 eggs",
        "total_serving_g_or_ml": 200
      },
      "timeEaten": "2024-05-02T20:19:26.414Z",
      "second_best_match": null,
      "food_database_search_name": "eggs fried with margarine",
      "full_item_user_message_including_serving": "2 eggs fried with margarine"
    } as any,
    foodItemId: 3056,
    grams: 200,
    servingId: null,
    servingAmount: 2,
    loggedUnit: 'eggs',
    userId: "6b005b82-88a5-457b-a1aa-60ecb1e90e21",
    messageId: 5643,
    status: 'Processed',
    isBadFoodItemRequest: false,
    local_id: null,
  } as Tables<"LoggedFoodItem">;
  

  const result = await ProcessLogFoodItem(loggedFoodItem!, food, messageId, user!)
}

// testProcessFood()
