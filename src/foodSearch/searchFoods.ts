// One food search for the app and the meal agent (food-search-plan.md): the trigram text search and the embedding
// search run in parallel and are blended by rank (searchBlend.ts), and the user's own recipes and foods come first in
// a "yours" group that no similarity floor ever hides. Catalogue rows found only by meaning need a cosine similarity
// of at least MEANING_FLOOR (BGE scores unrelated foods 0.65-0.73: "Chives" for "chiken brest"). When the first pass
// finds few proper matches, a typo-tolerant text pass (lower trigram bar) runs.
import { createAdminSupabase } from "@/utils/supabase/serverAdmin"
import { getCachedOrFetchEmbeddings } from "@/utils/embeddingsCache/getCachedOrFetchEmbeddings"
import { blendSearch, containsQuery, isQuery, type SearchRow } from "@/mealResolution/searchBlend"

type Db = ReturnType<typeof createAdminSupabase>
/** log: the add-to-log search (recipes included). ingredient: a recipe's foods (no recipes: they don't nest). */
export type SearchMode = "log" | "ingredient"

export const MEANING_FLOOR = 0.75
const TYPO_THRESHOLD = 0.3
const PAGE = 20
const MAX_OWN = 400

const detailColumns = `id,name,brand,description,defaultServingWeightGram,kcalPerServing,totalFatPerServing,satFatPerServing,
  transFatPerServing,carbPerServing,sugarPerServing,addedSugarPerServing,proteinPerServing,fiberPerServing,isLiquid,
  defaultServingLiquidMl,privateToUserId,recipePortions,lastUpdated,createdAtDateTime,knownAs,
  FoodItemImages(*,FoodImage(id,pathToImage,downvotes)),Serving(*)`

export type FoodSource = "recipe" | "custom" | "catalogue"
/** Why a food was found: its name matches the query's words, it means the same (close embedding), or only loosely
 * (a typo-tolerant text hit, often unrelated: "Chicken Ham" for "Haferflocken"). */
export type FoodMatch = "name" | "meaning" | "loose"
export type FoodResult = { id: number; name: string; similarity: number; match: FoodMatch; source: FoodSource
  lastEditedAt: string | null; createdAt: string | null; recipePortions: number | null; foodItem: Record<string, any>
  /** The owner of a food shared with the user. */
  sharedBy?: string | null }

const normalize = (value: string) => value.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "")
  .replace(/[^\p{L}\p{N}]+/gu, " ").trim()

/** Every query word starts a word of the food's name or brand: "pas sau" finds "Pasta Sauce", "quinoa" finds
 * "Dark Chocolate Quinoa Crisps". For the user's own foods, which are few, so a short or partial query still finds them. */
export function prefixMatch(query: string, row: { name: string; brand: string | null }) {
  const wanted = normalize(query).split(" ").filter(Boolean)
  if (!wanted.length) return false
  const have = normalize(`${row.name} ${row.brand ?? ""}`).split(" ")
  return wanted.every(word => have.some(candidate => candidate.startsWith(word)))
}

/** Time per stage, for the logs (no user content). */
function stopwatch() {
  const started = performance.now(), stages: Record<string, number> = {}
  return { stages, async time<T>(stage: string, work: Promise<T>) {
    const at = performance.now()
    try { return await work } finally { stages[stage] = Math.round(performance.now() - at) } },
  total: () => Math.round(performance.now() - started) }
}

export async function searchFoodsForUser(userId: string, query: string, options: { mode?: SearchMode; cursor?: number
  db?: Db; signal?: AbortSignal } = {}) {
  const db = options.db ?? createAdminSupabase(), mode = options.mode ?? "log", cursor = options.cursor ?? 0
  const recipes = mode === "log", text = query.trim().slice(0, 100), clock = stopwatch()
  if (!text) return { results: [] as FoodResult[], nextCursor: null as number | null, stages: clock.stages }
  const firstPage = cursor === 0
  // Meaning helps only for real words; very short queries are text only. The embedding cache is keyed on the
  // normalised query so "Pasta Sauce " and "pasta sauce" share one vector.
  const meaning = firstPage && text.length >= 4
  const [textRows, near, own] = await Promise.all([
    clock.time("text", Promise.resolve((db as any).rpc("search_meal_food_catalogue", { p_query: text, p_limit: PAGE,
      p_offset: cursor, p_user_id: userId, p_include_recipes: recipes })).then(({ data, error }: any) => {
      if (error) throw error
      return (data ?? []) as SearchRow[] })),
    meaning ? clock.time("vector", getCachedOrFetchEmbeddings("BGE_BASE", [normalize(text)]).then(([vector]) =>
      (db as any).rpc("get_cosine_results", { p_embedding_cache_id: vector.id, amount_of_results: PAGE, p_user_id: userId,
        p_include_recipes: recipes })).then(({ data, error }: any) => {
      if (error) throw error
      return ((data ?? []) as { id: number; name: string; brand: string | null; cosine_similarity: number }[]) }))
      // Meaning is an improvement: without it the text search still answers.
      .catch(() => []) : Promise.resolve([]),
    // The user's own live foods (a handful), matched by word prefixes so a partial name still finds them.
    firstPage ? clock.time("own", Promise.resolve((() => {
      let request = db.from("FoodItem").select("id,name,brand,knownAs,recipePortions,lastUpdated")
        .eq("privateToUserId", userId).is("archivedAt", null).limit(MAX_OWN)
      if (!recipes) request = request.is("recipePortions", null)
      return request })()).then(({ data, error }: any) => {
      if (error) throw error
      return ((data ?? []) as (SearchRow & { lastUpdated: string })[]).filter(row => prefixMatch(text, row)) })) : Promise.resolve([])
  ])
  const proper = (row: SearchRow) => prefixMatch(text, row) || isQuery(text, row) || containsQuery(text, row)
  // Typos ("chiken brest") share too few trigrams for the first pass: a looser one, only when little was found.
  if (firstPage && textRows.filter(proper).length + near.filter(row => row.cosine_similarity >= MEANING_FLOOR).length < 5) {
    const loose = await clock.time("typo", Promise.resolve((db as any).rpc("search_meal_food_catalogue", { p_query: text,
      p_limit: PAGE, p_offset: 0, p_user_id: userId, p_include_recipes: recipes, p_threshold: TYPO_THRESHOLD }))
      .then(({ data, error }: any) => error ? [] : (data ?? []) as SearchRow[]).catch(() => [] as SearchRow[]))
    for (const row of loose) if (!textRows.some(seen => seen.id === row.id)) textRows.push(row)
  }
  const similarity = new Map(near.map(row => [row.id, row.cosine_similarity]))
  const meaningful = near.filter(row => row.cosine_similarity >= MEANING_FLOOR || own.some(mine => mine.id === row.id))
    .map(row => ({ id: row.id, name: row.name, brand: row.brand, knownAs: null }))
  const blended = blendSearch(text, textRows, meaningful, 40)
  const ids = [...new Set([...own.map(row => row.id), ...blended.map(row => row.id)])]
  const details = ids.length ? await clock.time("hydrate", Promise.resolve(db.from("FoodItem").select(detailColumns).in("id", ids))
    .then(({ data, error }: any) => {
    if (error) throw error
    return new Map(((data ?? []) as Record<string, any>[]).map(food => [food.id as number, food])) })) : new Map()

  const toResult = (id: number): FoodResult | null => {
    const food = details.get(id)
    if (!food) return null
    // The four best icons, as the app picks them: fewest downvotes, then the newest.
    const images = [...(food.FoodItemImages ?? [])].filter((image: any) => image.FoodImage)
      .sort((a: any, b: any) => a.FoodImage.downvotes - b.FoodImage.downvotes || b.FoodImage.id - a.FoodImage.id).slice(0, 4)
    const match: FoodMatch = food.privateToUserId === userId || proper(food as SearchRow) ? "name"
      : (similarity.get(id) ?? 0) >= MEANING_FLOOR ? "meaning" : "loose"
    return { id, name: food.name, similarity: similarity.get(id) ?? 1, match,
      source: food.recipePortions != null ? "recipe" : food.privateToUserId ? "custom" : "catalogue",
      sharedBy: food.privateToUserId && food.privateToUserId !== userId ? food.privateToUserId as string : null,
      lastEditedAt: food.lastUpdated ?? null, createdAt: food.createdAtDateTime ?? null,
      recipePortions: food.recipePortions ?? null, foodItem: { ...food, FoodItemImages: images } }
  }
  // A recipe can't be an ingredient (recipes don't nest), whatever the agent's recipe flag lets the searches return.
  if (!recipes) for (const [id, food] of details) if (food.recipePortions != null) details.delete(id)
  const order = new Map(blended.map((row, index) => [row.id, index]))
  // Yours: an exact name first, then the blend's order, then the most recently edited.
  const yourIds = ids.filter(id => details.get(id)?.privateToUserId === userId).sort((a, b) => {
    const rowA = details.get(a)!, rowB = details.get(b)!
    return Number(isQuery(text, rowB)) - Number(isQuery(text, rowA)) ||
      (order.get(a) ?? 1e6) - (order.get(b) ?? 1e6) || String(rowB.lastUpdated).localeCompare(String(rowA.lastUpdated))
  })
  const yours = yourIds.map(toResult).filter((row): row is FoodResult => !!row)
  // Foods people shared with the user (the searches return those they can see): after their own, before the catalogue.
  const fromPeople = blended.filter(row => details.get(row.id)?.privateToUserId && details.get(row.id)!.privateToUserId !== userId)
    .map(row => toResult(row.id)).filter((row): row is FoodResult => !!row)
  // Catalogue: the exact name, then names made of the query's words (whole or started: "pas sau"), then the blend
  // (close meaning, then the rest of the text hits). Fuzzy text-only hits ("Com tam suom" for "pas sau") are kept only
  // when few foods match properly; they still rescue a typo.
  const shared = blended.filter(row => details.get(row.id) && !details.get(row.id)!.privateToUserId)
  const rank = (row: SearchRow) => isQuery(text, row) ? 0 : prefixMatch(text, row) || containsQuery(text, row) ? 1 : 2
  const ranked = shared.map((row, index) => ({ row, index })).sort((a, b) => rank(a.row) - rank(b.row) || a.index - b.index)
    .map(({ row }) => row)
  const strong = ranked.filter(row => proper(row) || (similarity.get(row.id) ?? 0) >= MEANING_FLOOR)
  const catalogue = (strong.length >= 5 ? strong : ranked).map(row => toResult(row.id)).filter((row): row is FoodResult => !!row)
  console.info("food_search", { mode, page: cursor, ms: clock.total(), ...clock.stages, yours: yours.length,
    catalogue: catalogue.length, containing: catalogue.filter(row => containsQuery(text, details.get(row.id))).length })
  return { results: [...yours, ...fromPeople, ...catalogue], nextCursor: textRows.length === PAGE ? cursor + PAGE : null as number | null,
    stages: clock.stages }
}
