// Runtime model policy. A task may choose a prompt and budget, but not silently
// revive a retired provider through an environment override.
export const FOOD_MODEL = "google/gemini-3.8-flash"
export const DECISION_MODEL = "typesafe/jev-1.13"
export const IMAGE_MODEL = "gpt-image-2.5-flare"
export const EMBEDDING_MODEL = "BAAI/bge-base-en-v1.5"
// The one exception to Flash/Jev: turning web or label evidence into a new
// catalogue food. Creation is rare, so a stronger model costs little.
export const CREATION_MODELS = ["anthropic/claude-sonnet-5", "anthropic/claude-opus-5"] as const
export type CreationModel = typeof CREATION_MODELS[number]
export const DEFAULT_CREATION_MODEL: CreationModel = "anthropic/claude-sonnet-5"

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
