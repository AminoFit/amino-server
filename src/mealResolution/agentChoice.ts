import { createOpenRouter } from "@openrouter/ai-sdk-provider"
import { ANTHROPIC_ONLY, MEAL_AGENT_CLAUDE } from "@/ai/models"
import { agentModel } from "@/foodResolution/agent/model"
import { userFlagEnabled } from "./fastRouteFlag"

/** Sonnet runs the meal agent and the first look at photos: "off", "all", or a comma-separated list of user IDs
 * (FeatureFlag, cached 30 s). Off, the meal runs exactly as before on Flash. */
export const SONNET_AGENT_FLAG = "meal_agent_sonnet"
export type MealAgent = "flash" | "sonnet"

export const mealAgentFor = (userId: string) =>
  userFlagEnabled(SONNET_AGENT_FLAG, userId).then(on => on ? "sonnet" as const : "flash" as const, () => "flash" as const)

export function sonnetAgentModel(env: NodeJS.ProcessEnv = process.env): ReturnType<typeof agentModel> {
  const apiKey = env.OPENROUTER_API_KEY || env.OPEN_ROUTER_API_KEY
  if (!apiKey) throw new Error("OpenRouter unavailable")
  return { id: MEAL_AGENT_CLAUDE, provider: "openrouter", model: createOpenRouter({ apiKey }).chat(MEAL_AGENT_CLAUDE, {
    provider: ANTHROPIC_ONLY, reasoning: { effort: "low" }, usage: { include: true } }) } as unknown as ReturnType<typeof agentModel>
}

// Claude answered too early (dropped the espresso next to a scanned Oatly); Flash read history and re-fetched foods.
export const COVERAGE_TEXT = `
The words around a [barcode:] chip either describe that scanned product (its amount, or a generic name for it such as
"oat milk") or name other foods eaten with it; those other foods are their own items, never omitted because of the chip.
Before you answer, go through originalText mention by mention: every food named (including drinks such as an espresso
or coffee, and each [barcode:] chip) needs its own component with an item, or an explicit omission. lockedProducts and
prefetchedFoods are evidence for some of the meal, never the whole meal: a mention with no matching food still needs a
findFood call. Do not answer while a mention is unaccounted for.
Spend turns only on evidence you lack. Do not call listMealEvents or getMealEvent unless the words refer to a past meal
("same as", "again", "yesterday's", "my usual"); recentMeals already shows what was eaten lately. Never fetch a food
again that a tool already returned in this conversation: reuse it.`

// Claude's structured output doesn't enforce string lengths (Flash's does), so the limits are stated.
export const CLAUDE_LIMITS = `
Keep each evidence string under 150 characters, a basis under 250 and a clarification under 250.`

// The final comparison: a first-look entry naming two foods ("mango and cucumber mix") is covered only when each is
// (30318 logged Cucumber Combo for it and passed).
export const TWO_FOODS_RULE = `
A component that names two or more foods (for example "rice and beans" or "mango and cucumber mix") is covered only
when the logged foods cover each of them: list each one that no logged food covers.`
