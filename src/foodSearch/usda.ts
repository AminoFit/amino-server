// "More from USDA" in the app's food search (food-search-plan.md, step 3): USDA FoodData Central records the catalogue
// doesn't have yet. Picking one creates the shared catalogue food first, through the same duplicate-checked function
// as the meal agent (same USDA record or same identity: the existing food), so the next search finds it in the
// catalogue and a recipe always points at a real food. The catalogue is the cache: USDA is searched only on request.
import { createAdminSupabase } from "@/utils/supabase/serverAdmin"
import { getCachedOrFetchEmbeddings } from "@/utils/embeddingsCache/getCachedOrFetchEmbeddings"
import { getUsdaFoodsInfo } from "@/FoodDbThirdPty/USDA/getFoodInfo"
import { validNutrition } from "@/nutrition"
import { UserFoodError } from "@/userFoods/userFoods"
import { cleanServings } from "@/mealResolution/foodSources"

type Db = ReturnType<typeof createAdminSupabase>
const normalize = (value: string) => value.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "")
  .replace(/[^\p{L}\p{N}]+/gu, " ").trim()
type UsdaFood = NonNullable<Awaited<ReturnType<typeof getUsdaFoodsInfo>>>[number]

/** A USDA record as a catalogue food payload, or null when it lacks a weight basis or sound values. */
function catalogueFood(food: UsdaFood) {
  const grams = food.defaultServingWeightGram
  if (!grams || food.weightUnknown || food.kcalPerServing == null) return null
  // A record with macros but 0 kcal is broken data ("Jackfruit in heavy syrup", 0 kcal), not a zero-calorie food.
  const macros = (food.proteinPerServing ?? 0) + (food.carbPerServing ?? 0) + (food.totalFatPerServing ?? 0)
  if (food.kcalPerServing <= 0 && macros > 1) return null
  if (!validNutrition(grams, { kcal: food.kcalPerServing, proteinG: food.proteinPerServing ?? null,
    carbG: food.carbPerServing ?? null, totalFatG: food.totalFatPerServing ?? null })) return null
  return { food: { name: food.name, brand: food.brand || null, foodInfoSource: "USDA", externalId: food.externalId,
    defaultServingWeightGram: grams, kcal: food.kcalPerServing, proteinG: food.proteinPerServing, carbG: food.carbPerServing,
    totalFatG: food.totalFatPerServing, fiberG: food.fiberPerServing, sugarG: food.sugarPerServing,
    satFatG: food.satFatPerServing, isLiquid: food.isLiquid, source: `USDA FoodData Central ${food.externalId}` },
    servings: food.Serving.flatMap(s => s.servingWeightGram && s.servingName ? [{ name: s.servingName,
      grams: s.servingWeightGram, amount: Number(s.defaultServingAmount) || 1 }] : []).slice(0, 10) }
}

/** USDA records for a query that the catalogue doesn't already hold, with values per serving for the list. */
export async function searchUsda(query: string, { limit = 8, db = createAdminSupabase() }: { limit?: number; db?: Db } = {}) {
  const text = query.trim().slice(0, 100)
  if (text.length < 2) return []
  const [vector] = await getCachedOrFetchEmbeddings("BGE_BASE", [normalize(text)])
  const near = await (db as any).rpc("search_usda_database", { embedding_id: vector.id, limit_amount: limit * 2 })
  if (near.error) throw near.error
  const rows = (near.data ?? []) as { fdcId: number; cosineSimilarity: number }[]
  if (!rows.length) return []
  const known = await db.from("FoodItem").select("externalId").eq("foodInfoSource", "USDA")
    .in("externalId", rows.map(row => String(row.fdcId)))
  const inCatalogue = new Set(((known.data ?? []) as { externalId: string }[]).map(row => row.externalId))
  const wanted = rows.filter(row => !inCatalogue.has(String(row.fdcId))).slice(0, limit)
  if (!wanted.length) return []
  const details = (await getUsdaFoodsInfo({ fdcIds: wanted.map(row => String(row.fdcId)) })) ?? []
  const similarity = new Map(wanted.map(row => [String(row.fdcId), row.cosineSimilarity]))
  return details.flatMap(food => {
    const mapped = catalogueFood(food)
    if (!mapped) return []
    const { food: f, servings } = mapped
    return [{ fdcId: Number(food.externalId), name: f.name, brand: f.brand, similarity: similarity.get(String(food.externalId)) ?? 0,
      servingGrams: f.defaultServingWeightGram, kcal: f.kcal, proteinG: f.proteinG ?? 0, carbG: f.carbG ?? 0,
      totalFatG: f.totalFatG ?? 0, servings: servings.map(s => ({ unit: s.name, grams: s.grams, amount: s.amount })) }]
  }).sort((a, b) => b.similarity - a.similarity)
}

/** The catalogue food for a USDA record: the existing one when the catalogue has it, else a new shared food. */
export async function foodFromUsda(userId: string, fdcId: number, db: Db = createAdminSupabase()) {
  const [record] = (await getUsdaFoodsInfo({ fdcIds: [String(fdcId)] })) ?? []
  const mapped = record ? catalogueFood(record) : null
  if (!mapped) throw new UserFoodError("usda_food_unavailable", 404)
  const label = mapped.food.brand ? `${mapped.food.name} - ${mapped.food.brand}` : mapped.food.name
  const [vector] = await getCachedOrFetchEmbeddings("BGE_BASE", [label])
  const { data, error } = await (db as any).rpc("create_catalogue_food", { p_user_id: userId, p_message_id: null,
    p_food: { ...mapped.food, bgeBaseEmbedding: JSON.stringify(vector.embedding) }, p_servings: cleanServings(mapped.servings) })
  if (error) throw error
  const row = (data as { food_id: number; created: boolean }[])[0]
  if (row.created) {
    const [{ classifyFoodCategoryQueue }, { generateFoodIconQueue }] = await Promise.all([
      import("@/app/api/queues/classify-food-category/classify-food-category"),
      import("@/app/api/queues/generate-food-icon/generate-food-icon")])
    await Promise.all([classifyFoodCategoryQueue.enqueue(String(row.food_id)),
      generateFoodIconQueue.enqueue(String(row.food_id), { id: `icon-${row.food_id}` })])
      .catch(queueError => console.error("USDA food created, but enrichment could not be queued", { foodId: row.food_id, queueError }))
  }
  return { foodId: row.food_id, created: row.created }
}
