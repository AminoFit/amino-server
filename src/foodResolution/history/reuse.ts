import { createAdminSupabase } from "@/utils/supabase/serverAdmin"
import { currentFoodConfig, foodMetric } from "../telemetry"
import { createUserFoodHistorySearch, HistoryResult } from "./search"
import { HISTORY_NUTRIENTS, HistoryNutrition } from "./nutrients"
import { Tables, TablesInsert } from "types/supabase-generated.types"

type HistoryReply = { resultMessage: string; status: "RESOLVED" | "FAILED"; itemsProcessed: number; itemsToProcess: number }
const blockedWords = /\b(without|instead|extra|double|half|no|with|and|but|only|except|one|two|three|four|more|less|small|large|medium|grams?|kg|ml|cups?|scoops?|servings?)\b/i
const normalize = (value: string) => value.toLowerCase().replace(/[^\p{L}\s'-]/gu," ").trim()
const tokens = (value: string) => normalize(value).split(/\s+/).map(word=>word.length>3 && word.endsWith("s") ? word.slice(0,-1) : word)

// Detection is deliberately broader than the supported grammar: unsupported
// references fail closed instead of falling through to a generic food guess.
export function isHistoryReference(text: string) {
  return /\bsame\b|\b(?:my|as)\s+usual\b|\b(?:usual|regular)\s+(?:breakfast|bfast|lunch|dinner|meal|smoothie|recipe)\b/i.test(text)
}
export function referenceTarget(text: string): string | null {
  const match = /^(?:(?:please|log|i had)\s+)?(?:the\s+)?same\s+(.+?)\s+(?:as|from)\s+yesterday[.!]?$/i.exec(text.trim())
  if (!match || /\d/.test(match[1]) || blockedWords.test(match[1])) return null
  const target = normalize(match[1]).replace(/^the\s+/,"")
  return target && tokens(target).length <= 8 ? target : null
}

export function historyCopies(result: HistoryResult, target: string, userId: string, messageId: number, consumedOn: string) {
  if (result.disposition !== "single_event" || result.truncated || result.candidates.length !== 1) return null
  const source = result.candidates[0]
  // A smoothie is the recorded meal group, including its separate ingredients.
  // Search has already required smoothie evidence and a unique complete event.
  const smoothie = tokens(target).includes("smoothie") &&
    tokens(source.originalText ?? "").includes("smoothie")
  const wholeMeal = smoothie || ["breakfast","bfast","lunch","dinner","meal"].includes(target)
  const wanted = tokens(target)
  const foods = wholeMeal ? source.foods : source.foods.filter(food => {
    const item = food.FoodItem
    return item && wanted.every(word=>tokens(`${item.name} ${item.brand ?? ""}`).includes(word))
  })
  // Individual food references still copy only that food, not unrelated rows.
  if (!foods.length || foods.length > 30 || source.messageId === messageId) return null
  const rows: TablesInsert<"LoggedFoodItem">[] = []
  for (const food of foods) {
    if (food.userId !== userId || food.deletedAt || food.status !== "Processed" || !food.foodItemId ||
      !food.FoodItem || !Number.isFinite(food.grams) || food.grams <= 0 || food.kcal == null) return null
    const nutrition: HistoryNutrition = {}
    for (const key of HISTORY_NUTRIENTS) {
      const value = food[key] ?? null
      if (value !== null && (!Number.isFinite(value) || value < 0)) return null
      nutrition[key] = value
    }
    rows.push({ userId, messageId, foodItemId: food.foodItemId, grams: food.grams, ...nutrition,
      consumedOn, status: "Processed", servingId: null, servingAmount: food.grams, loggedUnit: "g",
      extendedOpenAiData: { food_database_search_name: food.FoodItem.name,
        full_item_user_message_including_serving: `${food.grams} g ${food.FoodItem.name}`,
        branded: Boolean(food.FoodItem.brand), brand: food.FoodItem.brand ?? "",
        serving: { serving_g_or_ml: "g", total_serving_g_or_ml: food.grams, serving_amount: food.grams, serving_name: "g" },
        historySourceMessageId: source.messageId, historySourceLoggedFoodItemId: food.id }
    })
  }
  return rows
}

// Resolve before claiming or deleting anything. The RPC validates the observed
// source/target and replaces foods + completion in one transaction.
export async function reuseFoodHistory(user: { id: string; tzIdentifier: string }, message: Tables<"Message">,
  consumedOn: string, editing: boolean, providedDb?: ReturnType<typeof createAdminSupabase>): Promise<HistoryReply | null> {
  if (currentFoodConfig()?.features.history_reuse !== "on" || !isHistoryReference(message.content)) return null
  if (message.userId !== user.id) throw new Error("History message is unavailable")
  const db = providedDb ?? createAdminSupabase()
  const started = performance.now()
  let rows: TablesInsert<"LoggedFoodItem">[] | null = null
  const target = referenceTarget(message.content)
  let history: HistoryResult | undefined
  let lookupFailed = false
  if (target && !message.hasimages) {
    try {
      history = await createUserFoodHistorySearch(user,db)({text:message.content,
        referenceTime:consumedOn,recordedBefore:new Date().toISOString(),excludeMessageId:message.id},
        AbortSignal.timeout(5000))
      rows = historyCopies(history,target,user.id,message.id,consumedOn)
    } catch { lookupFailed = true }
  }
  if (!rows) {
    // A rejected edit leaves the existing foods and lifecycle intact. New
    // unsuccessful references have no foods and can use the FAILED state.
    if (!editing) {
      const failed = await db.from("Message").update({status:"FAILED",itemsProcessed:0,itemsToProcess:0,
        resolvedAt:new Date().toISOString()}).eq("id",message.id).eq("userId",user.id)
        .eq("status",message.status).eq("content",message.content).is("deletedAt",null).select("id").maybeSingle()
      if (failed.error || !failed.data) throw new Error("History request changed")
    }
    foodMetric("history_reuse",performance.now()-started,"ok",{status:"unmatched"})
    const resultMessage = lookupFailed ? "Could not load yesterday's meals. Please retry. Your existing foods were kept." :
      history?.disposition === "ambiguous" ? "More than one matching meal was found yesterday. Describe which one you mean. Your existing foods were kept." :
      !target || message.hasimages ? "Use a reference such as 'same smoothie as yesterday', or enter the foods and amounts directly." :
      "No complete matching meal was found yesterday. Your existing foods were kept. Check the meal's date or enter the foods directly."
    return {resultMessage,
      status:"FAILED",itemsProcessed:0,itemsToProcess:0}
  }
  const source = history!.candidates[0]
  const completed = await db.rpc("replace_food_from_history", {
    p_user_id:user.id, p_message_id:message.id, p_consumed_on:consumedOn,
    p_expected:{content:message.content,status:message.status,resolvedAt:message.resolvedAt,consumedOn:message.consumedOn},
    p_source:{messageId:source.messageId,content:source.originalText,consumedOn:source.consumedOn,
      foods:source.foods.map(food=>({id:food.id,updatedAt:food.updatedAt}))},
    p_food_ids:rows.map(row=>(row.extendedOpenAiData as {historySourceLoggedFoodItemId:number}).historySourceLoggedFoodItemId)
  })
  if (completed.error) throw new Error("Could not replace the meal from history. Refresh the food log and retry.")
  foodMetric("history_reuse",performance.now()-started,"ok",{status:"RESOLVED",itemsProcessed:rows.length,itemsToProcess:rows.length})
  return {resultMessage:"Previous food amounts were logged successfully.",status:"RESOLVED",itemsProcessed:rows.length,itemsToProcess:rows.length}
}
