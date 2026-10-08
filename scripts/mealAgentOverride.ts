// The meal agent on another model and/or with extra prompt text, for evals and replays (the production prompt and model
// are unchanged). Claude models use production's hosts (Anthropic, then Vertex, then Azure), get the plan schema's oneOf as anyOf (Claude's
// structured output rejects oneOf), the string limits stated (it doesn't enforce them) and a prompt-cache marker.
// MEAL_AGENT=sonnet in the evals runs the production Sonnet path instead (FeatureFlag.meal_agent_sonnet).
import { createOpenRouter } from "@openrouter/ai-sdk-provider"
import { generateText, jsonSchema, Output, zodSchema } from "ai"
import { allowingExpressions, evaluateAmounts } from "@/mealResolution/resolve"
import { mealProposal, type MealProposal } from "@/mealOperations/contracts"
import { CLAUDE_PROVIDERS, providerPreferences } from "@/ai/models"
import { CLAUDE_LIMITS, COVERAGE_TEXT, TWO_FOODS_RULE } from "@/mealResolution/agentChoice"

// Prompt variants appended to the system prompt (the production prompt is unchanged).
export const VARIANTS: Record<string, string> = {
  none: "",
  // The production text behind FeatureFlag.meal_agent_sonnet (src/mealResolution/agentChoice.ts).
  coverage: COVERAGE_TEXT,
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

// Claude's hosts as in production; EVAL_PROVIDER=<host> (for example google-vertex/global) pins one.
const claudeProviders = () => process.env.EVAL_PROVIDER
  ? { only: [process.env.EVAL_PROVIDER], allow_fallbacks: false, require_parameters: true } : CLAUDE_PROVIDERS

// The final comparison's two-foods rule (production behind FeatureFlag.meal_agent_sonnet).
export const COMPARE_RULE = TWO_FOODS_RULE

/** The vision helpers on another model, for evals: EVAL_FIRST_LOOK=<model> runs the first look there (Claude pinned to
 * Anthropic, minimal thinking as low), EVAL_COMPARE_RULE=1 adds COMPARE_RULE to the final comparison. Rewrites the
 * helpers' OpenRouter requests by their response schema's name; everything else passes through. Returns the cost of
 * the rewritten calls so far. */
export function overrideVisionHelpers(env = process.env) {
  const firstLook = env.EVAL_FIRST_LOOK, rule = env.EVAL_COMPARE_RULE === "1"
  let cost = 0
  if (!firstLook && !rule) return () => cost
  const original = globalThis.fetch
  globalThis.fetch = (async (url: Parameters<typeof fetch>[0], init?: RequestInit) => {
    if (typeof init?.body !== "string" || !String(url).startsWith("https://openrouter.ai/")) return original(url, init)
    const body = JSON.parse(init.body), schema = body.response_format?.json_schema?.name
    const look = firstLook && schema === "visible", compare = rule && schema === "missing" && typeof body.messages?.[0]?.content === "string"
    if (!look && !compare) return original(url, init)
    if (look) { body.model = firstLook
      if (firstLook.startsWith("anthropic/")) { body.provider = claudeProviders()
        if (body.reasoning?.effort === "minimal") body.reasoning.effort = "low" } }
    if (compare) body.messages[0].content = body.messages[0].content.replace("\n\nComponents", `${COMPARE_RULE}\n\nComponents`)
    body.usage = { include: true }
    const response = await original(url, { ...init, body: JSON.stringify(body) })
    cost += Number((await response.clone().json().catch(() => null))?.usage?.cost ?? 0)
    return response
  }) as typeof fetch
  return () => cost
}

export function agentOverride({ modelId, effort = "low", variant = "none" }: { modelId: string; effort?: string; variant?: string }) {
  const claude = modelId.startsWith("anthropic/")
  const extra = VARIANTS[variant]
  if (extra == null) throw new Error(`Unknown variant ${variant}`)
  const model = () => {
    const apiKey = process.env.OPENROUTER_API_KEY || process.env.OPEN_ROUTER_API_KEY
    if (!apiKey) throw new Error("OpenRouter unavailable")
    return { id: modelId, provider: "openrouter", model: createOpenRouter({ apiKey }).chat(modelId, {
      provider: claude ? claudeProviders() : providerPreferences(modelId),
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
