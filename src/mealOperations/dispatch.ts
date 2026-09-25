import { createAdminSupabase } from "@/utils/supabase/serverAdmin"
import { processMealOperationQueue } from "@/app/api/queues/process-meal-operation/process-meal-operation"

const admin=()=>createAdminSupabase() as any

export async function dispatchMealOperation(operationId:string) {
  const db=admin()
  const pending=await db.from("MealOutbox").select("id,operationId,state,availableAt")
    .eq("operationId",operationId).eq("kind","resolve").maybeSingle()
  if(pending.error) throw pending.error
  if(!pending.data||pending.data.state!=="pending"||Date.parse(pending.data.availableAt)>Date.now()) return false
  await processMealOperationQueue.enqueue(operationId)
  const marked=await db.from("MealOutbox").update({state:"dispatched",attempts:1})
    .eq("id",pending.data.id).eq("state","pending")
  if(marked.error) throw marked.error
  return true
}

export async function dispatchPendingMeals(limit=30) {
  const db=admin()
  // An enqueue acknowledgement is not proof that a worker received the job.
  // Re-drive old queued operations; duplicate deliveries are fenced by claim.
  const stranded=await db.from("MealOperation").select("id")
    .eq("state","queued").lt("updatedAt",new Date(Date.now()-15_000).toISOString()).limit(limit)
  if(stranded.error) throw stranded.error
  if(stranded.data?.length) {
    const queued=await db.from("MealOutbox").update({state:"pending",availableAt:new Date().toISOString()})
      .in("operationId",stranded.data.map((row:{id:string})=>row.id))
      .eq("kind","resolve").eq("state","dispatched")
    if(queued.error) throw queued.error
  }
  const expired=await db.from("MealOperation").select("id")
    .eq("state","running").lt("leaseUntil",new Date().toISOString()).limit(limit)
  if(expired.error) throw expired.error
  if(expired.data?.length) {
    const queued=await db.from("MealOutbox").update({state:"pending",availableAt:new Date().toISOString()})
      .in("operationId",expired.data.map((row:{id:string})=>row.id))
      .eq("kind","resolve").eq("state","dispatched")
    if(queued.error) throw queued.error
  }
  const due=await db.from("MealOutbox").select("operationId").eq("kind","resolve")
    .eq("state","pending").lte("availableAt",new Date().toISOString())
    .order("availableAt").limit(limit)
  if(due.error) throw due.error
  let dispatched=0,failed=0
  for(const row of due.data??[]) {
    try {if(await dispatchMealOperation(row.operationId)) dispatched++}
    catch(error) {failed++;console.error("meal_dispatch_failed",{operationId:row.operationId,
      error:error instanceof Error?error.message:"unknown"})}
  }
  return {dispatched,failed}
}
