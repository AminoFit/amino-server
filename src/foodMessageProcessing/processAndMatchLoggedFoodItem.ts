import { startFoodAgentShadow, finishFoodAgentShadow } from "@/foodResolution/agent/shadow"
import { tryFoodAgentLive, LiveFood } from "@/foodResolution/agent/live"
import { foodTrace, foodStage, foodMetric, setFoodInputClass } from "@/foodResolution/telemetry"
import { findExactLocalFood } from "./findExactLocalFood"
import { refreshFoodMessageProgress } from "./common/refreshFoodMessageProgress"
// Utils
import { foodToLogEmbedding } from "@/utils/foodEmbedding"
import { FoodItemToLog } from "@/utils/loggedFoodItemInterface"
import { printSearchResults } from "./common/processFoodItemsUtils"

// App
import { FoodItemWithNutrientsAndServing } from "@/app/dashboard/utils/FoodHelper"

// Database

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
import { foodNutrition, validNutrition } from "@/foodResolution/nutrition"
import { missingExplicitAdditions } from "@/foodResolution/composition"

export function ProcessLogFoodItem(...args: Parameters<typeof processLogFoodItemInternal>) {
  return foodTrace(args[3].id, args[2], args[1].upc ? "barcode" : "text", () =>
    foodStage("item", () => processLogFoodItemInternal(...args)), "worker")
}

async function processLogFoodItemInternal(
  loggedFoodItem: Tables<"LoggedFoodItem">,
  loggedFoodItemInfo: FoodItemToLog,
  messageId: number,
  user: Tables<"User">
): Promise<string> {
  let shadow: ReturnType<typeof startFoodAgentShadow> | undefined
  let baseline: {foodId:number;grams:number} | undefined
  let live: LiveFood | null = null
  try {
    const message = await GetMessageById(messageId)

    if (!message || message.deletedAt || loggedFoodItem.deletedAt) return "Message was deleted."

    setFoodInputClass(loggedFoodItemInfo.upc ? "barcode" : message.hasimages ? "image" : "text")
    let bestMatch: FoodItemWithNutrientsAndServing | null = null
    let secondBestMatch: number | null = null

    if (loggedFoodItemInfo.upc && loggedFoodItemInfo.upc !== 0) {
      console.log("getting best match for food with upc: ", loggedFoodItemInfo.upc)
      bestMatch = await findFoodByUPC(loggedFoodItemInfo.upc, messageId, user)
    }

    if (!bestMatch) bestMatch = await findExactLocalFood(loggedFoodItemInfo)
    if (!bestMatch) {
      const messageEmbedding = await getCachedOrFetchEmbeddings("BGE_BASE", [message.content])
      const userQueryVectorCache = await foodToLogEmbedding(loggedFoodItemInfo)
      let cosineSearchResults = (await getBestFoodEmbeddingMatches(userQueryVectorCache.embedding_cache_id, messageEmbedding[0].id)).slice(0, 20);

      // Exact foods, barcodes and images keep their current fast paths. Snapshot
      // the input before legacy serving resolution can mutate it.
      if (!message.hasimages && !loggedFoodItemInfo.upc) {
        const input={user:{id:user.id,tzIdentifier:user.tzIdentifier},messageId,referenceTime:message.createdAt,
          item:{...loggedFoodItemInfo},candidates:cosineSearchResults.filter(c=>Number.isSafeInteger(c.id)).map(c=>({id:c.id!,name:c.name,brand:c.brand ?? null}))}
        // Existing user-supplied nutrient values stay on their current path until
        // the typed nutrition-constraint contract is enabled separately.
        if ([loggedFoodItem.kcal,loggedFoodItem.proteinG,loggedFoodItem.carbG,loggedFoodItem.totalFatG].every(n=>n==null)) {
          live=await tryFoodAgentLive(input)
        }
        if (live) {bestMatch=live.food;loggedFoodItemInfo={...loggedFoodItemInfo,serving:live.serving}}
        else shadow = startFoodAgentShadow(input)
      }
      if (!bestMatch) [bestMatch, secondBestMatch] = await findBestLoggedFoodItemMatchToFood(
        cosineSearchResults,
        loggedFoodItemInfo,
        userQueryVectorCache,
        user,
        messageId
      )
    }

    if (!bestMatch) throw new Error("No food matched")
    if (missingExplicitAdditions(loggedFoodItemInfo,bestMatch.name).length) throw new Error("Matched food omits an explicit addition")
    console.log("bestMatch", bestMatch.brand ? `${bestMatch.name} - ${bestMatch.brand}` : bestMatch.name)

    try {
      if (!live) loggedFoodItemInfo = await findBestServingMatchChatGemini(loggedFoodItemInfo, bestMatch as FoodItemWithNutrientsAndServing, user)
    } catch (err1) {
      console.log("Error processing food item for serving:", err1)
      foodMetric("item_result", 0, "error", { status: "Matching Failed" })
      await updateLoggedFoodItemWithData(loggedFoodItem.id, { status: "Matching Failed" })
      return "Sorry, I could not log your food items. Please try again later."
    }

    let extendedFoodData = { ...loggedFoodItemInfo, second_best_match: secondBestMatch,
      ...(live ? {resolution:live.provenance} : {}) }
    
    // Check if the loggedFoodItem already has kcal, protein, fat, and carb values
    const hasExistingNutrients = loggedFoodItem.kcal != null && 
                                 loggedFoodItem.proteinG != null && 
                                 loggedFoodItem.totalFatG != null && 
                                 loggedFoodItem.carbG != null;

    let nutrientData = {};
    if (!hasExistingNutrients) {
      const verified = foodNutrition(bestMatch,loggedFoodItemInfo.serving!.total_serving_g_or_ml)
      if (!verified) throw new Error("Food has no usable nutrition basis")
      nutrientData = {...calculateNutrientData(loggedFoodItemInfo.serving!.total_serving_g_or_ml, bestMatch as FoodItemWithNutrientsAndServing),...verified};
    } else if (!validNutrition(loggedFoodItemInfo.serving!.total_serving_g_or_ml,{
      kcal:loggedFoodItem.kcal!,proteinG:loggedFoodItem.proteinG!,carbG:loggedFoodItem.carbG!,totalFatG:loggedFoodItem.totalFatG!
    })) {
      throw new Error("Logged nutrition is invalid for this quantity")
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



    baseline = {foodId:bestMatch.id,grams:updatedLoggedFoodItem.grams}
    console.log("About to queue icon generation")
    console.log("food", JSON.stringify(updatedLoggedFoodItem, null, 2))
    console.log("bestMatch.name", bestMatch.name)

    // Icon decoration is optional after the food has committed successfully.
    try {
      await LinkIconsOrCreateIfNeeded(bestMatch.id)
    } catch (error) {
      console.error("Food saved, but icon generation failed", { messageId, foodId: bestMatch.id })
    }
    foodMetric("item_result", 0, "ok", { status: "Processed", matchedFoodId: bestMatch.id, matchedGrams: updatedLoggedFoodItem.grams })
    return `${bestMatch.name} - ${updatedLoggedFoodItem.grams}g - ${updatedLoggedFoodItem.loggedUnit}`
  } catch (error) {
    foodMetric("item_result", 0, "error", { status: "Matching Failed" })
    console.log("Error processing food item for matching:", error)
    await updateLoggedFoodItemWithData(loggedFoodItem.id, { status: "Matching Failed" })
    return "Sorry, I could not log your food items. Please try again later."
  } finally {
    try { await refreshFoodMessageProgress(messageId) }
    finally { await finishFoodAgentShadow(shadow,baseline) }
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
