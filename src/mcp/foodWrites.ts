import { z } from "zod"
import { createAdminSupabase } from "@/utils/supabase/serverAdmin"
import { MICRO_KEYS } from "@/nutrition"
import { normalizeGtin } from "@/mealResolution/barcode"
import { UserFoodError, archiveUserFood, customFoodInput, getUserFood, recipeInput, saveCustomFood, saveRecipe,
  type CustomFoodInput, type RecipeInput } from "@/userFoods/userFoods"
import type { UserDatabase } from "./auth"
import { McpInputError } from "./meals"
import { getFood } from "./foods"

// The user's own foods and recipes, written by agents (2026-10-03-mcp-food-search-and-writes-plan.md, phase 3) through
// the Foods tab's own functions: the server prices and validates, edits apply going forward (a food already logged gets
// a new version), deleting archives. Agents never write the shared catalogue: everything here is private to the user.

const amount = z.number().finite().nonnegative().max(45000)
const serving = z.object({
  unit: z.string().trim().min(1).max(40).describe("e.g. bar, cup, slice, g"),
  amount: z.number().finite().positive().max(1000).describe("how many units the values are for, usually 1"),
  grams: z.number().finite().positive().max(5000).describe("what that many units weigh (millilitres for a drink)")
})
const nutrientKeys = MICRO_KEYS as unknown as [string, ...string[]]

/** A food's fields as agents send them. Energy and macros are for `serving`. */
export const foodFields = {
  name: z.string().trim().min(2).max(120),
  brand: z.string().trim().max(120).nullable().optional(),
  serving,
  isLiquid: z.boolean().optional(),
  kcal: amount, proteinG: amount, carbG: amount, totalFatG: amount,
  fiberG: amount.nullable().optional(), sugarG: amount.nullable().optional(), addedSugarG: amount.nullable().optional(),
  satFatG: amount.nullable().optional(), transFatG: amount.nullable().optional(),
  nutrients: z.partialRecord(z.enum(nutrientKeys), amount).optional()
    .describe("Other nutrients for the same serving, by key with its unit: sodiumMg, potassiumMg, calciumMg, ironMg, " +
      "vitaminCMg, vitaminDMcg, cholesterolMg, caffeineMg, …"),
  extraServings: z.array(serving).max(8).optional().describe("Other ways to measure it (1 cup = 240 g)"),
  barcode: z.string().trim().max(20).nullable().optional().describe("The package's EAN/UPC digits; null removes it")
}
const foodSchema = z.object(foodFields)
type FoodFields = z.infer<typeof foodSchema>

const ingredient = z.object({
  foodId: z.number().int().positive().describe("A food (not a recipe) from search_foods"),
  grams: z.number().finite().positive().max(20000).optional(),
  servingId: z.number().int().positive().optional().describe("One of the food's servings, with `amount`"),
  amount: z.number().finite().positive().max(10000).optional()
}).refine(item => item.servingId != null ? item.amount != null && item.grams == null : item.grams != null,
  "Give grams, or a servingId and an amount")
export const recipeFields = {
  name: z.string().trim().min(2).max(120),
  portions: z.number().finite().positive().max(1000).describe("How many portions these amounts make"),
  cookedWeightGrams: z.number().finite().positive().max(50000).nullable().optional()
    .describe("The whole dish's weight once cooked, if known"),
  ingredients: z.array(ingredient).min(1).max(50).describe("Amounts for the whole recipe (all its portions)")
}
const recipeSchema = z.object(recipeFields)
type RecipeFields = z.infer<typeof recipeSchema>

const MESSAGES: Record<string, string> = {
  values_do_not_fit_serving: "The energy and macros don't fit the serving: check kcal, protein, carbs and fat are for " +
    "`serving` (its grams), not per 100 g.",
  invalid_barcode: "That barcode isn't valid: check its digits.",
  ingredient_unavailable: "An ingredient isn't a food the user can use. Ingredients must be foods (recipes don't " +
    "nest) from search_foods.",
  ingredient_nutrition_unavailable: "An ingredient has no usable nutrition, so the recipe can't be priced. Pick another food.",
  invalid_ingredient_amount: "An ingredient's amount isn't valid.",
  invalid_portion_weight: "The portions come out at an impossible weight: check the amounts and portions.",
  serving_unavailable: "That serving doesn't belong to the food. Use a servingId from search_foods or get_food.",
  food_unavailable: "No food or recipe of the user's own has that id. Find them with list_my_foods.",
  invalid_food: "Some values aren't valid. Check them and try again."
}

/** A Foods-tab failure as something the agent can fix. */
function asInputError(error: unknown): never {
  if (error instanceof UserFoodError && MESSAGES[error.code]) throw new McpInputError(MESSAGES[error.code])
  if (error instanceof z.ZodError) throw new McpInputError(`Some values aren't valid: ${error.issues.slice(0, 3)
    .map(issue => `${issue.path.join(".") || "input"}: ${issue.message}`).join("; ")}`)
  throw error
}

const toCustomFood = (fields: FoodFields): CustomFoodInput => {
  const { barcode, ...rest } = fields
  return customFoodInput.parse({ ...rest, ...(barcode !== undefined ? { gtin: barcode } : {}) })
}
const toRecipe = (fields: RecipeFields): RecipeInput => recipeInput.parse({ name: fields.name, portions: fields.portions,
  cookedWeightGram: fields.cookedWeightGrams ?? null, ingredients: fields.ingredients.map(item => item.servingId != null
    ? { foodItemId: item.foodId, servingId: item.servingId, amount: item.amount }
    : { foodItemId: item.foodId, grams: item.grams }) })

const identity = (name: string, brand?: string | null) =>
  `${name.trim().toLowerCase().replace(/\s+/g, " ")}|${(brand ?? "").trim().toLowerCase().replace(/\s+/g, " ")}`

/** The user's current food or recipe with this name (and brand), or this barcode. */
async function existingOwn(userId: string, match: { name?: string; brand?: string | null; gtin?: string | null }) {
  const db = createAdminSupabase() as any
  if (match.gtin) {
    const { data, error } = await db.from("FoodItem").select("id").eq("privateToUserId", userId).is("archivedAt", null)
      .eq("gtin", match.gtin).limit(1)
    if (error) throw error
    if (data?.length) return data[0].id as number
  }
  if (!match.name) return null
  const { data, error } = await db.from("FoodItem").select("id,name,brand").eq("privateToUserId", userId)
    .is("archivedAt", null).ilike("name", match.name.trim().replace(/[%_\\]/g, "\\$&"))
  if (error) throw error
  const wanted = identity(match.name, match.brand)
  return ((data ?? []) as { id: number; name: string; brand: string | null }[])
    .find(row => identity(row.name, row.brand) === wanted)?.id ?? null
}

/** Creates one of the user's own foods. One the user already has (same name and brand, or barcode) is returned instead,
 * so a retried call never makes a second copy. */
export async function createFood(db: UserDatabase, userId: string, fields: FoodFields) {
  const input = await Promise.resolve().then(() => toCustomFood(fields)).catch(asInputError)
  const gtin = input.gtin ? normalizeGtin(input.gtin) : null
  const existing = await existingOwn(userId, { name: input.name, brand: input.brand, gtin })
  if (existing) return { created: false, note: "The user already has this food: nothing was created.",
    food: await getFood(db, userId, existing) }
  const saved = await saveCustomFood(userId, null, input).catch(async error => {
    if (error instanceof UserFoodError && error.code === "name_taken") return null
    return asInputError(error)
  })
  const id = saved?.foodId ?? await existingOwn(userId, { name: input.name, brand: input.brand })
  if (!id) throw new McpInputError("The user already has a food or recipe with that name. Use a different name.")
  return saved ? { created: true, food: await getFood(db, userId, id) }
    : { created: false, note: "The user already has a food with this name: nothing was created.", food: await getFood(db, userId, id) }
}

/** Creates one of the user's own recipes, priced from its ingredients. */
export async function createRecipe(db: UserDatabase, userId: string, fields: RecipeFields) {
  const input = await Promise.resolve().then(() => toRecipe(fields)).catch(asInputError)
  const saved = await saveRecipe(userId, null, input).catch(async error => {
    if (error instanceof UserFoodError && error.code === "name_taken") return null
    return asInputError(error)
  })
  if (!saved) {
    const id = await existingOwn(userId, { name: input.name })
    if (!id) throw new McpInputError("The user already has a food or recipe with that name. Use a different name.")
    return { created: false, note: "The user already has a recipe with this name: nothing was created. Edit it with " +
      "update_recipe.", recipe: await getFood(db, userId, id) }
  }
  return { created: true, recipe: await getFood(db, userId, saved.foodId) }
}

type OwnFood = Awaited<ReturnType<typeof getUserFood>>

async function ownCurrent(userId: string, id: number, kind: "food" | "recipe") {
  const food: OwnFood = await getUserFood(userId, id).catch(asInputError)
  if (food.privateToUserId !== userId || food.archivedAt)
    throw new McpInputError(food.archivedAt ? "That is an older version: edit the current one (get_food shows replacedBy)."
      : "Only the user's own foods and recipes can be changed. Amino's shared foods can't be edited.")
  if ((food.recipePortions != null) !== (kind === "recipe"))
    throw new McpInputError(kind === "recipe" ? "That is a food, not a recipe: use update_food." : "That is a recipe: use update_recipe.")
  return food
}

const round = (value: number) => Math.round(value * 1000) / 1000

/** The fields of a food as saved, so an edit can change only what the agent passes. */
export function currentFoodFields(food: OwnFood): FoodFields {
  const base = Number(food.defaultServingWeightGram)
  const servings = food.Serving.filter(s => Number(s.servingWeightGram) > 0)
  const main = servings.find(s => Math.abs(Number(s.servingWeightGram) - base) < 0.01)
  const per = (food.perServing ?? {}) as Record<string, number | undefined>
  const nutrients = Object.fromEntries(MICRO_KEYS.flatMap(key => per[key] != null ? [[key, round(per[key]!)]] : []))
  return {
    name: food.name, brand: food.brand,
    serving: { unit: main?.servingName ?? "g", amount: Number(main?.defaultServingAmount ?? (main ? 1 : base)), grams: base },
    isLiquid: food.isLiquid,
    kcal: round(per.kcal ?? 0), proteinG: round(per.proteinG ?? 0), carbG: round(per.carbG ?? 0), totalFatG: round(per.totalFatG ?? 0),
    fiberG: per.fiberG ?? null, sugarG: per.sugarG ?? null, addedSugarG: per.addedSugarG ?? null, satFatG: per.satFatG ?? null,
    transFatG: per.transFatG ?? null, nutrients,
    extraServings: servings.filter(s => s !== main).map(s => ({ unit: s.servingName, amount: Number(s.defaultServingAmount ?? 1),
      grams: Number(s.servingWeightGram) })),
    // Kept on a new version (a new row) unless the agent changes it.
    barcode: (food as { gtin?: string | null }).gtin ?? undefined
  }
}

/** Changes one of the user's own foods; only the fields passed change. Past meals keep the values they were logged
 * with: a food already logged is saved as a new version (a new id). */
export async function updateFood(db: UserDatabase, userId: string, id: number, change: Partial<FoodFields>) {
  const food = await ownCurrent(userId, id, "food")
  const current = currentFoodFields(food)
  const merged: FoodFields = { ...current, ...Object.fromEntries(Object.entries(change).filter(([, v]) => v !== undefined)),
    nutrients: change.nutrients ? { ...current.nutrients, ...change.nutrients } : current.nutrients }
  const input = await Promise.resolve().then(() => toCustomFood(merged)).catch(asInputError)
  const saved = await saveCustomFood(userId, id, input).catch(error => {
    if (error instanceof UserFoodError && error.code === "name_taken")
      throw new McpInputError("The user already has a food or recipe with that name. Use a different name.")
    return asInputError(error)
  })
  return { updated: true, ...(saved.versioned ? { newVersion: true, previousId: id,
    note: "The food was already logged, so this is a new version with a new id; past meals keep the old values." } : {}),
    food: await getFood(db, userId, saved.foodId) }
}

/** Changes one of the user's own recipes; only the fields passed change (`ingredients` replaces the whole list). */
export async function updateRecipe(db: UserDatabase, userId: string, id: number, change: Partial<RecipeFields>) {
  const recipe = await ownCurrent(userId, id, "recipe")
  const ingredients = ((recipe.ingredients ?? []) as { foodItemId: number; grams: number; servingId: number | null
    servingAmount: number | null }[]).map(item => item.servingId != null && item.servingAmount != null
    ? { foodId: item.foodItemId, servingId: item.servingId, amount: item.servingAmount }
    : { foodId: item.foodItemId, grams: item.grams })
  const merged: RecipeFields = { name: change.name ?? recipe.name, portions: change.portions ?? Number(recipe.recipePortions),
    cookedWeightGrams: change.cookedWeightGrams !== undefined ? change.cookedWeightGrams : recipe.cookedWeightGram,
    ingredients: change.ingredients ?? ingredients }
  const input = await Promise.resolve().then(() => toRecipe(merged)).catch(asInputError)
  const saved = await saveRecipe(userId, id, input).catch(error => {
    if (error instanceof UserFoodError && error.code === "name_taken")
      throw new McpInputError("The user already has a food or recipe with that name. Use a different name.")
    return asInputError(error)
  })
  return { updated: true, ...(saved.versioned ? { newVersion: true, previousId: id,
    note: "The recipe was already logged, so this is a new version with a new id; past meals keep the old values." } : {}),
    recipe: await getFood(db, userId, saved.foodId) }
}

/** Deletes (archives) one of the user's own foods or recipes. Past meals keep showing it. */
export async function deleteFood(userId: string, id: number) {
  const food: OwnFood = await getUserFood(userId, id).catch(asInputError)
  if (food.privateToUserId !== userId) throw new McpInputError("Only the user's own foods and recipes can be deleted.")
  if (food.archivedAt) return { deleted: true, note: "It was already deleted." }
  await archiveUserFood(userId, id).catch(asInputError)
  return { deleted: true, id, name: food.name }
}
