import { selectWithJev } from "@/ai/jev"
import { compileMealPlan, type PublishedPlan } from "./compile"
import { missingFromVisibleList, missingVisibleFoods } from "./coverageCheck"
import type { MealResolutionInput, MealResolutionResult } from "./resolve"

const POLICY = `Decide whether the user's own words explicitly refer to a meal they logged before, for example
"same as yesterday", "my usual breakfast", "again" or "the rest of last night's pasta", in any language.
A description or photo of food that merely resembles a past meal is NOT a reference. Empty text is not a reference.`

/** True only when Jev is confident the wording refers to a past meal. */
export async function refersToPastMeal(input: Pick<MealResolutionInput, "originalText" | "answers">,
  deps: { jev?: typeof selectWithJev; signal?: AbortSignal } = {}): Promise<boolean> {
  const text = input.originalText.trim()
  if (!text && !input.answers?.length) return false
  const decision = await (deps.jev ?? selectWithJev)({ options: { yes: true, no: false },
    state: { userWords: text, answers: (input.answers ?? []).map(answer => answer.text) },
    questions: { selection: { type: "choice", instructions: POLICY,
      criteria: { yes: "The user refers to a previously logged meal.", no: "The user does not refer to a previous meal." } } } },
    deps.signal ?? AbortSignal.timeout(5000))
  return decision.status === "ok" && decision.choice === "yes" && (decision.confidence ?? 0) >= 0.9
}

const RECIPE_POLICY = `Decide whether the user's words mean the named recipe: their own dish, saved under that name.
They mean it when they name it (exactly or nearly, in any language) or call it theirs ("my chili", "a bowl of the
pasta I made"). A generic dish word that merely shares a word with the recipe name does not ("pasta at a restaurant"
is not their "Chicken pasta"; "chili flakes" is not their "Chili"). Empty text is never a reference.`

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
    const logged = plan.items.map(item => {
      const food = result.evidence.foods.get(item.foodId)
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
