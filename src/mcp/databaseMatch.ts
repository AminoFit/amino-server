import { createAdminSupabase } from "@/utils/supabase/serverAdmin"
import { selectWithJev } from "@/ai/jev"
import { DUPLICATE_POLICY } from "@/mealResolution/foodSources"
import { brandsMatch } from "@/mealResolution/catalogueNaming"
import { foodForGtin } from "@/foodSearch/packageBarcodes"
import { searchFoodsForUser } from "@/foodSearch/searchFoods"
import { searchUsda } from "@/foodSearch/usda"

// Before create_food saves a food of the user's own, the shared catalogue and USDA are asked whether they already have
// it: agents copied USDA records into custom foods ("Pinot Noir wine (USDA)", "Challah bread (USDA)", 2026-10) that
// lose the record's servings and micronutrients and help nobody else. The same duplicate policy as the meal agent's
// decides (Jev at 0.9 or more), and only foods of the same brand (or both unbranded) are compared, so a restaurant
// dish isn't stood in for by a generic record. The check never blocks the fallback: when it can't answer, the food is
// created, and the agent can say the match is a different food (differsFromDatabase).

type Db = ReturnType<typeof createAdminSupabase>
export type NewFood = { name: string; brand?: string | null; gtin?: string | null; kcal: number; proteinG: number
  servingGrams: number }
export type DatabaseMatch = { kind: "catalogue"; foodId: number; name: string; brand: string | null }
  | { kind: "usda"; usdaId: number; name: string; brand: string | null }
type Candidate = { key: string; match: DatabaseMatch; kcal: number | null; proteinG: number | null; grams: number | null }
type Deps = { db?: Db; search?: typeof searchFoodsForUser; usda?: typeof searchUsda; jev?: typeof selectWithJev }

const CHECK_MS = 8_000
const per100 = (value: number | null, grams: number | null) =>
  value != null && grams ? Math.round(value * 1000 / grams) / 10 : null

/** The shared catalogue food or USDA record that is this food, or null (also when the check couldn't tell). */
export async function databaseMatch(userId: string, food: NewFood, deps: Deps = {}): Promise<DatabaseMatch | null> {
  const db = deps.db ?? createAdminSupabase()
  const signal = AbortSignal.timeout(CHECK_MS)
  try {
    // A barcode decides outright.
    if (food.gtin) {
      const shared = await foodForGtin(db, null, food.gtin)
      const [row] = shared ? await names(db, [shared.foodId]) : []
      if (row) return { kind: "catalogue", foodId: row.id, name: row.name, brand: row.brand }
    }
    const label = food.brand && !food.name.toLowerCase().includes(food.brand.toLowerCase()) ? `${food.brand} ${food.name}` : food.name
    const timeout = new Promise<never>((_, reject) => signal.addEventListener("abort", () => reject(signal.reason), { once: true }))
    const [found, records] = await Promise.race([Promise.all([
      (deps.search ?? searchFoodsForUser)(userId, label, { mode: "ingredient", db, signal }),
      (deps.usda ?? searchUsda)(label, { limit: 5, db })]), timeout])
    const ids = found.results.filter(result => result.source === "catalogue" && result.match !== "loose").slice(0, 5)
      .map(result => result.id)
    const catalogue: Candidate[] = (await names(db, ids)).map(row => ({ key: `food_${row.id}`,
      match: { kind: "catalogue", foodId: row.id, name: row.name, brand: row.brand }, kcal: row.kcal, proteinG: row.proteinG,
      grams: row.grams }))
    const usda: Candidate[] = records.map(record => ({ key: `usda_${record.fdcId}`,
      match: { kind: "usda", usdaId: record.fdcId, name: record.name, brand: record.brand || null }, kcal: record.kcal,
      proteinG: record.proteinG, grams: record.servingGrams }))
    // A branded food is only ever its brand's; a generic food is never a branded product.
    const candidates = [...catalogue, ...usda].filter(c => food.brand?.trim() ? brandsMatch(food.brand, c.match.brand)
      : !c.match.brand?.trim())
    if (!candidates.length) return null
    const options: Record<string, unknown> = { none: null }, criteria: Record<string, string> = { none: "No candidate is the same food." }
    for (const c of candidates) { options[c.key] = c.key; criteria[c.key] = `Database food ${c.key}.` }
    const decision = await (deps.jev ?? selectWithJev)({ options, state: {
      newFood: { name: food.name, brand: food.brand ?? null, kcalPer100g: per100(food.kcal, food.servingGrams),
        proteinPer100g: per100(food.proteinG, food.servingGrams) },
      catalogue: candidates.map(c => ({ id: c.key, name: c.match.name, brand: c.match.brand, kcalPer100g: per100(c.kcal, c.grams),
        proteinPer100g: per100(c.proteinG, c.grams) })) },
      questions: { selection: { type: "choice", instructions: DUPLICATE_POLICY, criteria } } }, signal)
    if (decision.status !== "ok" || (decision.confidence ?? 0) < 0.9) return null
    return candidates.find(c => c.key === decision.choice)?.match ?? null
  } catch (error) {
    console.warn("create_food_database_check_failed", { error: error instanceof Error ? error.message : error })
    return null
  }
}

async function names(db: Db, ids: number[]) {
  if (!ids.length) return []
  const { data, error } = await db.from("FoodItem").select("id,name,brand,kcalPerServing,proteinPerServing,defaultServingWeightGram")
    .in("id", ids).is("privateToUserId", null).is("archivedAt", null)
  if (error) throw error
  const rows = (data ?? []) as { id: number; name: string; brand: string | null; kcalPerServing: number | null
    proteinPerServing: number | null; defaultServingWeightGram: number | null }[]
  return ids.flatMap(id => rows.filter(row => row.id === id)).map(row => ({ id: row.id, name: row.name,
    brand: row.brand || null, kcal: row.kcalPerServing, proteinG: row.proteinPerServing, grams: row.defaultServingWeightGram }))
}
