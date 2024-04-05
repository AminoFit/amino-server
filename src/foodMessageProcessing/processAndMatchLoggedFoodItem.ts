// OpenAI
import { findBestServingMatchChat } from "./findBestServingMatchChat"

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
    food = await findBestServingMatchChat(food, bestMatch as FoodItemWithNutrientsAndServing, user)
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


  const messageId = 1200
  const food = {
    food_database_search_name: "Fat free fairlife milk",
    full_item_user_message_including_serving: "Fat free fairlife milk 1 cup",
    branded: true,
    brand: "Fairlife"
  } as FoodItemToLog
  const user = await getUserByEmail("seb.grubb@gmail.com")

  const loggedFoodItem = {
    id: 1,
    consumedOn: new Date().toISOString(),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    deletedAt: null,
    embeddingId: null,
    extendedOpenAiData: food as any,
    foodItemId: null,
    grams: 0,
    servingId: null,
    servingAmount: null,
    loggedUnit: null,
    userId: user?.id,
    messageId: messageId,
    status: null,
    isBadFoodItemRequest: null,
    local_id: null,
  } as Tables<"LoggedFoodItem">;


  const result = await ProcessLogFoodItem(loggedFoodItem!, food, messageId, user!)
}

// testProcessFood()
