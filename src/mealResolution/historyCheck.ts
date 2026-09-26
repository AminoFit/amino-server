import { selectWithJev } from "@/ai/jev"
import { compileMealPlan, type PublishedPlan } from "./compile"
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

/** Compile, then refuse to copy past meals the user did not refer to (a lookalike photo is not a reference). */
export async function compileCheckedMealPlan(input: MealResolutionInput, result: MealResolutionResult,
  deps: { jev?: typeof selectWithJev } = {}): Promise<PublishedPlan> {
  const plan = compileMealPlan(input, result)
  if (plan.items.some(item => item.origin === "history") && !(await refersToPastMeal(input, deps)))
    throw new Error("history_not_referenced")
  return plan
}
