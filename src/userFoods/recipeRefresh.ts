// Recipes follow their ingredients. A recipe's values are its ingredients' sum at their grams (recipeValues), so when an
// ingredient gains vitamins or is corrected the recipe is recomputed, replacing its values (not filling them: a partial
// sum is a value, and fill-only kept recipe 15315's vitamin A at the chicken's 60.8 µg after the sauce gained 263).
// Logs of a recipe keep the values they were logged with; the outbox cron then fills only what they lack.
import { createAdminSupabase } from "@/utils/supabase/serverAdmin"
import { COLUMN_NUTRIENTS, HISTORY_NUTRIENTS, columnValues, nutrientRows, nutrientsAt, recipeValues, type Amounts, type FoodBasis,
  type PartialNutrients } from "@/nutrition"
import { setPartialNutrients } from "./userFoods"

type Db = ReturnType<typeof createAdminSupabase>
const FOOD = `id,defaultServingWeightGram,weightUnknown,${Object.values(COLUMN_NUTRIENTS).join(",")},` +
  "Nutrient(nutrientName,nutrientUnit,nutrientAmountPerDefaultServing)"
/** FoodItem.lastUpdated is a UTC wall-clock value. */
const ago = (ms: number) => new Date(Date.now() - ms).toISOString().replace("Z", "")
const finite = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value)

/** Whether two sets of values differ by more than rounding (0.1%, and more than 1e-4). */
export function valuesDiffer(before: Amounts, after: Amounts) {
  return HISTORY_NUTRIENTS.some(key => {
    const a = before[key], b = after[key]
    if (!finite(a) || !finite(b)) return finite(a) !== finite(b)
    return Math.abs(a - b) > Math.max(1e-4, 1e-3 * Math.max(Math.abs(a), Math.abs(b)))
  })
}

/** Recomputes one recipe from its ingredients as they are now; true when its values changed. */
export async function refreshRecipe(db: Db, recipeId: number): Promise<boolean> {
  const recipe = await db.from("FoodItem").select(`${FOOD},recipePortions,cookedWeightGram,partialNutrients` as any).eq("id", recipeId).maybeSingle()
  if (recipe.error) throw recipe.error
  const food = recipe.data as unknown as (FoodBasis & { recipePortions: number | null; cookedWeightGram: number | null
    partialNutrients: PartialNutrients | null }) | null
  if (!food || food.recipePortions == null || !finite(food.defaultServingWeightGram)) return false
  // Generated types predate RecipeIngredient.
  const rows = await (db as any).from("RecipeIngredient").select("foodItemId,grams").eq("recipeFoodItemId", recipeId)
  if (rows.error) throw rows.error
  const ingredients = (rows.data ?? []) as { foodItemId: number; grams: number }[]
  if (!ingredients.length) return false
  const foods = await db.from("FoodItem").select(FOOD).in("id", [...new Set(ingredients.map(row => row.foodItemId))])
  if (foods.error) throw foods.error
  const byId = new Map(((foods.data ?? []) as unknown as (FoodBasis & { id: number })[]).map(row => [row.id, row]))
  if (ingredients.some(row => !byId.has(row.foodItemId))) return false
  const values = recipeValues(ingredients.map(row => ({ food: byId.get(row.foodItemId)!, grams: Number(row.grams) })),
    Number(food.recipePortions), food.cookedWeightGram == null ? null : Number(food.cookedWeightGram))
  // Per default serving (a portion): the stored values are per portion, at the portion's stored weight.
  const perServing = Object.fromEntries(Object.entries(values.perPortion).map(([key, value]) =>
    [key, value! * food.defaultServingWeightGram! / values.portionGrams])) as Amounts
  // Which nutrients only some ingredients record can change without the values changing (an ingredient gains B12 = 0).
  if (JSON.stringify(food.partialNutrients ?? {}) !== JSON.stringify(values.partial))
    await setPartialNutrients(db, recipeId, values.partial)
  if (!valuesDiffer(nutrientsAt(food, food.defaultServingWeightGram!) ?? {}, perServing)) return false
  const saved = await (db as any).rpc("refresh_recipe_values", { p_food_id: recipeId, p_food: columnValues(perServing),
    p_nutrients: nutrientRows(perServing) })
  if (saved.error) throw saved.error
  return saved.data === true
}

/** Recomputes the recipes (current versions) that use a food updated in the last `withinMs`, at most `limit` a run. */
export async function refreshRecipesForRecentFoods(db: Db = createAdminSupabase(), withinMs = 10 * 60_000, limit = 50) {
  const foods = await db.from("FoodItem").select("id").gte("lastUpdated", ago(withinMs)).is("recipePortions", null).limit(200)
  if (foods.error) throw foods.error
  const ids = ((foods.data ?? []) as { id: number }[]).map(row => row.id)
  if (!ids.length) return { recipes: 0, refreshed: 0 }
  const uses = await (db as any).from("RecipeIngredient").select("recipeFoodItemId,FoodItem!RecipeIngredient_recipeFoodItemId_fkey(archivedAt)")
    .in("foodItemId", ids).limit(1000)
  if (uses.error) throw uses.error
  const recipes = [...new Set(((uses.data ?? []) as { recipeFoodItemId: number; FoodItem: { archivedAt: string | null } | null }[])
    .filter(row => row.FoodItem && !row.FoodItem.archivedAt).map(row => row.recipeFoodItemId))].slice(0, limit)
  let refreshed = 0
  for (const id of recipes) if (await refreshRecipe(db, id).catch(error => {
    console.warn("recipe_refresh_failed", { recipeId: id, error: error instanceof Error ? error.message : "unknown" }); return false })) refreshed++
  return { recipes: recipes.length, refreshed }
}
