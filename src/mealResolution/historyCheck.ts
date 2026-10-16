import { selectWithJev } from "@/ai/jev"
import { createAdminSupabase } from "@/utils/supabase/serverAdmin"
import { compileMealPlan, type PublishedPlan } from "./compile"
import { missingFromVisibleList, missingVisibleFoods } from "./coverageCheck"
import type { MealResolutionInput, MealResolutionResult } from "./resolve"

const POLICY = `Decide whether the user's own words explicitly refer to a meal they logged before, for example
"same as yesterday", "my usual breakfast", "again" or "the rest of last night's pasta", in any language. Words that
refer to how much they usually have of a food are a reference too: "the same amount of eggs I usually have", "my
usual portion of oats", "as much as last time". "My usual <food or dish>" ("my usual fajita base", "mi café de siempre")
refers to how they've had it before, so it is a reference too.
A description or photo of food that merely resembles a past meal is NOT a reference. Empty text is not a reference.`

/** True only when Jev is confident the wording refers to a past meal. */
export async function refersToPastMeal(input: Pick<MealResolutionInput, "originalText" | "answers">,
  deps: { jev?: typeof selectWithJev; signal?: AbortSignal } = {}): Promise<boolean> {
  // Barcode chips from the app's camera are products, not words: they only distract from the wording.
  const text = input.originalText.replace(/\[barcode:\d{8,14}\]/gi, " ").replace(/\s+/g, " ").trim()
  if (!text && !input.answers?.length) return false
  const decision = await (deps.jev ?? selectWithJev)({ options: { yes: true, no: false },
    state: { userWords: text, answers: (input.answers ?? []).map(answer => answer.text) },
    questions: { selection: { type: "choice", instructions: POLICY,
      criteria: { yes: "The user refers to a previously logged meal.", no: "The user does not refer to a previous meal." } } } },
    deps.signal ?? AbortSignal.timeout(5000))
  return decision.status === "ok" && decision.choice === "yes" && (decision.confidence ?? 0) >= 0.9
}

const RECIPE_POLICY = `The user has a saved recipe with this name: a dish they make. Decide whether the food they describe IS that saved dish.
Yes when their words name it: the recipe name (or a close variant, spelling, or translation in any language) appears as
the dish they ate, with or without "my", "a bowl of", "a portion of", "half a portion of" or other amounts. Yes for
"my <dish>" and "my usual <dish>". Saved names may carry dates or notes ("Chili - 9/30") that the user leaves out.
Yes too, confidently, when they say the dish is their own ("my recipe", "my custom …", "my homemade …", "the … I
made", "mine", in any language) and this is the one of their recipes (theirRecipes lists them all) whose name shares
the distinctive word they use for it, even if the rest of the name differs: "my homemade curry recipe" is their
"Chickpea Coconut Curry" when no other recipe of theirs is a curry. A dish they made recently or log often makes this
likelier still, and the other foods in the meal (otherFoods) can show how it was eaten (a curry with rice, a filling
in a tortilla).
No when they describe a different dish: only a shared generic word with nothing saying it's theirs ("pasta at a
restaurant" is not "Chicken pasta"; "chili flakes" is not "Turkey chili"), separate foods that happen to share its
words ("grilled chicken with pasta salad"), a version clearly not theirs ("from the restaurant", "from the deli",
"store-bought", a brand), or when another of their recipes fits their words better. Empty text is never the recipe.`

type RecipeContext = { theirRecipes: { name: string; madeDaysAgo: number | null; loggedLast14Days: number;
  lastLoggedDaysAgo: number | null }[]; otherFoods: string[] }

/** True only when Jev is confident the user's words mean this recipe of theirs. */
export async function refersToRecipe(input: Pick<MealResolutionInput, "originalText" | "answers">, recipeName: string,
  deps: { jev?: typeof selectWithJev; signal?: AbortSignal } = {}, context?: RecipeContext): Promise<boolean> {
  // Barcode chips from the app's camera are products, not words: they only distract from the wording.
  const text = input.originalText.replace(/\[barcode:\d{6,14}\]/gi, " ").replace(/\s+/g, " ").trim()
  if (!text && !input.answers?.length) return false
  const decision = await (deps.jev ?? selectWithJev)({ options: { yes: true, no: false },
    state: { userWords: text, answers: (input.answers ?? []).map(answer => answer.text), recipeName,
      ...(context ?? {}) },
    questions: { selection: { type: "choice", instructions: RECIPE_POLICY,
      criteria: { yes: "The user means this recipe of theirs.", no: "The user does not mean this recipe." } } } },
    deps.signal ?? AbortSignal.timeout(5000))
  // 0.8, not 0.9: with the user's recipe list in front of it Jev's yes/no is reliable, but its confidence on a dish the
  // user calls theirs without naming it in full sits around 0.86-0.92 (scripts/check-recipe-guard.ts, 2026-10-16).
  return decision.status === "ok" && decision.choice === "yes" && (decision.confidence ?? 0) >= RECIPE_YES_CONFIDENCE
}

export const RECIPE_YES_CONFIDENCE = 0.8

/** Recipes in the plan the user's words don't mean. A recipe is the user's own dish: it is logged only when they name
 * it, never because a photo or a generic word resembles it. */
async function unreferencedRecipes(input: MealResolutionInput, result: MealResolutionResult, plan: PublishedPlan,
  deps: { jev?: typeof selectWithJev; recipeContext?: typeof userRecipeContext }) {
  const recipes = new Map<number, string>()
  for (const item of plan.items) {
    const food = result.evidence.foods.get(item.foodId)
    if (food?.recipePortions != null) recipes.set(food.id, food.name)
  }
  if (!recipes.size) return []
  // The other foods in the meal, and the user's whole recipe list: whether their words fit this dish better than any
  // other of theirs, and how recently and often they eat it.
  const otherFoods = plan.items.filter(item => !recipes.has(item.foodId))
    .map(item => result.evidence.foods.get(item.foodId)?.name).filter((name): name is string => Boolean(name))
  const theirRecipes = await (deps.recipeContext ?? userRecipeContext)(input.userId).catch(() => [])
  const context = { theirRecipes, otherFoods }
  const checks = await Promise.all([...recipes].map(async ([id, name]) =>
    (await refersToRecipe(input, name, deps, context).catch(() => false)) ? null : `${name} (food ${id})`))
  return checks.filter((name): name is string => name !== null)
}

/** The user's saved recipes for the recipe check: when each was made and how recently and often they log it. */
export async function userRecipeContext(userId: string): Promise<RecipeContext["theirRecipes"]> {
  const db = createAdminSupabase() as any
  const { data: foods, error } = await db.from("FoodItem").select("id,name,createdAtDateTime")
    .eq("privateToUserId", userId).not("recipePortions", "is", null).is("archivedAt", null).limit(100)
  if (error) throw error
  if (!foods?.length) return []
  const since = new Date(Date.now() - 60 * 86400000).toISOString()
  const { data: logs, error: logError } = await db.from("LoggedFoodItem").select("foodItemId,consumedOn")
    .eq("userId", userId).is("deletedAt", null).gte("consumedOn", since).in("foodItemId", foods.map((food: any) => food.id))
  if (logError) throw logError
  const daysAgo = (at: string | null) => at ? Math.max(0, Math.floor((Date.now() - Date.parse(at)) / 86400000)) : null
  return foods.map((food: { id: number; name: string; createdAtDateTime: string | null }) => {
    const mine = ((logs ?? []) as { foodItemId: number; consumedOn: string }[]).filter(log => log.foodItemId === food.id)
    const last = mine.reduce<string | null>((latest, log) => !latest || log.consumedOn > latest ? log.consumedOn : latest, null)
    return { name: food.name, madeDaysAgo: daysAgo(food.createdAtDateTime),
      loggedLast14Days: mine.filter(log => Date.parse(log.consumedOn) > Date.now() - 14 * 86400000).length,
      lastLoggedDaysAgo: daysAgo(last) }
  })
}

/** Compile, refuse to copy past meals the user did not refer to (a lookalike photo is not a
 * reference) and, on a first attempt, take a second look at the photos for unlogged foods.
 * The past-meal and recipe guards check Flash plans and the text fast route only: Sonnet judges "my usual …" and "my
 * custom fajita recipe" better than a yes/no from Jev, which vetoed the user's own recipe for a store fajita mix
 * (meal 30774; scripts/sonnet-recipe-check.ts, 2026-10-16: 13/14, no recipe logged that wasn't meant). */
export async function compileCheckedMealPlan(input: MealResolutionInput, result: MealResolutionResult,
  deps: { jev?: typeof selectWithJev; missing?: typeof missingVisibleFoods; missingFromList?: typeof missingFromVisibleList;
    secondLook?: boolean; recipeContext?: typeof userRecipeContext } = {}): Promise<PublishedPlan> {
  const plan = compileMealPlan(input, result)
  const guarded = result.agent !== "sonnet"
  if (guarded && plan.items.some(item => item.origin === "history") && !(await refersToPastMeal(input, deps)))
    throw new Error("history_not_referenced")
  const recipes = guarded ? await unreferencedRecipes(input, result, plan, deps) : []
  if (recipes.length) throw Object.assign(new Error("recipe_not_referenced"),
    { detail: `the user's words don't name ${recipes.join(", ")}: log what they describe with catalogue foods instead` })
  if (deps.secondLook !== false && result.photoUrls?.length) {
    const decoded = new Set(result.barcodes ?? [])
    const logged = plan.items.map(item => {
      const food = result.evidence.foods.get(item.foodId)
      // A product found by its decoded barcode is the package in the photo, whatever the first look called it.
      if (food?.gtin && decoded.has(food.gtin)) return { name: food.name,
        contains: "Identified by its decoded barcode: this is the packaged product in the photo, whatever its packaging looks like." }
      const name = food?.name ?? result.evidence.events.get(item.sourceItemId?.messageId ?? 0)?.foods
        .find(row => row.id === item.sourceItemId?.loggedFoodItemId)?.name ?? `food ${item.foodId}`
      // Descriptions of sourced foods are "Source: <url>"; only real descriptions say what a dish contains.
      const contains = food?.description && !/^(source:|https?:|estimate:)/i.test(food.description.trim()) ? food.description.slice(0, 240) : null
      return { name, contains }
    })
    // With a first look at the photos, the check compares text (fast); otherwise it looks at the photos again.
    const missing = await (result.visibleFoods?.length
      ? (deps.missingFromList ?? missingFromVisibleList)(result.visibleFoods, logged, { twoFoodsRule: result.agent === "sonnet" })
      : (deps.missing ?? missingVisibleFoods)(result.photoUrls, input.originalText, logged)).catch(() => [])
    if (missing.length) throw new Error(`missing_visible_food: ${missing.join(", ")}`)
  }
  return plan
}
