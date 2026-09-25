// Runtime model policy. A task may choose a prompt and budget, but not silently
// revive a retired provider through an environment override.
export const FOOD_MODEL = "google/gemini-3.8-flash"
export const DECISION_MODEL = "typesafe/jev-1.13"
export const IMAGE_MODEL = "gpt-image-2.5-flare"
export const EMBEDDING_MODEL = "BAAI/bge-base-en-v1.5"

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
