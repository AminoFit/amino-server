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

export async function ProcessLogFoodItem(
  loggedFoodItem: Tables<"LoggedFoodItem">,
  food: FoodItemToLog,
  messageId: number,
  user: Tables<"User">
): Promise<string> {
  // const supabase = createServerActionClient<Database>({ cookies })
  const supabase = createAdminSupabase()

  const userQueryVectorCache = await foodToLogEmbedding(food)

  let { data: cosineSearchResults, error } = await supabase.rpc("get_cosine_results", {
    p_embedding_cache_id: userQueryVectorCache.embedding_cache_id
  })

  if (!cosineSearchResults) cosineSearchResults = []

  if (error) {
    console.error(error)
  }

  printSearchResults(cosineSearchResults)

  const bestMatch = await findBestLoggedFoodItemMatchToFood(
    cosineSearchResults,
    food,
    userQueryVectorCache,
    user,
    messageId
  )

  try {
    food = await findBestServingMatchChat(food, bestMatch as FoodItemWithNutrientsAndServing, user)
  } catch (err1) {
    throw err1
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
    food_database_search_name: "butter",
    full_item_user_message_including_serving: "1 serving of butter",
  } as FoodItemToLog

  const userQueryVectorCache = await foodToLogEmbedding(food)

  let { data: cosineSearchResults, error } = await supabase.rpc("get_cosine_results", {
    p_embedding_cache_id: userQueryVectorCache.embedding_cache_id
  })

  printSearchResults(cosineSearchResults!)
}

testFoodMatching()