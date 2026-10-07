// The meal agent on another model and/or with extra prompt text, for evals and replays (the production prompt and model
// are unchanged). Claude models are pinned to Anthropic on OpenRouter, get the plan schema's oneOf as anyOf (Claude's
// structured output rejects oneOf), the string limits stated (it doesn't enforce them) and a prompt-cache marker.
import { createOpenRouter } from "@openrouter/ai-sdk-provider"
import { generateText, jsonSchema, Output, zodSchema } from "ai"
import { allowingExpressions, evaluateAmounts } from "@/mealResolution/resolve"
import { mealProposal, type MealProposal } from "@/mealOperations/contracts"
import { providerPreferences } from "@/ai/models"

// Prompt variants appended to the system prompt (the production prompt is unchanged).
export const VARIANTS: Record<string, string> = {
  none: "",
  // Claude answered too early (dropped the espresso next to a scanned Oatly); Flash read history and re-fetched foods.
  coverage: `
The words around a [barcode:] chip either describe that scanned product (its amount, or a generic name for it such as
"oat milk") or name other foods eaten with it; those other foods are their own items, never omitted because of the chip.
Before you answer, go through originalText mention by mention: every food named (including drinks such as an espresso
or coffee, and each [barcode:] chip) needs its own component with an item, or an explicit omission. lockedProducts and
prefetchedFoods are evidence for some of the meal, never the whole meal: a mention with no matching food still needs a
findFood call. Do not answer while a mention is unaccounted for.
Spend turns only on evidence you lack. Do not call listMealEvents or getMealEvent unless the words refer to a past meal
("same as", "again", "yesterday's", "my usual"); recentMeals already shows what was eaten lately. Never fetch a food
again that a tool already returned in this conversation: reuse it.`,
}

const withoutArrayBounds = (node: unknown): unknown => Array.isArray(node) ? node.map(withoutArrayBounds) :
  node && typeof node === "object" ? Object.fromEntries(Object.entries(node)
    .filter(([key]) => key !== "maxItems" && key !== "minItems").map(([key, value]) => [key, withoutArrayBounds(value)])) : node
const oneOfToAnyOf = (node: unknown): unknown => Array.isArray(node) ? node.map(oneOfToAnyOf) :
  node && typeof node === "object" ? Object.fromEntries(Object.entries(node)
    .map(([key, value]) => [key === "oneOf" ? "anyOf" : key, oneOfToAnyOf(value)])) : node
const claudeOutput = Output.object({ schema: jsonSchema<MealProposal>(
  oneOfToAnyOf(allowingExpressions(withoutArrayBounds(zodSchema(mealProposal).jsonSchema))) as Parameters<typeof jsonSchema>[0],
  { validate: value => { const parsed = mealProposal.safeParse(evaluateAmounts(value))
    return parsed.success ? { success: true, value: parsed.data } : { success: false, error: parsed.error } } }) })

// Claude's structured output doesn't enforce string lengths (Flash's does), so the limits are stated.
const CLAUDE_LIMITS = `
Keep each evidence string under 150 characters, a basis under 250 and a clarification under 250.`

export function agentOverride({ modelId, effort = "low", variant = "none" }: { modelId: string; effort?: string; variant?: string }) {
  const claude = modelId.startsWith("anthropic/")
  const extra = VARIANTS[variant]
  if (extra == null) throw new Error(`Unknown variant ${variant}`)
  const model = () => {
    const apiKey = process.env.OPENROUTER_API_KEY || process.env.OPEN_ROUTER_API_KEY
    if (!apiKey) throw new Error("OpenRouter unavailable")
    return { id: modelId, provider: "openrouter", model: createOpenRouter({ apiKey }).chat(modelId, {
      provider: claude ? { only: ["anthropic"], allow_fallbacks: false, require_parameters: true } : providerPreferences(modelId),
      reasoning: { effort: effort as "low" }, usage: { include: true } }) } as any
  }
  // The agent's request with the variant's text, and for Claude the anyOf schema and a cache marker on the system prompt.
  const generate = ((request: any) => {
    const system = request.system + extra + (claude ? CLAUDE_LIMITS : "")
    const call = !claude ? generateText({ ...request, system }) : generateText({ ...request, system: undefined, output: claudeOutput,
      allowSystemInMessages: true,
      messages: [{ role: "system", content: system, providerOptions: { openrouter: { cacheControl: { type: "ephemeral" } } } },
        ...request.messages] })
    // A schema failure's raw answer says what the model got wrong (DEBUG=1).
    return process.env.DEBUG ? call.catch((error: any) => {
      console.error("generate_failed", String(error?.cause ?? "").slice(0, 1500), "\n--- text:", String(error?.text ?? "").slice(0, 3000))
      throw error }) : call
  }) as typeof generateText
  return { model, generate }
}
