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
  const wholeMeal = ["breakfast","bfast","lunch","dinner","meal"].includes(target)
  const wanted = tokens(target)
  const foods = wholeMeal ? source.foods : source.foods.filter(food => {
    const item = food.FoodItem
    return item && wanted.every(word=>tokens(`${item.name} ${item.brand ?? ""}`).includes(word))
  })
  // A food reference cannot silently become an entire multi-food meal. A named
  // smoothie represented only by ungrouped ingredients remains unsupported.
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

// Called only after the existing atomic message claim. No new queue job or model
// call is needed to reproduce already validated historical log values.
export async function reuseFoodHistory(user: { id: string; tzIdentifier: string }, message: Tables<"Message">,
  consumedOn: string, editing: boolean, providedDb?: ReturnType<typeof createAdminSupabase>): Promise<HistoryReply | null> {
  if (currentFoodConfig()?.features.history_reuse !== "on" || !isHistoryReference(message.content)) return null
  if (message.userId !== user.id) throw new Error("History message is unavailable")
  const db = providedDb ?? createAdminSupabase()
  const started = performance.now()
  let rows: TablesInsert<"LoggedFoodItem">[] | null = null
  const target = referenceTarget(message.content)
  if (target && !editing && !message.hasimages) {
    try {
      const history = await createUserFoodHistorySearch(user,db)({text:message.content,
        referenceTime:message.createdAt,excludeMessageId:message.id})
      rows = historyCopies(history,target,user.id,message.id,consumedOn)
    } catch { /* Unknown history must not fall through to generic matching. */ }
  }
  if (!rows) {
    const failed = await db.from("Message").update({status:"FAILED",itemsProcessed:0,itemsToProcess:0,
      resolvedAt:new Date().toISOString()}).eq("id",message.id).eq("userId",user.id)
      .eq("status","PROCESSING").is("deletedAt",null).select("id").maybeSingle()
    if (failed.error || !failed.data) throw new Error("History request changed")
    foodMetric("history_reuse",performance.now()-started,"ok",{status:"unmatched"})
    return {resultMessage:"Could not safely reuse a previous meal. Enter the food and amount directly.",
      status:"FAILED",itemsProcessed:0,itemsToProcess:0}
  }

  const prepared = await db.from("Message").update({itemsToProcess:rows.length,itemsProcessed:0,consumedOn})
    .eq("id",message.id).eq("userId",user.id).eq("status","PROCESSING").eq("content",message.content)
    .is("deletedAt",null).select("id").maybeSingle()
  if (prepared.error || !prepared.data) throw new Error("History request changed")
  // One bulk insert is atomic; never retry it after an uncertain network response.
  const inserted = await db.from("LoggedFoodItem").insert(rows).select("id")
  if (inserted.error || inserted.data?.length !== rows.length) throw new Error("Could not save historical foods; check saved items before retrying")
  const completed = await db.from("Message").update({status:"RESOLVED",itemsProcessed:rows.length,
    resolvedAt:new Date().toISOString()}).eq("id",message.id).eq("userId",user.id).eq("status","PROCESSING")
    .is("deletedAt",null).select("id").maybeSingle()
  if (completed.error || !completed.data) throw new Error("Historical foods saved; progress update needs recovery")
  foodMetric("history_reuse",performance.now()-started,"ok",{status:"RESOLVED",itemsProcessed:rows.length,itemsToProcess:rows.length})
  return {resultMessage:"Previous food amounts were logged successfully.",status:"RESOLVED",itemsProcessed:rows.length,itemsToProcess:rows.length}
}
