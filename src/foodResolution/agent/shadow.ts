import { currentFoodConfig, foodMetric } from "../telemetry"
import type { resolveFoodAgent } from "./resolve"
import type { AgentInput, AgentResult } from "./types"

// Per-process admission limit. Saturated workers skip comparisons, never queue
// additional model work behind the user's food save.
let active = 0
export function startFoodAgentShadow(input: AgentInput, run?: typeof resolveFoodAgent): Promise<AgentResult | null> {
  const features = currentFoodConfig()?.features
  if (features?.fast_selector === "on") return Promise.resolve(null)
  const cascade = features?.fast_selector === "shadow"
  if (!cascade && features?.agent_text !== "shadow") return Promise.resolve(null)
  if (active >= 2) {
    foodMetric("agent_shadow",0,"ok",{status:"capacity"})
    return Promise.resolve(null)
  }
  active++
  return Promise.resolve().then(async()=>run ? run(input) : cascade ?
    (await import("./cascade")).resolveFoodCascade(input,{fallbackEnabled:features?.agent_fallback === "shadow"}) :
    (await import("./resolve")).resolveFoodAgent(input)).catch(()=>null).finally(()=>{active--})
}

export async function finishFoodAgentShadow(pending: Promise<AgentResult | null> | undefined,
  baseline: {foodId:number;grams:number} | undefined) {
  if (!pending) return
  try {
    const result = await pending
    if (!result) return
    const proposed = result.resolution
    const comparison = !["matched","unmatched"].includes(result.status) ? "not_comparable" : !baseline ? (proposed ? "agent_only" : "both_unmatched") : !proposed ? "baseline_only" :
      baseline.foodId !== proposed.foodId ? "different_food" : Math.abs(baseline.grams-proposed.grams) > .01 ? "different_quantity" : "agree"
    foodMetric("agent_shadow",result.durationMs,["matched","unmatched"].includes(result.status) ? "ok" : "error",{
      status:result.status,model:result.model,provider:result.provider,promptTokens:result.promptTokens,completionTokens:result.completionTokens,costUsd:result.costUsd,
      agentSteps:result.steps,agentToolCalls:result.toolCalls,agentToolErrors:result.toolErrors,agentComparison:comparison,
      agentFoodId:proposed?.foodId,agentGrams:proposed?.grams,matchedFoodId:baseline?.foodId,matchedGrams:baseline?.grams,
      agentStrategy:result.strategy,agentRoute:result.route,agentFallbackReason:result.fallbackReason,
      selectorModel:result.selectorModel,selectorStatus:result.selectorStatus,selectorConfidence:result.selectorConfidence,
      selectorDurationMs:result.selectorDurationMs,prefetchDurationMs:result.prefetchDurationMs,
      candidateCount:result.candidateCount,validOptionCount:result.validOptionCount
    })
  } catch { /* A comparison can never change food progress or turn a committed item into a failure. */ }
}
