import { createHash, randomUUID } from "node:crypto"
import { createAdminSupabase } from "@/utils/supabase/serverAdmin"
import { foodNutrition, validNutrition } from "@/foodResolution/nutrition"
import { type PublishedPlan } from "@/mealResolution/compile"
import { compileCheckedMealPlan } from "@/mealResolution/historyCheck"
import { resolveMeal } from "@/mealResolution/resolve"
import { claimMealOperation, finishMealOperation, getMealSnapshot, publishMealOperation } from "./service"
import { HISTORY_NUTRIENTS } from "@/foodResolution/history/nutrients"

const transientCodes=new Set(["catalogue_unavailable","food_details_unavailable",
  "history_unavailable","history_revision_unavailable","media_evidence_unavailable",
  "fetch failed","AbortError"])
const safeErrorCodes=new Set(["catalogue_unavailable","food_details_unavailable",
  "history_unavailable","history_revision_unavailable","invalid_history_window",
  "invalid_history_id","unread_history_food","unread_history_group",
  "invalid_group_exclusion","duplicate_source_food","missing_catalogue_food",
  "unread_catalogue_food","invalid_food_serving","invalid_catalogue_nutrition",
  "invalid_meal_nutrition","invalid_meal_time","invalid_meal_size",
  "unsupported_nutrition_claim","invalid_label_scope","label_source_unavailable",
  "invalid_nutrition_scope","nutrient_basis_unavailable",
  "nutrition_claim_conflicts_with_food","meal_needs_clarification",
  "media_evidence_unavailable","legacy_meal_unavailable",
  "legacy_meal_nutrition_unavailable","structured_action_requires_published_snapshot",
  "meal_item_unavailable","meal_food_changed","food_evidence_unavailable",
  "serving_evidence_unavailable","unsupported_structured_action",
  "delete_last_item_requires_meal_delete","clarification_unavailable","barcode_not_covered","history_not_referenced","missing_meal_coverage","duplicate_meal_mention",
  "unsupported_meal_mention","omitted_mention_has_food","dropped_meal_mention",
  "item_coverage_conflict","uncovered_meal_item","duplicate_food_in_group"])
/** Total ms and count per stage, e.g. {"tool:findFood":{ms:7400,n:2}}. */
const summariseTimeline=(timeline:{stage:string;ms:number}[])=>timeline.reduce<Record<string,{ms:number;n:number}>>((sum,{stage,ms})=>
  ({...sum,[stage]:{ms:(sum[stage]?.ms??0)+ms,n:(sum[stage]?.n??0)+1}}),{})
const sourcePlan=(value:unknown):PublishedPlan|null=>value&&typeof value==="object"&&
  Array.isArray((value as PublishedPlan).items)?value as PublishedPlan:null
const stableItemId=(messageId:number,itemId:number)=>{
  const hex=createHash("sha256").update(`${messageId}:${itemId}`).digest("hex")
  return `${hex.slice(0,8)}-${hex.slice(8,12)}-4${hex.slice(13,16)}-a${hex.slice(17,20)}-${hex.slice(20,32)}`
}

async function legacySnapshot(claim:NonNullable<Awaited<ReturnType<typeof claimMealOperation>>>,
  message:{content:string;consumedOn:string;publishedRevision:number}):Promise<PublishedPlan> {
  const db=createAdminSupabase()
  const columns=`id,updatedAt,foodItemId,grams,${HISTORY_NUTRIENTS.join(",")},servingId,servingAmount,loggedUnit,extendedOpenAiData`
  const [response,photos]=await Promise.all([
    db.from("LoggedFoodItem").select(columns)
      .eq("messageId",claim.messageId).eq("userId",claim.userId).eq("status","Processed")
      .is("deletedAt",null).order("id").limit(31),
    db.from("UserMessageImages").select("id").eq("messageId",claim.messageId)
      .eq("userId",claim.userId).order("id").limit(11)
  ])
  if(response.error) throw response.error
  if(photos.error||!photos.data||photos.data.length>10) throw new Error("media_evidence_unavailable")
  const rows=(response.data??[]) as any[]
  if(!rows.length||rows.length>30) throw new Error("legacy_meal_unavailable")
  const items=rows.map(row=>{
    const nutrition=Object.fromEntries(HISTORY_NUTRIENTS.map(key=>[key,row[key]])) as PublishedPlan["items"][number]["nutrition"]
    if(!validNutrition(row.grams,nutrition)) throw new Error("legacy_meal_nutrition_unavailable")
    return {logicalItemId:stableItemId(claim.messageId,row.id),foodId:row.foodItemId,
      grams:row.grams,servingId:row.servingId,servingAmount:row.servingAmount??row.grams,
      loggedUnit:row.loggedUnit??"g",groupId:typeof row.extendedOpenAiData?.groupId==="string"?
        row.extendedOpenAiData.groupId:null,groupLabel:null,nutrition,
      evidence:[`legacy-food:${row.id}`],origin:"history" as const,
      sourceItemId:{messageId:claim.messageId,loggedFoodItemId:row.id,
        updatedAt:row.updatedAt,revision:message.publishedRevision}}
  })
  return {schemaVersion:1,originalText:message.content,consumedOn:message.consumedOn,
    groups:[],items,claims:[],model:{id:"legacy-snapshot",provider:"server"},
    input:{operationId:claim.operationId,submittedAt:String(claim.input.submittedAt),
      timezone:String(claim.input.timezone),locale:typeof claim.input.locale==="string"?claim.input.locale:null,
      attachmentIds:photos.data.map(photo=>photo.id)}}
}

async function structuredPlan(claim:NonNullable<Awaited<ReturnType<typeof claimMealOperation>>>) {
  const {message,snapshot}=await getMealSnapshot(claim.userId,claim.messageId)
  const published=sourcePlan(snapshot)
  const previous=published??await legacySnapshot(claim,message)
  if(!previous) throw new Error("structured_action_requires_published_snapshot")
  const input=claim.input as Record<string,unknown>
  const copied:PublishedPlan=structuredClone(previous)
  if(published) copied.items=copied.items.map(item=>({...item,sourceItemId:undefined,catalogueUpdatedAt:undefined}))
  copied.input={operationId:claim.operationId,submittedAt:String(input.submittedAt),
    timezone:String(input.timezone),locale:typeof input.locale==="string"?input.locale:null,
    attachmentIds:previous.input.attachmentIds??[]}
  copied.model={id:"structured-action",provider:"server"}
  if(claim.action==="delete") {
    if(input.targetLogicalItemId) {
      const index=copied.items.findIndex(item=>item.logicalItemId===input.targetLogicalItemId)
      if(index<0) throw new Error("meal_item_unavailable")
      copied.items.splice(index,1)
      if(!copied.items.length) throw new Error("delete_last_item_requires_meal_delete")
    } else copied.items=[]
  } else if(claim.action==="move") {
    copied.consumedOn=String(input.consumedOn)
  } else if(claim.action==="portion") {
    const index=copied.items.findIndex(item=>item.logicalItemId===input.targetLogicalItemId)
    if(index<0) throw new Error("meal_item_unavailable")
    const prior=copied.items[index]
    if(input.foodId!==undefined&&input.foodId!==prior.foodId) throw new Error("meal_food_changed")
    const db=createAdminSupabase()
    const food=await db.from("FoodItem").select("id,lastUpdated,defaultServingWeightGram,weightUnknown,kcalPerServing,proteinPerServing,carbPerServing,totalFatPerServing")
      .eq("id",prior.foodId).maybeSingle()
    if(food.error||!food.data)
      throw new Error("food_evidence_unavailable")
    let grams=Number(input.grams),servingId:number|null=null,servingAmount:number,loggedUnit:string
    if(input.servingId!==undefined&&input.servingId!==null) {
      const serving=await db.from("Serving").select("id,foodItemId,servingWeightGram,defaultServingAmount,servingName")
        .eq("id",input.servingId as number).eq("foodItemId",prior.foodId).maybeSingle()
      if(serving.error||!serving.data||!serving.data.servingWeightGram||!serving.data.defaultServingAmount)
        throw new Error("serving_evidence_unavailable")
      servingAmount=Number(input.servingAmount)
      grams=servingAmount*serving.data.servingWeightGram/serving.data.defaultServingAmount
      servingId=serving.data.id;loggedUnit=serving.data.servingName
    } else {servingAmount=grams;loggedUnit="g"}
    const nutrition=foodNutrition(food.data,grams)
    if(!nutrition||!validNutrition(grams,nutrition)) throw new Error("invalid_meal_nutrition")
    copied.items[index]={...prior,grams,servingId,servingAmount,loggedUnit,nutrition,
      origin:"catalogue",sourceItemId:undefined,catalogueUpdatedAt:food.data.lastUpdated,
      evidence:[`food:${prior.foodId}`]}
  } else throw new Error("unsupported_structured_action")
  copied.originalText=String(message.content??copied.originalText)
  copied.claims=[]
  return copied
}

/** Queue delivery is at least once. The database lease and generation decide
 * whether a delivery is allowed to commit; this function never trusts the queue. */
export async function processMealOperation(operationId:string) {
  const workerToken=randomUUID()
  const claim=await claimMealOperation(operationId,workerToken)
  if(!claim) return {state:"ignored"}
  const started=performance.now()
  let timeline:{stage:string;ms:number}[]=[]
  try {
    let plan:PublishedPlan
    if(claim.action==="create"||claim.action==="replace") {
      const raw=claim.input as Record<string,unknown>
      const {message,snapshot}=claim.action==="replace" ?
        await getMealSnapshot(claim.userId,claim.messageId) : {message:null,snapshot:null}
      const input={userId:claim.userId,operationId:claim.operationId,messageId:claim.messageId,
        originalText:String(raw.originalText),consumedOn:String(raw.consumedOn),
        submittedAt:String(raw.submittedAt),timezone:String(raw.timezone),
        locale:typeof raw.locale==="string"?raw.locale:null,
        attachmentIds:Array.isArray(raw.attachmentIds)?raw.attachmentIds as number[]:[],
        useExistingPhotos:claim.action==="replace",
        answers:claim.answers,previousMeal:snapshot??message,
        // The current app cannot show questions: taken-over meals resolve with assumptions.
        clarificationAllowed:raw.takeover!==true}
      let result=await resolveMeal(input)
      timeline=result.timeline??[]
      if(result.proposal.outcome==="needs_clarification"&&!input.clarificationAllowed)
        result=await resolveMeal({...input,validationErrorCode:"clarification_unavailable"})
      if(result.proposal.outcome==="needs_clarification") {
        if(!input.clarificationAllowed) throw new Error("meal_needs_clarification")
        await finishMealOperation(operationId,workerToken,"needs_clarification",
          "ambiguous_meal",null,{question:result.proposal.clarification})
        return {state:"needs_clarification"}
      }
      try {plan=await compileCheckedMealPlan(input,result,{secondLook:!result.checked})}
      catch(error) {
        const code=error instanceof Error?error.message:"invalid_plan"
        // missing_visible_food carries the names the second look found.
        if(!safeErrorCodes.has(code)&&!code.startsWith("missing_visible_food:")) throw error
        const repaired=await resolveMeal({...input,validationErrorCode:code})
        if(repaired.proposal.outcome==="needs_clarification") {
          if(!input.clarificationAllowed) throw new Error("meal_needs_clarification")
          await finishMealOperation(operationId,workerToken,"needs_clarification",
            "ambiguous_meal",null,{question:repaired.proposal.clarification})
          return {state:"needs_clarification"}
        }
        // No second look on the repair: a minor omission never fails the meal.
        plan=await compileCheckedMealPlan(input,repaired,{secondLook:false})
      }
    } else plan=await structuredPlan(claim)
    const published=await publishMealOperation(operationId,workerToken,plan)
    console.info("meal_operation_complete",{operationId,state:"succeeded",durationMs:Math.round(performance.now()-started),
      stages:summariseTimeline(timeline)})
    return {state:"succeeded",published}
  } catch(error) {
    const raw=error instanceof Error?error.message:"unknown_error"
    // A superseded or already published delivery is never allowed to rewrite
    // its terminal state, even if a late provider call returns afterward.
    if(raw.includes("Operation claim changed")||raw.includes("Meal revision changed")) return {state:"ignored"}
    const code=raw.includes("Historical evidence changed")?"source_changed":
      safeErrorCodes.has(raw)?raw:raw.includes("429")?"provider_rate_limited":
      raw.includes("timeout")||raw.includes("AbortError")?"provider_timeout":"resolution_failed"
    const retryable=(transientCodes.has(code)||code==="provider_rate_limited"||
      code==="provider_timeout"||code==="resolution_failed")&&claim.attempts<3
    const state=retryable?"retry_wait":"failed"
    const retryAt=retryable?new Date(Date.now()+30_000).toISOString():null
    try {await finishMealOperation(operationId,workerToken,state,code,retryAt)}
    catch(finishError) {console.error("meal_operation_finish_failed",{operationId,
      error:finishError instanceof Error?finishError.message:"unknown"})}
    console.warn("meal_operation_complete",{operationId,state,errorCode:code,
      durationMs:Math.round(performance.now()-started)})
    return {state,errorCode:code}
  }
}
