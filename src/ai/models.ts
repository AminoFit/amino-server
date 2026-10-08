// Runtime model policy. A task may choose a prompt and budget, but not silently
// revive a retired provider through an environment override.
export const FOOD_MODEL = "google/gemini-3.8-flash"
export const DECISION_MODEL = "typesafe/jev-1.13"
export const IMAGE_MODEL = "openai/gpt-image-2.5-sunburst"
export const EMBEDDING_MODEL = "BAAI/bge-base-en-v1.5"
// Transcribing a nutrition label from a photo (often dark, blurry or sideways): Sonnet 5.5 read a rotated Mexican
// label exactly and declined an unreadable one, where Flash's readings varied between runs.
export const LABEL_MODEL = "anthropic/claude-sonnet-5.5"
// The one exception to Flash/Jev: turning web or label evidence into a new
// catalogue food. Creation is rare, so a stronger model costs little.
export const CREATION_MODELS = ["anthropic/claude-sonnet-5.5", "anthropic/claude-opus-5.5"] as const
export type CreationModel = typeof CREATION_MODELS[number]
export const DEFAULT_CREATION_MODEL: CreationModel = "anthropic/claude-sonnet-5.5"
// The meal agent and its first look at photos behind FeatureFlag.meal_agent_sonnet (FOOD_AGENT_MODELS.md, 7 October):
// 22/22 photo cases, fewest steps, p90 28 s against Flash's 53 s.
export const MEAL_AGENT_CLAUDE = "anthropic/claude-sonnet-5.5"
// Claude on Anthropic's own endpoint only, so the prompt cache stays warm and structured output behaves as tested.
export const ANTHROPIC_ONLY = { only: ["anthropic"], allow_fallbacks: false, require_parameters: true }

export function foodModel(env: NodeJS.ProcessEnv = process.env): typeof FOOD_MODEL {
  const configured = env.FOOD_REASONING_MODEL
  if (configured && configured !== FOOD_MODEL) {
    throw new Error(`Unsupported food model: ${configured}`)
  }
  return FOOD_MODEL
}

export function decisionModel(env: NodeJS.ProcessEnv = process.env): typeof DECISION_MODEL {
  const configured = env.FOOD_SELECTOR_MODEL
  if (configured && configured !== DECISION_MODEL) {
    throw new Error(`Unsupported decision model: ${configured}`)
  }
  return DECISION_MODEL
}

export function creationModel(env: NodeJS.ProcessEnv = process.env): CreationModel {
  const configured = env.FOOD_CREATION_MODEL
  if (!configured) return DEFAULT_CREATION_MODEL
  if (!(CREATION_MODELS as readonly string[]).includes(configured)) throw new Error(`Unsupported creation model: ${configured}`)
  return configured as CreationModel
}

/** OpenRouter routing: Gemini prefers Google Vertex (the account's higher limits,
 * including a bring-your-own Vertex key) and falls back to Google AI Studio. */
export function providerPreferences(model: string) {
  return model.startsWith("google/")
    ? { order: ["google-vertex", "google-ai-studio"], allow_fallbacks: true, require_parameters: true }
    : { require_parameters: true }
}
