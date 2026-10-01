// Logged foods follow their food (docs/micronutrients-plan.md in amino-mobile, plan C). A logged item keeps the values
// it was priced at, so a food that gains vitamins and minerals, or whose values are corrected (an estimate superseded,
// a catalogue fix), left its earlier logs behind (meal 30318: 556 kcal for a ceviche that is now 177).
//  - Fill: logs of foods updated in the last few minutes get the nutrients they lack (fill_logged_micronutrients:
//    never overwrites, records what it filled).
//  - Reprice: logs of foods whose values were corrected (a FoodItem row in CatalogueAuditBackup) and whose calories
//    no longer match are repriced through the meal protocol (a "portion" operation at the same amount), one item per
//    meal per run so each operation sees the meal's latest revision.
import { randomUUID } from "node:crypto"
import { createAdminSupabase } from "@/utils/supabase/serverAdmin"
import { MICRO_KEYS } from "@/foodResolution/micronutrients"
import { nutrientsAt, type FoodBasis } from "@/userFoods/nutrition"
import { acceptMealOperation } from "./service"
import { dispatchMealOperation } from "./dispatch"
import type { OperationRequest } from "./contracts"

type Db = ReturnType<typeof createAdminSupabase>
const FOOD = "id,defaultServingWeightGram,weightUnknown,kcalPerServing,proteinPerServing,carbPerServing,totalFatPerServing,fiberPerServing,sugarPerServing,addedSugarPerServing,satFatPerServing,transFatPerServing,Nutrient(nutrientName,nutrientUnit,nutrientAmountPerDefaultServing)"
/** FoodItem.lastUpdated and CatalogueAuditBackup are compared as UTC wall-clock values. */
const ago = (ms: number) => new Date(Date.now() - ms).toISOString().replace("Z", "")
const finite = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value)

async function logsOf(db: Db, foodId: number, columns: string) {
  const rows: Record<string, unknown>[] = []
  for (let from = 0; from < 20_000; from += 1000) {
    const page = await db.from("LoggedFoodItem").select(columns).eq("foodItemId", foodId).is("deletedAt", null)
      .gt("grams", 0).order("id").range(from, from + 999)
    if (page.error) throw page.error
    rows.push(...((page.data ?? []) as unknown as Record<string, unknown>[]))
    if ((page.data ?? []).length < 1000) break
  }
  return rows
}

/** The empty vitamin and mineral columns of a food's logs, from the food's rows at each log's grams. */
export function fillsFor(food: FoodBasis, logs: Record<string, unknown>[]) {
  return logs.flatMap(log => {
    const amounts = nutrientsAt(food, Number(log.grams))
    if (!amounts) return []
    const values = Object.fromEntries(MICRO_KEYS.flatMap(key => log[key] == null && finite(amounts[key])
      ? [[key, Math.round(amounts[key]! * 1e4) / 1e4]] : []))
    return Object.keys(values).length ? [{ id: Number(log.id), values }] : []
  })
}

/** Fills the logs of foods updated in the last `withinMs` (at most 50 foods a run). */
export async function fillLogsForRecentFoods(db: Db = createAdminSupabase(), withinMs = 10 * 60_000) {
  const foods = await db.from("FoodItem").select(FOOD).gte("lastUpdated", ago(withinMs)).limit(50)
  if (foods.error) throw foods.error
  let filled = 0
  for (const food of (foods.data ?? []) as unknown as (FoodBasis & { id: number })[]) {
    const rows = fillsFor(food, await logsOf(db, food.id, `id,grams,${MICRO_KEYS.join(",")}`))
    for (let at = 0; at < rows.length; at += 300) {
      const result = await (db as any).rpc("fill_logged_micronutrients", { p_rows: rows.slice(at, at + 300) })
      if (result.error) throw result.error
      filled += Number(result.data ?? 0)
    }
  }
  return { foods: (foods.data ?? []).length, filled }
}

/** Calories that no longer match the food at the logged grams (more than 15%, and more than 15 kcal). */
export function staleLogs(food: FoodBasis, logs: Record<string, unknown>[]) {
  return logs.filter(log => {
    const now = nutrientsAt(food, Number(log.grams))?.kcal, then = Number(log.kcal)
    return finite(now) && finite(then) && Math.abs(now - then) > Math.max(15, 0.15 * then)
  })
}

/** Reprices logs of foods corrected in the last `withinMs`: one portion operation per meal per run, at most `limit`. */
export async function repriceLogsForCorrectedFoods(db: Db = createAdminSupabase(), withinMs = 26 * 3_600_000, limit = 50) {
  const corrected = await (db as any).from("CatalogueAuditBackup").select("rowId,before").eq("tableName", "FoodItem").gte("createdAt", ago(withinMs)).limit(1000)
  if (corrected.error) throw corrected.error
  const backups = (corrected.data ?? []) as { rowId: number | string; before: Record<string, unknown> | null }[]
  const foodIds = [...new Set(backups.map(row => Number(row.rowId)).filter(Number.isFinite))]
  const meals = new Map<number, Record<string, unknown>>()
  for (const foodId of foodIds) {
    const food = await db.from("FoodItem").select(FOOD).eq("id", foodId).maybeSingle()
    if (food.error || !food.data) continue
    // Only a correction of its values counts (a backup also records barcode or name changes).
    const current = food.data as unknown as Record<string, unknown>
    const changed = backups.some(row => Number(row.rowId) === foodId && row.before &&
      ["kcalPerServing", "defaultServingWeightGram"].some(key => Number(row.before![key]) !== Number(current[key])))
    if (!changed) continue
    for (const log of staleLogs(food.data as unknown as FoodBasis, await logsOf(db, foodId, "id,messageId,logicalItemId,grams,kcal,servingId,servingAmount,userId,foodItemId")))
      if (!meals.has(Number(log.messageId))) meals.set(Number(log.messageId), log)
    if (meals.size >= limit) break
  }
  let queued = 0
  for (const [messageId, log] of [...meals].slice(0, limit)) {
    const message = await db.from("Message").select("id,userId,content,consumedOn,createdAt,publishedRevision,activeOperationId,deletedAt")
      .eq("id", messageId).maybeSingle()
    const meal = message.data as { userId: string; content: string | null; consumedOn: string | null; createdAt: string
      publishedRevision: number | null; activeOperationId: string | null; deletedAt: string | null } | null
    // A meal already being changed is left for the next run.
    if (message.error || !meal || meal.deletedAt || meal.activeOperationId || !log.logicalItemId) continue
    const user = await db.from("User").select("tzIdentifier").eq("id", meal.userId).maybeSingle()
    const request = {
      schemaVersion: 1, operationId: randomUUID(), clientMealId: randomUUID(), messageId,
      expectedPublishedRevision: Number(meal.publishedRevision ?? 0), action: "portion",
      submittedAt: new Date().toISOString(), timezone: (user.data as { tzIdentifier?: string } | null)?.tzIdentifier ?? "UTC", locale: null,
      input: { originalText: meal.content ?? "", consumedOn: new Date(`${meal.consumedOn ?? meal.createdAt}Z`).toISOString(),
        targetLogicalItemId: String(log.logicalItemId), foodId: Number(log.foodItemId),
        ...(log.servingId != null ? { servingId: Number(log.servingId), servingAmount: Number(log.servingAmount) } : { grams: Number(log.grams) }) }
    } as OperationRequest
    const accepted = await acceptMealOperation(meal.userId, request).catch(error => {
      console.warn("log_reprice_not_accepted", { messageId, error: error instanceof Error ? error.message : "unknown" }); return null })
    if (accepted?.state === "queued") {
      await dispatchMealOperation(request.operationId).catch(() => {}) // The outbox retries a failed dispatch.
      queued++
    }
  }
  return { foods: foodIds.length, meals: meals.size, queued }
}
