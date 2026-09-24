import moment from "moment-timezone"
import { createAdminSupabase } from "@/utils/supabase/serverAdmin"
import { HISTORY_NUTRIENTS, HistoryNutrition } from "./nutrients"

export type HistoryRequest = { text: string; referenceTime: string; excludeMessageId: number; explicitBrand?: string }
export type HistoryFood = { id: number; userId: string; deletedAt: string | null; status: string | null;
  foodItemId: number | null; grams: number; kcal: number | null; servingAmount: number | null;
  loggedUnit: string | null; FoodItem: { name: string; brand: string | null } | null } & HistoryNutrition
export type HistoryMessage = { id: number; userId: string; content: string; consumedOn: string | null;
  createdAt: string; deletedAt: string | null; status: string; itemsToProcess: number | null;
  itemsProcessed: number | null; LoggedFoodItem: HistoryFood[] }
export type HistoryCandidate = { messageId: number; originalText: string; consumedOn: string;
  foods: HistoryFood[]; score: number; occurrenceDays: number }
export type HistoryResult = { disposition: "single_event" | "repeated_pattern" | "ranked_foods" | "ambiguous" | "none" | "unsupported";
  reason: string; candidates: HistoryCandidate[]; truncated: boolean; scanned: number }

// Database timestamps without an offset represent UTC, never the server timezone.
export function historyTime(value: string) {
  return moment.utc(value, moment.ISO_8601, true)
}
const stop = new Set("i had ate have log a an the my me same as from yesterday today usual usually regular again please of with and for at in g kg gram grams ml scoop scoops medium large small one two breakfast lunch dinner smoothie".split(" "))
function words(text: string) {
  return (text.toLowerCase().replace(/bfast/g, "breakfast").match(/[\p{L}]+/gu) ?? [])
    .map(word => word.length > 3 && word.endsWith("s") ? word.slice(0,-1) : word)
}

export function historyWindow(request: HistoryRequest, timezone: string) {
  if (!moment.tz.zone(timezone)) throw new Error("Invalid history timezone")
  const now = historyTime(request.referenceTime).tz(timezone)
  if (!now.isValid()) throw new Error("Invalid history reference time")
  const yesterday = /\byesterday\b/i.test(request.text)
  return { start: (yesterday ? now.clone().subtract(1,"day").startOf("day") : now.clone().subtract(30,"days")).toISOString(),
    end: (yesterday ? now.clone().startOf("day") : now).toISOString(), yesterday }
}

export function rankFoodHistory(rows: HistoryMessage[], userId: string, timezone: string,
  request: HistoryRequest, truncated = false): HistoryResult {
  const window = historyWindow(request, timezone)
  const text = request.text.toLowerCase().replace(/bfast/g,"breakfast")
  const terms = [...new Set(words(text).filter(word => !stop.has(word)))]
  const meal = /\b(breakfast|lunch|dinner)\b/.exec(text)?.[1]
  const smoothie = /\bsmoothie\b/.test(text)
  const usual = /\b(usual|usually|regular)\b/.test(text)
  const reference = /\b(same|again|yesterday|usual|usually|regular)\b/.test(text)
  const unsupported = /\b(without|instead|extra|double|half|recipe|no)\b/.test(text)
  const candidates: HistoryCandidate[] = []
  for (const row of rows) {
    if (row.userId !== userId || row.id === request.excludeMessageId || row.deletedAt || row.status !== "RESOLVED" || !row.consumedOn) continue
    const consumed = historyTime(row.consumedOn)
    const created = historyTime(row.createdAt)
    if (!consumed.isValid() || !created.isValid() || created.isAfter(historyTime(request.referenceTime)) ||
        consumed.isBefore(window.start) || !consumed.isBefore(window.end)) continue
    const foods = row.LoggedFoodItem.filter(food => !food.deletedAt)
    // Never reconstruct a meal from a partial or differently owned collection.
    if (!foods.length || foods.length !== row.itemsToProcess || row.itemsProcessed !== row.itemsToProcess ||
      foods.some(food => food.userId !== userId || food.status !== "Processed" || !food.foodItemId ||
        !food.FoodItem || !Number.isFinite(food.grams) || food.grams <= 0 || food.kcal === null || !Number.isFinite(food.kcal) || food.kcal < 0)) continue
    if (request.explicitBrand && !foods.some(food => food.FoodItem?.brand?.toLowerCase() === request.explicitBrand!.toLowerCase())) continue
    const evidence = words(row.content + " " + foods.map(food => `${food.FoodItem!.name} ${food.FoodItem!.brand ?? ""}`).join(" "))
    if (terms.some(term => !evidence.includes(term))) continue
    if (smoothie && !evidence.includes("smoothie")) continue
    if (meal) {
      if (["breakfast","lunch","dinner"].some(label=>evidence.includes(label)) && !evidence.includes(meal)) continue
      const hour = consumed.clone().tz(timezone).hour()
      const hours = meal === "breakfast" ? [5,11] : meal === "lunch" ? [11,16] : [16,23]
      if (!evidence.includes(meal) && !(hour >= hours[0] && hour < hours[1])) continue
    }
    if (!terms.length && !meal && !smoothie && !reference) continue
    candidates.push({ messageId: row.id, originalText: row.content, consumedOn: row.consumedOn, foods,
      score: 1 / (1 + Math.max(0, historyTime(request.referenceTime).diff(consumed,"days",true))), occurrenceDays: 1 })
  }
  const signature = (candidate: HistoryCandidate) => candidate.foods.map(food => `${food.foodItemId}:${food.grams.toFixed(2)}`).sort().join("|")
  const days = new Map<string, Set<string>>()
  for (const candidate of candidates) {
    const key = signature(candidate)
    if (!days.has(key)) days.set(key,new Set())
    days.get(key)!.add(historyTime(candidate.consumedOn).tz(timezone).format("YYYY-MM-DD"))
  }
  for (const candidate of candidates) {
    candidate.occurrenceDays = days.get(signature(candidate))!.size
    if (!window.yesterday) candidate.score += Math.log2(candidate.occurrenceDays) * .25
  }
  candidates.sort((a,b)=>(usual ? b.occurrenceDays-a.occurrenceDays : 0) || b.score-a.score || b.messageId-a.messageId)
  const top = candidates[0]
  let disposition: HistoryResult["disposition"] = "none"
  if (top) {
    disposition = !reference ? "ranked_foods" : "ambiguous"
    if (reference && !usual && candidates.length === 1 && !truncated) disposition = "single_event"
    if (usual && top.occurrenceDays >= 3 && candidates.filter(c=>signature(c)===signature(top)).length / candidates.length >= .75 && !truncated) {
      disposition = "repeated_pattern"
    }
  }
  if (unsupported) disposition = "unsupported"
  return { disposition, reason: unsupported ? "Modification or recipe requires evidence beyond this retrieval tool" :
    truncated ? "Bounded history scan is incomplete; no unique reference asserted" : disposition,
    candidates: candidates.slice(0,5), truncated, scanned: rows.length }
}

// Identity is bound by the authenticated server caller, not a model tool argument.
export function createUserFoodHistorySearch(user: { id: string; tzIdentifier: string }, db = createAdminSupabase()) {
  return async function searchUserFoodHistory(request: HistoryRequest, signal?: AbortSignal): Promise<HistoryResult> {
    if (!user.id || request.text.length > 4000 || !Number.isSafeInteger(request.excludeMessageId)) throw new Error("Invalid history request")
    const window = historyWindow(request,user.tzIdentifier)
    let query = db.from("Message").select(`id,userId,content,consumedOn,createdAt,deletedAt,status,itemsToProcess,itemsProcessed,
      LoggedFoodItem(id,userId,deletedAt,status,foodItemId,grams,${HISTORY_NUTRIENTS.join(",")},servingAmount,loggedUnit,FoodItem(name,brand))`)
      .eq("userId",user.id).eq("status","RESOLVED").is("deletedAt",null).neq("id",request.excludeMessageId)
      .gte("consumedOn",window.start).lt("consumedOn",window.end)
      .lte("createdAt",historyTime(request.referenceTime).toISOString()).order("consumedOn",{ascending:false}).order("id",{ascending:false}).limit(101)
    query = query.abortSignal(signal ?? AbortSignal.timeout(750))
    const result = await query
    if (result.error) throw new Error("History lookup unavailable")
    // The SDK's type-level select parser cannot expand the nutrient field list.
    const rows = (result.data ?? []) as unknown as HistoryMessage[]
    return rankFoodHistory(rows.slice(0,100),user.id,user.tzIdentifier,request,rows.length>100)
  }
}
