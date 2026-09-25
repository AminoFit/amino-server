import { createHash } from "node:crypto"
import { createAdminSupabase } from "@/utils/supabase/serverAdmin"
import { operationClaim, type OperationRequest, type OperationClaim } from "./contracts"

const admin = () => createAdminSupabase() as any
const rpc = async (name:string,args:Record<string,unknown>) => {
  const {data,error}=await admin().rpc(name,args)
  if (error) throw Object.assign(new Error(error.message),{code:error.code})
  return data
}

export function operationHash(request:OperationRequest) {
  return createHash("sha256").update(JSON.stringify(request)).digest("hex")
}

export async function acceptMealOperation(userId:string,request:OperationRequest) {
  return rpc("accept_meal_operation",{
    p_user_id:userId,p_operation_id:request.operationId,p_client_meal_id:request.clientMealId,
    p_message_id:request.messageId,p_expected_revision:request.expectedPublishedRevision,
    p_action:request.action,p_input:{...request.input,submittedAt:request.submittedAt,
      timezone:request.timezone,locale:request.locale??null},p_payload_hash:operationHash(request)
  }) as Promise<{operationId:string;messageId:number;generation:number;operationVersion:number;
    state:string;publishedRevision:number;result?:unknown}>
}

export async function claimMealOperation(operationId:string,workerToken:string):Promise<OperationClaim|null> {
  const data=await rpc("claim_meal_operation",{p_operation_id:operationId,p_worker_token:workerToken,p_lease_seconds:120})
  return data ? operationClaim.parse(data) : null
}

export async function publishMealOperation(operationId:string,workerToken:string,plan:unknown) {
  return rpc("publish_meal_operation",{p_operation_id:operationId,p_worker_token:workerToken,p_plan:plan})
}

export async function finishMealOperation(operationId:string,workerToken:string,
  state:"failed"|"retry_wait"|"needs_clarification",errorCode:string,nextAttemptAt:string|null=null,
  result:unknown=null) {
  return rpc("finish_meal_operation",{p_operation_id:operationId,p_worker_token:workerToken,
    p_state:state,p_error_code:errorCode,p_next_attempt:nextAttemptAt,p_result:result})
}

export async function getMealOperation(userId:string,operationId:string) {
  const {data,error}=await admin().from("MealOperation").select(
    "id,messageId,clientMealId,action,state,version,generation,errorCode,result,createdAt,updatedAt,completedAt")
    .eq("id",operationId).eq("userId",userId).maybeSingle()
  if (error) throw error
  return data
}

export async function answerMealOperation(userId:string,operationId:string,expectedVersion:number,answer:string) {
  return rpc("answer_meal_operation",{p_user_id:userId,p_operation_id:operationId,
    p_expected_version:expectedVersion,p_answer:answer})
}

export async function cancelMealOperation(userId:string,operationId:string,expectedVersion:number) {
  return rpc("cancel_meal_operation",{p_user_id:userId,p_operation_id:operationId,
    p_expected_version:expectedVersion})
}

export async function getMealSnapshot(userId:string,messageId:number) {
  const db=admin()
  const {data:message,error}=await db.from("Message").select(
    "id,userId,content,consumedOn,deletedAt,publishedRevision,activeOperationId,operationOwned")
    .eq("id",messageId).eq("userId",userId).maybeSingle()
  if(error) throw error
  if(!message||message.deletedAt) throw new Error("meal_unavailable")
  // The current app may have edited a taken-over meal's rows since its last
  // revision, so only protocol-owned meals trust the revision snapshot.
  if(!message.publishedRevision||!message.operationOwned) return {message,snapshot:null}
  const revision=await db.from("MealRevision").select("snapshot")
    .eq("messageId",messageId).eq("revision",message.publishedRevision).maybeSingle()
  if(revision.error) throw revision.error
  return {message,snapshot:revision.data?.snapshot??null}
}
