import { createHash } from "node:crypto"

export const FOOD_FEATURES = ["history_search", "history_reuse", "agent_text", "fast_selector", "agent_fallback", "agent_image", "grounded_search", "grounded_import"] as const
export type FoodFeature = typeof FOOD_FEATURES[number]
export type FoodMode = "off" | "shadow" | "on"

// Live reuse has its own opt-in cohort; shadow search cannot change saved foods.
const IMPLEMENTED: Partial<Record<FoodFeature, readonly FoodMode[]>> = { history_search: ["shadow"], history_reuse: ["on"], agent_text: ["shadow"], fast_selector:["shadow"], agent_fallback:["shadow"] }
export function foodConfig(userId: string, env: NodeJS.ProcessEnv = process.env,
  capabilities: Partial<Record<FoodFeature, readonly FoodMode[]>> = IMPLEMENTED) {
  const features = {} as Record<FoodFeature, FoodMode>
  for (const feature of FOOD_FEATURES) {
    const key = `FOOD_${feature.toUpperCase()}`
    const requested = env[key] ?? "off"
    const rawPercent = env[`${key}_PERCENT`] ?? "0"
    const percent = Number(rawPercent)
    const bucket = createHash("sha256").update(`food-v1:${feature}:${userId}`).digest().readUInt32BE(0) / 2 ** 32 * 100
    const valid = rawPercent.trim() !== "" && Number.isFinite(percent) && percent >= 0 && percent <= 100
    features[feature] = env.FOOD_KILL_SWITCH !== "true" && valid && bucket < percent &&
      (requested === "shadow" || requested === "on") && capabilities[feature]?.includes(requested)
      ? requested : "off"
  }
  // Import can never be live while its evidence source is shadow-only/off.
  if (features.grounded_search !== "on") features.grounded_import = "off"
  if (features.fast_selector !== "shadow") features.agent_fallback = "off"
  return Object.freeze({ version: "jev-gemini-shadow-v1", telemetry: env.FOOD_BASELINE_TELEMETRY === "true",
    features: Object.freeze(features) })
}
