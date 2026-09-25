import { createAgentEvidence } from "./evidence"
import { resolveFoodAgent, AGENT_LIMITS } from "./resolve"
import { fallbackAgentModel } from "./model"
import { selectWithJev } from "@/ai/jev"
import { selectionTask, unsupportedNutritionInput } from "./selection"
import { validateProposal } from "./validate"
import { foodNutrition } from "../nutrition"
import type { AgentInput, AgentResult, EvidenceFood } from "./types"

type Evidence = ReturnType<typeof createAgentEvidence>
type History = Awaited<ReturnType<Evidence["searchUserFoodHistory"]>>
type Dependencies = {evidence?:typeof createAgentEvidence; select?:typeof selectWithJev; fallback?:typeof resolveFoodAgent;
  fallbackModel?:typeof fallbackAgentModel; fallbackEnabled?:boolean; env?:NodeJS.ProcessEnv; deadlineMs?:number}

// Explicit projection prevents accidentally forwarding database fields added later.
function readableFood(food: EvidenceFood): EvidenceFood | null {
  if (!Number.isSafeInteger(food.id) || food.id <= 0 || !foodNutrition(food,100)) return null
  return {id:food.id,name:food.name,brand:food.brand,weightUnknown:food.weightUnknown,
    defaultServingWeightGram:food.defaultServingWeightGram,kcalPerServing:food.kcalPerServing,
    proteinPerServing:food.proteinPerServing,carbPerServing:food.carbPerServing,totalFatPerServing:food.totalFatPerServing,
    servingsTruncated:food.servingsTruncated,
    Serving:food.Serving.slice(0,30).filter(s=>s.foodItemId===food.id).map(s=>({id:s.id,foodItemId:s.foodItemId,
      servingName:s.servingName,servingWeightGram:s.servingWeightGram,defaultServingAmount:s.defaultServingAmount}))}
}
export async function resolveFoodCascade(input: AgentInput, dependencies: Dependencies = {}): Promise<AgentResult> {
  const start = performance.now(), controller = new AbortController()
  const duration = Math.min(AGENT_LIMITS.deadlineMs,dependencies.deadlineMs ?? AGENT_LIMITS.deadlineMs)
  const env = {...(dependencies.env ?? process.env)}
  const result: AgentResult = {status:"unavailable",strategy:"jev_gemini",route:"none",durationMs:0,
    steps:0,toolCalls:0,toolErrors:0,promptTokens:0,completionTokens:0,model:"unknown",provider:"openrouter"}
  let timer: ReturnType<typeof setTimeout> | undefined
  let costKnown = true, cost = 0
  const live = () => controller.signal.throwIfAborted()
  try {
    const rawThreshold = env.FOOD_SELECTOR_MIN_CONFIDENCE ?? "0.9", threshold = Number(rawThreshold)
    if (!rawThreshold.trim() || !Number.isFinite(threshold) || threshold <= 0 || threshold > 1) return result
    if (input.item.full_item_user_message_including_serving.length > 2000 || input.item.food_database_search_name.length > 200) {
      result.status="unsupported_input";return result
    }
    if (unsupportedNutritionInput(input)) {
      result.status="unsupported_input";result.fallbackReason="nutrition_constraints";return result
    }
    const deadline = new Promise<never>((_,reject)=>{timer=setTimeout(()=>{controller.abort();reject(new Error("deadline"))},duration)})
    await Promise.race([(async()=>{
      const boundedInput = {...input,candidates:input.candidates.filter(c=>Number.isSafeInteger(c.id)&&c.id>0).slice(0,20)}
      const source = (dependencies.evidence ?? createAgentEvidence)(boundedInput,controller.signal)
      const evidence: Evidence = {...source,
        getFoodAndServings:async id=>{
          const food = await source.getFoodAndServings(id);live();return food ? readableFood(food) : null
        },
        getFoodsAndServings:async ids=>{
          const foods=await source.getFoodsAndServings(ids);live()
          return foods.flatMap(food=>{const safe=readableFood(food);return safe ? [safe] : []})
        }
      }
      async function read<T>(work:()=>Promise<T>): Promise<T | undefined> {
        live()
        if (result.toolCalls >= AGENT_LIMITS.toolCalls) throw new Error("budget")
        result.toolCalls++
        try {const value=await work();live();return value}
        catch {live();result.toolErrors++;return undefined}
      }
      const prefetchStart = performance.now()
      const seedIds = boundedInput.candidates.map(c=>c.id)
      // At most two concurrent reads. When there are no seeds, retrieve hints first.
      const [initial,history] = await Promise.all([
        read(async()=>seedIds.length ? source.getFoodsAndServings(seedIds) :
          (await source.searchFoodCandidates(input.item.food_database_search_name.slice(0,100))).map(c=>({id:c.id}))),
        read(()=>source.searchUserFoodHistory(input.item.food_database_search_name.slice(0,100)))
      ])
      live()
      const personalIds = history?.candidates.flatMap(c=>c.foods.map(f=>f.foodId)) ?? []
      const allIds = [...new Set([...personalIds,...(initial ?? []).map(f=>f.id)])]
      const ids = allIds.slice(0,20)
      const missing = ids.filter(id=>!source.foods.has(id))
      if (missing.length) await read(()=>source.getFoodsAndServings(missing))
      live()
      const foods = ids.flatMap(id=>{
        const raw = source.foods.get(id), food = raw && readableFood(raw)
        return food ? [food] : []
      })
      const preparedHistory: History = history ?? {disposition:"none",truncated:false,candidates:[]}
      const incomplete = result.toolErrors > 0 || preparedHistory.truncated || allIds.length > 20 || foods.some(f=>f.servingsTruncated)
      result.prefetchDurationMs = performance.now()-prefetchStart
      result.candidateCount = foods.length
      const task = selectionTask(input,foods,preparedHistory)
      result.validOptionCount = Object.keys(task.options).length-1
      result.fallbackReason = incomplete ? "prefetch_incomplete" : task.truncated ? "options_truncated" :
        result.validOptionCount === 0 ? "no_valid_options" : undefined
      if (!result.fallbackReason) {
        const selected = await (dependencies.select ?? selectWithJev)(task,controller.signal,{env})
        live()
        result.steps++;result.model=selected.model;result.selectorModel=selected.model
        result.selectorStatus=selected.status;result.selectorConfidence=selected.confidence;result.selectorDurationMs=selected.durationMs
        result.promptTokens+=selected.promptTokens;result.completionTokens+=selected.completionTokens
        if (selected.costUsd === undefined) costKnown=false; else cost+=selected.costUsd
        const proposed = selected.choice ? task.options[selected.choice] : undefined
        const resolution = proposed && validateProposal(proposed,input.item,new Map(foods.map(f=>[f.id,f])))
        if (selected.status === "ok" && selected.confidence !== undefined && selected.confidence >= threshold && resolution) {
          result.status="matched";result.route="jev";result.resolution=resolution;return
        }
        result.fallbackReason=selected.status !== "ok" ? "selector_unavailable" :
          !proposed ? "selector_unmatched" : !resolution ? "invalid_proposal" : "low_confidence"
      }
      live()
      if (!dependencies.fallbackEnabled) {result.status="fallback_disabled";return}
      result.route="gemini"
      const fallback = await (dependencies.fallback ?? resolveFoodAgent)(boundedInput,{
        evidence:()=>evidence,model:()=>(dependencies.fallbackModel ?? fallbackAgentModel)(env),abortSignal:controller.signal,
        deadlineMs:Math.max(0,duration-(performance.now()-start)),remainingToolCalls:AGENT_LIMITS.toolCalls-result.toolCalls,
        prepared:{foods,history:preparedHistory,prefetchIncomplete:incomplete}
      })
      live()
      result.status=fallback.status;result.resolution=fallback.resolution;result.model=fallback.model;result.provider=fallback.provider
      result.steps+=fallback.steps;result.toolCalls+=fallback.toolCalls;result.toolErrors+=fallback.toolErrors
      // An abstention after failed reads does not establish that no match exists.
      if (result.status === "unmatched" && result.toolErrors > 0) result.status="unavailable"
      result.promptTokens+=fallback.promptTokens;result.completionTokens+=fallback.completionTokens
      if (fallback.costUsd === undefined) costKnown=false;else cost+=fallback.costUsd
    })(),deadline])
  } catch {result.status=controller.signal.aborted ? "deadline" : "unavailable";costKnown=false;delete result.resolution}
  finally {clearTimeout(timer);controller.abort();result.durationMs=performance.now()-start}
  if (costKnown) result.costUsd=cost
  return {...result}
}
