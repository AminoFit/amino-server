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
import { findBestServingMatchChatGemini } from "./getServingSizeFromFoodItem/getServingSizeFromFoodItem"
import { findFoodByUPC } from "./findFoodByUPC/findFoodByUPC"
import { calculateNutrientData } from "./common/calculateNutrientData"

export async function ProcessLogFoodItem(
  loggedFoodItem: Tables<"LoggedFoodItem">,
  loggedFoodItemInfo: FoodItemToLog,
  messageId: number,
  user: Tables<"User">
): Promise<string> {
  // const supabase = createServerActionClient<Database>({ cookies })
  try {
    const message = await GetMessageById(messageId)

    const messageEmbedding = await getCachedOrFetchEmbeddings("BGE_BASE", [message!.content])
    console.log(`getting embedding for food ${loggedFoodItemInfo.full_item_user_message_including_serving}`)
    const userQueryVectorCache = await foodToLogEmbedding(loggedFoodItemInfo)

    let bestMatch: FoodItemWithNutrientsAndServing | null = null
    let secondBestMatch: number | null = null

    if (loggedFoodItemInfo.upc && loggedFoodItemInfo.upc !== 0) {
      console.log("getting best match for food with upc: ", loggedFoodItemInfo.upc)
      bestMatch = await findFoodByUPC(loggedFoodItemInfo.upc, messageId, user)
    }

    if (!bestMatch) {
      let cosineSearchResults = (await getBestFoodEmbeddingMatches(userQueryVectorCache.embedding_cache_id, messageEmbedding[0].id)).slice(0, 20);

      [bestMatch, secondBestMatch] = await findBestLoggedFoodItemMatchToFood(
        cosineSearchResults,
        loggedFoodItemInfo,
        userQueryVectorCache,
        user,
        messageId
      )
    }

    console.log("bestMatch", bestMatch.brand ? `${bestMatch.name} - ${bestMatch.brand}` : bestMatch.name)

    try {
      loggedFoodItemInfo = await findBestServingMatchChatGemini(loggedFoodItemInfo, bestMatch as FoodItemWithNutrientsAndServing, user)
    } catch (err1) {
      console.log("Error processing food item for serving:", err1)
      await updateLoggedFoodItemWithData(loggedFoodItem.id, { status: "Matching Failed" })
      return "Sorry, I could not log your food items. Please try again later."
    }

    let extendedFoodData = { ...loggedFoodItemInfo, second_best_match: secondBestMatch }
    
    // Check if the loggedFoodItem already has kcal, protein, fat, and carb values
    const hasExistingNutrients = loggedFoodItem.kcal != null && 
                                 loggedFoodItem.proteinG != null && 
                                 loggedFoodItem.totalFatG != null && 
                                 loggedFoodItem.carbG != null;

    let nutrientData = {};
    if (!hasExistingNutrients) {
      nutrientData = calculateNutrientData(loggedFoodItemInfo.serving!.total_serving_g_or_ml, bestMatch as FoodItemWithNutrientsAndServing);
    }

    const data = {
      foodItemId: bestMatch.id,
      servingId: loggedFoodItemInfo.serving!.serving_id ? loggedFoodItemInfo.serving!.serving_id : null,
      servingAmount: loggedFoodItemInfo.serving!.serving_amount,
      loggedUnit: loggedFoodItemInfo.serving!.serving_name,
      grams: loggedFoodItemInfo.serving!.total_serving_g_or_ml,
      userId: user.id,
      extendedOpenAiData: extendedFoodData as any,
      ...nutrientData,
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
  } catch (error) {
    console.log("Error processing food item for matching:", error)
    await updateLoggedFoodItemWithData(loggedFoodItem.id, { status: "Matching Failed" })
    return "Sorry, I could not log your food items. Please try again later."
  }
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
  const messageId = 1

  const food = {
    food_database_search_name: "Fairlife nutrition plan chocolate nutrition shake",
    full_item_user_message_including_serving: "one Fairlife nutrition plan chocolate nutrition shake",
    branded: true,
    brand: "Fairlife",
    timeEaten: "2024-05-06T17:26:57.442Z"
  } as FoodItemToLog

  const user = await getUserByEmail("seb.grubb@gmail.com")

  const loggedFoodItem = {
    id: 12405,
    consumedOn: "2024-05-06T17:26:57.442Z",
    createdAt: "2024-05-06T17:26:58.392Z",
    updatedAt: "2024-05-06T17:26:58.266Z",
    deletedAt: null,
    embeddingId: null,
    extendedOpenAiData: {
      brand: "Fairlife",
      branded: true,
      timeEaten: "2024-05-06T17:26:57.442Z",
      food_database_search_name: "Fairlife nutrition plan chocolate nutrition shake",
      full_item_user_message_including_serving: "one Fairlife nutrition plan chocolate nutrition shake"
    },
    foodItemId: null,
    grams: 100,
    servingId: null,
    servingAmount: null,
    loggedUnit: null,
    userId: "6b005b82-88a5-457b-a1aa-60ecb1e90e21",
    messageId: 6229,
    status: "Needs Processing",
    isBadFoodItemRequest: false,
    local_id: null
  } as Partial<Tables<"LoggedFoodItem">> as Tables<"LoggedFoodItem">

  const result = await ProcessLogFoodItem(loggedFoodItem!, food, messageId, user!)
}

// testProcessFood()
