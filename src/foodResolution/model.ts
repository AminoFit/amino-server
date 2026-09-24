import { foodCompletion as legacyCompletion, FOOD_REASONING_MODEL } from "@/languageModelProviders/gemini/foodCompletion"
import { foodStage } from "./telemetry"

export { FOOD_REASONING_MODEL }
export type FoodCompletionOptions = Parameters<typeof legacyCompletion>[0]

// Stable application boundary. Keep wire format, prompts, defaults and fallback
// exactly as before; an SDK transport can be evaluated independently later.
export function foodCompletion(options: FoodCompletionOptions, user: Parameters<typeof legacyCompletion>[1]) {
  return foodStage("reasoning", () => legacyCompletion(options, user))
}
