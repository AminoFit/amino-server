import { selectWithJev } from "@/ai/jev"
import { compileMealPlan, type PublishedPlan } from "./compile"
import { missingFromVisibleList, missingVisibleFoods } from "./coverageCheck"
import type { MealResolutionInput, MealResolutionResult } from "./resolve"

const POLICY = `Decide whether the user's own words explicitly refer to a meal they logged before, for example
"same as yesterday", "my usual breakfast", "again" or "the rest of last night's pasta", in any language. Words that
refer to how much they usually have of a food are a reference too: "the same amount of eggs I usually have", "my
usual portion of oats", "as much as last time".
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
No when they describe a different dish: only a shared generic word ("pasta at a restaurant" is not "Chicken pasta";
"chili flakes" is not "Turkey chili"), separate foods that happen to share its words ("grilled chicken with pasta
salad"), or a version clearly not theirs ("from the restaurant", "from the deli"). Empty text is never the recipe.`

/** True only when Jev is confident the user's words mean this recipe of theirs. */
export async function refersToRecipe(input: Pick<MealResolutionInput, "originalText" | "answers">, recipeName: string,
  deps: { jev?: typeof selectWithJev; signal?: AbortSignal } = {}): Promise<boolean> {
  const text = input.originalText.trim()
  if (!text && !input.answers?.length) return false
  const decision = await (deps.jev ?? selectWithJev)({ options: { yes: true, no: false },
    state: { userWords: text, answers: (input.answers ?? []).map(answer => answer.text), recipeName },
    questions: { selection: { type: "choice", instructions: RECIPE_POLICY,
      criteria: { yes: "The user means this recipe of theirs.", no: "The user does not mean this recipe." } } } },
    deps.signal ?? AbortSignal.timeout(5000))
  return decision.status === "ok" && decision.choice === "yes" && (decision.confidence ?? 0) >= 0.9
}

/** Recipes in the plan the user's words don't mean. A recipe is the user's own dish: it is logged only when they name
 * it, never because a photo or a generic word resembles it. */
async function unreferencedRecipes(input: MealResolutionInput, result: MealResolutionResult, plan: PublishedPlan,
  deps: { jev?: typeof selectWithJev }) {
  const recipes = new Map<number, string>()
  for (const item of plan.items) {
    const food = result.evidence.foods.get(item.foodId)
    if (food?.recipePortions != null) recipes.set(food.id, food.name)
  }
  const checks = await Promise.all([...recipes].map(async ([id, name]) =>
    (await refersToRecipe(input, name, deps).catch(() => false)) ? null : `${name} (food ${id})`))
  return checks.filter((name): name is string => name !== null)
}

/** Compile, refuse to copy past meals the user did not refer to (a lookalike photo is not a
 * reference) and, on a first attempt, take a second look at the photos for unlogged foods. */
export async function compileCheckedMealPlan(input: MealResolutionInput, result: MealResolutionResult,
  deps: { jev?: typeof selectWithJev; missing?: typeof missingVisibleFoods; missingFromList?: typeof missingFromVisibleList;
    secondLook?: boolean } = {}): Promise<PublishedPlan> {
  const plan = compileMealPlan(input, result)
  if (plan.items.some(item => item.origin === "history") && !(await refersToPastMeal(input, deps)))
    throw new Error("history_not_referenced")
  const recipes = await unreferencedRecipes(input, result, plan, deps)
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
      ? (deps.missingFromList ?? missingFromVisibleList)(result.visibleFoods, logged)
      : (deps.missing ?? missingVisibleFoods)(result.photoUrls, input.originalText, logged)).catch(() => [])
    if (missing.length) throw new Error(`missing_visible_food: ${missing.join(", ")}`)
  }
  return plan
}
