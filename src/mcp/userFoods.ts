import type { UserDatabase } from "./auth"
import { McpInputError } from "./meals"
import { COLUMN_NUTRIENTS, nutrientsAt, type Amounts } from "@/nutrition"

// The user's own foods and recipes (the app's Foods tab), read as the user: row-level security limits FoodItem to
// shared foods plus their own, and the queries keep only their own. A recipe's values are per portion.

const columns = `id,name,brand,recipePortions,cookedWeightGram,archivedAt,createdAtDateTime,lastUpdated,isLiquid,
  defaultServingWeightGram,weightUnknown,${Object.values(COLUMN_NUTRIENTS).join(",")},
  Serving(id,servingName,servingWeightGram,defaultServingAmount),Nutrient(nutrientName,nutrientUnit,nutrientAmountPerDefaultServing)`

type Row = Record<string, any> & { id: number; name: string; recipePortions: number | null; defaultServingWeightGram: number | null }

const round = (value: number) => Math.round(value * 10) / 10
function nutrition(row: Row, all: boolean) {
  const amounts: Amounts = nutrientsAt(row as any, Number(row.defaultServingWeightGram)) ?? {}
  const keys = all ? Object.keys(amounts) : ["kcal", "proteinG", "carbG", "totalFatG", "fiberG", "sugarG", "satFatG", "sodiumMg"]
  return Object.fromEntries(keys.flatMap(key => amounts[key as keyof Amounts] != null ? [[key, round(amounts[key as keyof Amounts]!)]] : []))
}

function summary(row: Row, all = false) {
  const recipe = row.recipePortions != null
  const grams = round(Number(row.defaultServingWeightGram))
  const main = (row.Serving ?? []).find((s: any) => Math.abs(Number(s.servingWeightGram) - Number(row.defaultServingWeightGram)) < 0.01)
  return {
    id: row.id, name: row.name, brand: row.brand ?? null, kind: recipe ? "recipe" : "food",
    ...(recipe ? { portions: Number(row.recipePortions), portionGrams: grams,
      ...(row.cookedWeightGram ? { cookedWeightGrams: round(row.cookedWeightGram) } : {}) } : {}),
    // What the values are for: one portion of a recipe, else the food's own serving.
    per: recipe ? `1 portion (${grams} g)` : main ? `${Number(main.defaultServingAmount ?? 1)} ${main.servingName} (${grams} g)` : `${grams} g`,
    nutrition: nutrition(row, all),
    servings: (row.Serving ?? []).map((s: any) => ({ unit: s.servingName,
      gramsPerUnit: s.servingWeightGram && s.defaultServingAmount ? round(s.servingWeightGram / Number(s.defaultServingAmount)) : null })),
    createdAt: row.createdAtDateTime ?? null, lastEditedAt: row.lastUpdated ?? null,
    ...(row.archivedAt ? { archived: true } : {})
  }
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
  return ((data ?? []) as unknown as Row[]).map(row => summary(row))
}

/** One of the user's foods or recipes with every nutrient and, for a recipe, its foods (for all its portions).
 * Older versions (replaced by an edit) are readable too, since past meals may use them. */
export async function getMyFood(db: UserDatabase, userId: string, foodId: number) {
  const { data, error } = await db.from("FoodItem").select(columns).eq("id", foodId).eq("privateToUserId", userId).maybeSingle()
  if (error) throw error
  if (!data) throw new McpInputError("No food or recipe of yours has that id. Use list_my_foods to find it.")
  const row = data as unknown as Row
  if (row.recipePortions == null) return summary(row, true)
  const ingredients = await (db as any).from("RecipeIngredient")
    .select("grams,servingAmount,loggedUnit,position,FoodItem!RecipeIngredient_foodItemId_fkey(id,name,brand)")
    .eq("recipeFoodItemId", foodId).order("position")
  if (ingredients.error) throw ingredients.error
  return { ...summary(row, true), ingredients: ((ingredients.data ?? []) as any[]).map(item => ({
    foodId: item.FoodItem?.id ?? null, name: item.FoodItem?.name ?? null, brand: item.FoodItem?.brand ?? null,
    grams: round(item.grams),
    ...(item.loggedUnit && item.loggedUnit !== "g" && item.servingAmount ? { amount: round(item.servingAmount), unit: item.loggedUnit } : {})
  })) }
}
