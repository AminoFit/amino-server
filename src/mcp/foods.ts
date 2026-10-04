import type { UserDatabase } from "./auth"
import { McpInputError } from "./meals"
import { COLUMN_NUTRIENTS, nutrientsAt, type Amounts } from "@/nutrition"
import { normalizeGtin } from "@/mealResolution/barcode"
import { catalogueFoodForGtin } from "@/foodSearch/barcodeCatalogue"
import { searchFoodsForUser } from "@/foodSearch/searchFoods"
import { createAdminSupabase } from "@/utils/supabase/serverAdmin"

// Foods for agents (2026-10-03-mcp-food-search-and-writes-plan.md): the app's own search, the user's foods and recipes,
// and what they usually log. Every food comes back as one card with what an agent needs to log it without another
// lookup: its servings (by id), nutrition per 100 g and per serving, and the user's history with it. Foods are read as
// the user, so row-level security limits them to shared foods and the user's own.

const columns = `id,name,brand,gtin,foodInfoSource,privateToUserId,archivedAt,recipePortions,cookedWeightGram,isLiquid,
  defaultServingWeightGram,weightUnknown,createdAtDateTime,lastUpdated,${Object.values(COLUMN_NUTRIENTS).join(",")},
  Serving(id,servingName,servingWeightGram,defaultServingAmount),Nutrient(nutrientName,nutrientUnit,nutrientAmountPerDefaultServing)`

const CORE = ["kcal", "proteinG", "carbG", "totalFatG", "satFatG", "fiberG", "sugarG", "sodiumMg"] as const
const ESTIMATES = new Set(["GPT4", "AgentEstimate"])

type Row = Record<string, any> & { id: number; name: string; brand: string | null; privateToUserId: string | null
  archivedAt: string | null; recipePortions: number | null; defaultServingWeightGram: number | null
  Serving: { id: number; servingName: string; servingWeightGram: number | null; defaultServingAmount: number | null }[] }

export type History = { foodId: number; timesLogged: number; lastLoggedOn: string; usualServingId: number | null
  usualAmount: number | null; usualUnit: string | null; usualGrams: number }

const round = (value: number, places = 1) => Math.round(value * 10 ** places) / 10 ** places

function nutrition(row: Row, grams: number, all: boolean) {
  const amounts: Amounts = nutrientsAt(row as any, grams) ?? {}
  const keys = all ? Object.keys(amounts) : CORE
  return Object.fromEntries(keys.flatMap(key => amounts[key as keyof Amounts] != null
    ? [[key, round(amounts[key as keyof Amounts]!, key === "kcal" || key.endsWith("Mg") ? 0 : 1)]] : []))
}

const gramsPerUnit = (serving: Row["Serving"][number]) =>
  serving.servingWeightGram && Number(serving.defaultServingAmount ?? 1) > 0
    ? Number(serving.servingWeightGram) / Number(serving.defaultServingAmount ?? 1) : null

/** One food as agents see it. `all` returns every nutrient the food records instead of the core ones. */
export function foodCard(row: Row, userId: string, history?: History, all = false, match?: string) {
  const recipe = row.recipePortions != null
  const base = Number(row.defaultServingWeightGram)
  const main = row.Serving?.find(s => Math.abs(Number(s.servingWeightGram) - base) < 0.01)
  const servings = (row.Serving ?? []).flatMap(s => {
    const grams = gramsPerUnit(s)
    return grams ? [{ servingId: s.id, unit: s.servingName, gramsPerUnit: round(grams) }] : []
  })
  return {
    id: row.id, name: row.name, brand: row.brand ?? null, kind: recipe ? "recipe" : "food",
    source: recipe ? "recipe" : row.privateToUserId === userId ? "custom" : "catalogue",
    ...(match ? { match } : {}),
    ...(recipe ? { portions: Number(row.recipePortions) } : {}),
    ...(row.isLiquid ? { liquid: true } : {}),
    ...(ESTIMATES.has(row.foodInfoSource) ? { estimate: true } : {}),
    ...(row.archivedAt ? { archived: true } : {}),
    servings,
    ...(base > 0 && !row.weightUnknown ? {
      per100g: nutrition(row, 100, all),
      perServing: { serving: recipe ? `1 portion (${round(base)} g)`
        : main ? `${Number(main.defaultServingAmount ?? 1)} ${main.servingName} (${round(base)} g)` : `${round(base)} g`,
        ...nutrition(row, base, all) }
    } : { nutritionUnknown: true }),
    ...(history ? { timesLogged: history.timesLogged, lastLoggedOn: history.lastLoggedOn, usual: usualAmount(history) } : {})
  }
}

const usualAmount = (history: History) => history.usualServingId != null && history.usualAmount != null
  ? { servingId: history.usualServingId, amount: round(history.usualAmount, 2), unit: history.usualUnit,
    grams: round(history.usualGrams) }
  : { grams: round(history.usualGrams) }

async function loadRows(db: UserDatabase, ids: number[]) {
  if (!ids.length) return new Map<number, Row>()
  const { data, error } = await db.from("FoodItem").select(columns).in("id", [...new Set(ids)])
  if (error) throw error
  return new Map(((data ?? []) as unknown as Row[]).map(row => [row.id, row]))
}

/** The user's history with foods: these ids (all time), or the most logged in a range. */
export async function foodHistory(db: UserDatabase, options: { foodIds?: number[]; from?: string; to?: string; limit?: number }) {
  const { data, error } = await (db as any).rpc("mcp_food_history", { p_from: options.from ?? null, p_to: options.to ?? null,
    p_food_ids: options.foodIds ?? null, p_limit: options.limit ?? 100 })
  if (error) throw error
  return ((data ?? []) as History[]).map(row => ({ ...row, usualAmount: row.usualAmount == null ? null : Number(row.usualAmount),
    usualGrams: Number(row.usualGrams) }))
}

/** Archived versions (replaced by an edit) point to the version that replaced them, so an agent logs the current one. */
async function currentVersions(db: UserDatabase, archived: number[]) {
  const current = new Map<number, number>()
  let pending = archived.map(id => ({ from: id, at: id }))
  for (let hop = 0; hop < 5 && pending.length; hop++) {
    const { data, error } = await db.from("FoodItem").select("id,previousVersionId,archivedAt")
      .in("previousVersionId", pending.map(p => p.at))
    if (error) throw error
    const next = new Map(((data ?? []) as { id: number; previousVersionId: number; archivedAt: string | null }[])
      .map(row => [row.previousVersionId, row]))
    pending = pending.flatMap(p => {
      const newer = next.get(p.at)
      if (!newer) return []
      if (!newer.archivedAt) { current.set(p.from, newer.id); return [] }
      return [{ from: p.from, at: newer.id }]
    })
  }
  return current
}

export type SearchInput = { query?: string; barcode?: string; scope: "all" | "mine" | "catalogue"
  kind: "any" | "food" | "recipe"; limit: number; cursor?: string
  filters?: { minKcal?: number; maxKcal?: number; minProteinG?: number; maxProteinG?: number; maxCarbG?: number; maxFatG?: number } }

const encode = (search: number, skip: number) => Buffer.from(JSON.stringify([search, skip])).toString("base64url")
function decode(cursor: string | undefined) {
  if (!cursor) return { search: 0, skip: 0 }
  try {
    const [search, skip] = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8"))
    if (Number.isSafeInteger(search) && Number.isSafeInteger(skip) && search >= 0 && skip >= 0) return { search, skip }
  } catch {}
  throw new McpInputError("That cursor isn't valid. Search again without a cursor.")
}

/** Per-100 g filters, on the core values. A food whose energy is unknown never passes a filter. */
export function passesFilters(card: ReturnType<typeof foodCard>, filters: SearchInput["filters"]) {
  if (!filters || !Object.values(filters).some(value => value != null)) return true
  const per = (card as { per100g?: Record<string, number> }).per100g
  if (!per || per.kcal == null) return false
  const within = (value: number | undefined, min?: number, max?: number) =>
    (min == null || (value != null && value >= min)) && (max == null || (value != null && value <= max))
  return within(per.kcal, filters.minKcal, filters.maxKcal) && within(per.proteinG, filters.minProteinG, filters.maxProteinG) &&
    within(per.carbG, undefined, filters.maxCarbG) && within(per.totalFatG, undefined, filters.maxFatG)
}

/** The app's food search (or a barcode), as cards with the user's history, narrowed by scope, kind and filters. */
export async function searchFoods(db: UserDatabase, userId: string, input: SearchInput) {
  if (!input.query?.trim() && !input.barcode?.trim()) throw new McpInputError("Give a query or a barcode.")
  if (input.barcode?.trim()) {
    const gtin = normalizeGtin(input.barcode)
    if (!gtin) throw new McpInputError("That barcode isn't valid: check its digits.")
    const id = await catalogueFoodForGtin(createAdminSupabase(), userId, gtin)
    if (!id) return { foods: [], barcode: gtin, found: false,
      note: "No food in Amino has this barcode. Search by the product's name, or create it as the user's own food." }
    const rows = await loadRows(db, [id])
    const [history] = await foodHistory(db, { foodIds: [id] })
    const row = rows.get(id)
    return { foods: row ? [foodCard(row, userId, history)] : [], barcode: gtin, found: !!row }
  }
  const at = decode(input.cursor)
  const found = await searchFoodsForUser(userId, input.query!, { mode: input.kind === "food" ? "ingredient" : "log",
    cursor: at.search })
  const wanted = found.results.filter(result =>
    (input.scope === "all" || (input.scope === "mine") === (result.source !== "catalogue")) &&
    (input.kind !== "recipe" || result.source === "recipe"))
  const ids = wanted.map(result => result.id)
  const matches = new Map(wanted.map(result => [result.id, result.match]))
  const [rows, history] = await Promise.all([loadRows(db, ids), ids.length ? foodHistory(db, { foodIds: ids }) : []])
  const logged = new Map(history.map(row => [row.foodId, row]))
  const cards = ids.flatMap(id => {
    const row = rows.get(id)
    return row ? [foodCard(row, userId, logged.get(id), false, matches.get(id))] : []
  }).filter(card => passesFilters(card, input.filters))
  const page = cards.slice(at.skip, at.skip + input.limit)
  const nextCursor = at.skip + input.limit < cards.length ? encode(at.search, at.skip + input.limit)
    // The user's own foods all come on the first page; later pages are catalogue only.
    : found.nextCursor != null && input.scope !== "mine" ? encode(found.nextCursor, 0) : null
  return { foods: page, nextCursor }
}

/** Any food the user can see by id, with every nutrient, their history with it, and a recipe's foods. */
export async function getFood(db: UserDatabase, userId: string, foodId: number) {
  const row = (await loadRows(db, [foodId])).get(foodId)
  if (!row) throw new McpInputError("No food has that id. Find foods with search_foods.")
  const [[history], newer] = await Promise.all([foodHistory(db, { foodIds: [foodId] }),
    row.archivedAt ? currentVersions(db, [foodId]) : Promise.resolve(new Map<number, number>())])
  const card = { ...foodCard(row, userId, history, true), ...(newer.get(foodId) ? { replacedBy: newer.get(foodId) } : {}) }
  if (row.recipePortions == null) return card
  const ingredients = await (db as any).from("RecipeIngredient")
    .select("grams,servingAmount,loggedUnit,position,FoodItem!RecipeIngredient_foodItemId_fkey(id,name,brand)")
    .eq("recipeFoodItemId", foodId).order("position")
  if (ingredients.error) throw ingredients.error
  return { ...card, cookedWeightGrams: row.cookedWeightGram ? round(row.cookedWeightGram) : null,
    // Amounts for the whole recipe (all its portions).
    ingredients: ((ingredients.data ?? []) as any[]).map(item => ({
      foodId: item.FoodItem?.id ?? null, name: item.FoodItem?.name ?? null, brand: item.FoodItem?.brand ?? null,
      grams: round(item.grams),
      ...(item.loggedUnit && item.loggedUnit !== "g" && item.servingAmount ? { amount: round(item.servingAmount, 2), unit: item.loggedUnit } : {})
    })) }
}

/** The foods the user logged on local days from..to, most often first, as cards with their usual amount. A food
 * replaced by an edit since is shown as its current version (past meals keep the old one). */
export async function recentFoods(db: UserDatabase, userId: string, input: { from: string; to: string; limit: number }) {
  const history = await foodHistory(db, input)
  const rows = await loadRows(db, history.map(row => row.foodId))
  const newer = await currentVersions(db, history.filter(row => rows.get(row.foodId)?.archivedAt).map(row => row.foodId))
  const current = await loadRows(db, [...newer.values()])
  return history.flatMap(entry => {
    const replaced = newer.get(entry.foodId)
    const row = replaced ? current.get(replaced) : rows.get(entry.foodId)
    // A replaced food's usual serving belongs to the old version: the new one is logged by grams.
    const usual = replaced ? { ...entry, usualServingId: null, usualAmount: null, usualUnit: null } : entry
    return row ? [foodCard(row, userId, usual)] : []
  })
}

/** The user's current recipes and/or foods, most recently edited first, optionally narrowed by name. */
export async function listMyFoods(db: UserDatabase, userId: string, options: { kind: "recipes" | "foods" | "all"; query?: string }) {
  let request = db.from("FoodItem").select(columns).eq("privateToUserId", userId).is("archivedAt", null)
    .order("lastUpdated", { ascending: false }).limit(200)
  if (options.kind === "recipes") request = request.not("recipePortions", "is", null)
  if (options.kind === "foods") request = request.is("recipePortions", null)
  if (options.query?.trim()) request = request.ilike("name", `%${options.query.trim().replace(/[%_]/g, "")}%`)
  const { data, error } = await request
  if (error) throw error
  return ((data ?? []) as unknown as Row[]).map(row => ({ ...foodCard(row, userId),
    createdAt: row.createdAtDateTime ?? null, lastEditedAt: row.lastUpdated ?? null }))
}
