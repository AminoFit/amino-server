import { selectWithJev } from "@/ai/jev"
import { compileMealPlan, type PublishedPlan } from "./compile"
import { missingVisibleFoods } from "./coverageCheck"
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

/** Compile, refuse to copy past meals the user did not refer to (a lookalike photo is not a
 * reference) and, on a first attempt, take a second look at the photos for unlogged foods. */
export async function compileCheckedMealPlan(input: MealResolutionInput, result: MealResolutionResult,
  deps: { jev?: typeof selectWithJev; missing?: typeof missingVisibleFoods; secondLook?: boolean } = {}): Promise<PublishedPlan> {
  const plan = compileMealPlan(input, result)
  if (plan.items.some(item => item.origin === "history") && !(await refersToPastMeal(input, deps)))
    throw new Error("history_not_referenced")
  if (deps.secondLook !== false && result.photoUrls?.length) {
    const logged = plan.items.map(item => {
      const food = result.evidence.foods.get(item.foodId)
      const name = food?.name ?? result.evidence.events.get(item.sourceItemId?.messageId ?? 0)?.foods
        .find(row => row.id === item.sourceItemId?.loggedFoodItemId)?.name ?? `food ${item.foodId}`
      // Descriptions of sourced foods are "Source: <url>"; only real descriptions say what a dish contains.
      const contains = food?.description && !/^(source:|https?:|estimate:)/i.test(food.description.trim()) ? food.description.slice(0, 240) : null
      return { name, contains }
    })
    const missing = await (deps.missing ?? missingVisibleFoods)(result.photoUrls, input.originalText, logged).catch(() => [])
    if (missing.length) throw new Error(`missing_visible_food: ${missing.join(", ")}`)
  }
  return plan
}
