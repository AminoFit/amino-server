import { foodCompletion as flashCompletion, FOOD_REASONING_MODEL } from "@/languageModelProviders/gemini/foodCompletion"
import { foodStage } from "./telemetry"

export { FOOD_REASONING_MODEL }
export type FoodCompletionOptions = Parameters<typeof flashCompletion>[0]

// Shared Flash boundary for food text and vision work.
export function foodCompletion(options: FoodCompletionOptions, user: Parameters<typeof flashCompletion>[1]) {
  return foodStage("reasoning", () => flashCompletion(options, user))
}
