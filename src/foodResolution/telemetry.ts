import { AsyncLocalStorage } from "node:async_hooks"
import { randomUUID } from "node:crypto"
import { foodConfig } from "./config"

type Context = { traceId: string; messageId: number; inputClass: "text" | "image" | "barcode"; config: ReturnType<typeof foodConfig> }
const context = new AsyncLocalStorage<Context>()
type Metrics = { status?: string; itemsProcessed?: number; itemsToProcess?: number; model?: string;
  provider?: string; promptTokens?: number; completionTokens?: number; costUsd?: number;
  historyCandidateCount?: number; historySourceMessageIds?: number[]; historyFoodIds?: number[]; historyTruncated?: boolean;
  matchedFoodId?: number; matchedGrams?: number; agentSteps?: number; agentToolCalls?: number; agentToolErrors?: number;
  agentComparison?: string; agentFoodId?: number; agentGrams?: number;
  agentStrategy?:string;agentRoute?:string;agentFallbackReason?:string;selectorModel?:string;selectorStatus?:string;
  selectorConfidence?:number;selectorDurationMs?:number;prefetchDurationMs?:number;candidateCount?:number;validOptionCount?:number }

// Deliberate allowlist: never serialize prompts, user objects, responses, keys or errors.
export function foodMetric(stage: string, durationMs: number | null, outcome: "ok" | "error", metrics: Metrics = {}) {
  const current = context.getStore()
  if (!current?.config.telemetry) return
  try {
    console.info(JSON.stringify({ event: "food_baseline", version: 1, at: new Date().toISOString(),
      traceId: current.traceId, messageId: current.messageId, inputClass: current.inputClass,
      configVersion: current.config.version, features: current.config.features, stage, outcome,
      durationMs, status: metrics.status, itemsProcessed: metrics.itemsProcessed, itemsToProcess: metrics.itemsToProcess,
      model: metrics.model, provider: metrics.provider, promptTokens: metrics.promptTokens,
      completionTokens: metrics.completionTokens, costUsd: metrics.costUsd,
      historyCandidateCount: metrics.historyCandidateCount, historySourceMessageIds: metrics.historySourceMessageIds?.slice(0,5),
      historyFoodIds: metrics.historyFoodIds?.slice(0,30), historyTruncated: metrics.historyTruncated,
      matchedFoodId: metrics.matchedFoodId, matchedGrams: metrics.matchedGrams,
      agentSteps: metrics.agentSteps, agentToolCalls: metrics.agentToolCalls, agentToolErrors: metrics.agentToolErrors,
      agentComparison: metrics.agentComparison, agentFoodId: metrics.agentFoodId, agentGrams: metrics.agentGrams,
      agentStrategy:metrics.agentStrategy,agentRoute:metrics.agentRoute,agentFallbackReason:metrics.agentFallbackReason,
      selectorModel:metrics.selectorModel,selectorStatus:metrics.selectorStatus,selectorConfidence:metrics.selectorConfidence,
      selectorDurationMs:metrics.selectorDurationMs,prefetchDurationMs:metrics.prefetchDurationMs,
      candidateCount:metrics.candidateCount,validOptionCount:metrics.validOptionCount }))
  } catch { /* Observability must not affect food processing. */ }
}

export async function foodStage<T>(stage: string, work: () => Promise<T>, metrics: Metrics = {}): Promise<T> {
  const start = performance.now()
  try {
    const result = await work()
    foodMetric(stage, performance.now() - start, "ok", metrics)
    return result
  } catch (error) {
    foodMetric(stage, performance.now() - start, "error", metrics)
    throw error
  }
}

export function setFoodInputClass(inputClass: Context["inputClass"]) {
  const current = context.getStore()
  if (current) current.inputClass = inputClass
}

export function currentFoodConfig() { return context.getStore()?.config }

export function foodTrace<T>(userId: string, messageId: number, inputClass: Context["inputClass"], work: () => Promise<T>, boundary: "request" | "worker" = "request") {
  return context.run({ traceId: randomUUID(), messageId, inputClass, config: foodConfig(userId) }, async () => {
    const start = performance.now()
    try {
      const result = await work()
      const summary = result && typeof result === "object" ? result as Metrics : {}
      foodMetric(boundary, performance.now() - start, "ok", { status: summary.status,
        itemsProcessed: summary.itemsProcessed, itemsToProcess: summary.itemsToProcess })
      return result
    } catch (error) {
      foodMetric(boundary, performance.now() - start, "error")
      throw error
    }
  })
}
