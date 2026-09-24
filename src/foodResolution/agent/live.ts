import { currentFoodConfig, foodMetric } from "../telemetry"
import { createAdminSupabase } from "@/utils/supabase/serverAdmin"
import { explicitMassServing } from "@/foodMessageProcessing/getServingSizeFromFoodItem/explicitMassServing"
import { validateProposal } from "./validate"
import type { FoodItemWithNutrientsAndServing } from "@/app/dashboard/utils/FoodHelper"
import type { AgentInput, AgentResult, Resolution } from "./types"
import type { resolveFoodCascade } from "./cascade"
import type { LoggedFoodServing } from "@/utils/loggedFoodItemInterface"

async function readMatchedFood(id: number, signal: AbortSignal): Promise<FoodItemWithNutrientsAndServing | null> {
  const {data,error}=await createAdminSupabase().from("FoodItem").select("*,Nutrient(*),Serving(*)")
    .eq("id",id).limit(31,{foreignTable:"Serving"}).abortSignal(signal).maybeSingle()
  if (error) throw new Error("Catalogue revalidation unavailable")
  return data
}

export type LiveFood = { food:FoodItemWithNutrientsAndServing; serving:LoggedFoodServing; resolution:Resolution;
  provenance:{strategy:"jev_gemini";route:string;model:string} }

// Models only propose. The worker owns the existing item update and progress.
export async function tryFoodAgentLive(input: AgentInput, dependencies: {
  run?:typeof resolveFoodCascade; read?:typeof readMatchedFood
} = {}): Promise<LiveFood | null> {
  const features=currentFoodConfig()?.features
  if (features?.fast_selector !== "on") return null
  const start=performance.now(),controller=new AbortController()
  let timer:ReturnType<typeof setTimeout>|undefined,result:AgentResult|undefined,accepted=false
  let status="unavailable"
  try {
    result=await (dependencies.run ?? (await import("./cascade")).resolveFoodCascade)(input,
      {fallbackEnabled:features.agent_fallback === "on"})
    status=result.status
    if (result.status !== "matched" || !result.resolution) return null
    const proposal=result.resolution
    const remaining=12000-(performance.now()-start)
    if (remaining<=0) {status="deadline";return null}
    const deadline=new Promise<never>((_,reject)=>{
      timer=setTimeout(()=>{controller.abort();reject(new Error("deadline"))},Math.min(2000,remaining))
    })
    const food=await Promise.race([(dependencies.read ?? readMatchedFood)(proposal.foodId,controller.signal),deadline])
    const verified=food && validateProposal({decision:"match",foodId:proposal.foodId,servingId:proposal.servingId},input.item,new Map([[food.id,food]]))
    if (!verified || !food || (["grams","kcal","proteinG","carbG","totalFatG"] as const).some(key=>{
      const a=verified[key],b=proposal[key];return a===null || b===null ? a!==b : Math.abs(a-b)>.000001
    })) {status="invalid_proposal";return null}
    let serving:LoggedFoodServing
    if (verified.servingId===null) serving=explicitMassServing(input.item.full_item_user_message_including_serving)!
    else {
      const row=food.Serving.find(s=>s.id===verified.servingId)!
      const amount=verified.grams / row.servingWeightGram! * row.defaultServingAmount!
      serving={serving_id:row.id,serving_amount:amount,serving_name:row.servingName,serving_g_or_ml:"g",
        total_serving_g_or_ml:verified.grams,full_serving_string:`${amount} ${row.servingName}`}
    }
    if (!serving) {status="invalid_proposal";return null}
    accepted=true
    return {food,serving,resolution:verified,provenance:{strategy:"jev_gemini",route:result.route ?? "unknown",model:result.model}}
  } catch {status=controller.signal.aborted ? "deadline" : "unavailable";return null}
  finally {
    clearTimeout(timer);controller.abort()
    foodMetric("agent_live",performance.now()-start,accepted ? "ok" : "error",{
      status,agentStrategy:"jev_gemini",agentRoute:result?.route,agentFallbackReason:result?.fallbackReason,
      model:result?.model,provider:result?.provider,promptTokens:result?.promptTokens,completionTokens:result?.completionTokens,
      costUsd:result?.costUsd,agentSteps:result?.steps,agentToolCalls:result?.toolCalls,agentToolErrors:result?.toolErrors,
      selectorModel:result?.selectorModel,selectorStatus:result?.selectorStatus,selectorConfidence:result?.selectorConfidence,
      selectorDurationMs:result?.selectorDurationMs,prefetchDurationMs:result?.prefetchDurationMs,
      matchedFoodId:accepted ? result?.resolution?.foodId : undefined,matchedGrams:accepted ? result?.resolution?.grams : undefined
    })
  }
}
