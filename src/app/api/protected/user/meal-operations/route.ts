import { NextRequest,NextResponse } from "next/server"
import { GetAminoUserOnRequest } from "@/utils/supabase/GetUserFromRequest"
import { checkAndUpdateUserIsSubscribed } from "@/subscription/checkAndUpdateUserIsSubscribed"
import { operationRequest } from "@/mealOperations/contracts"
import { acceptMealOperation } from "@/mealOperations/service"
import { dispatchMealOperation } from "@/mealOperations/dispatch"
import { mealOperationError } from "@/mealOperations/http"

export const dynamic="force-dynamic"
export const maxDuration=30

export async function POST(request:NextRequest) {
  if(process.env.MEAL_OPERATIONS_ENABLED!=="true")
    return NextResponse.json({error:"meal_operations_unavailable"},{status:503})
  const {aminoUser}=await GetAminoUserOnRequest()
  if(!aminoUser) return NextResponse.json({error:"unauthorized"},{status:401})
  let raw:unknown
  try {raw=await request.json()} catch {return NextResponse.json({error:"invalid_json"},{status:400})}
  const parsed=operationRequest.safeParse(raw)
  if(!parsed.success) return NextResponse.json({error:"invalid_operation",issues:parsed.error.issues},{status:422})
  const input=parsed.data
  // Media requires stable, owned attachment capabilities. This route cannot
  // truthfully resolve them until that evidence adapter is installed.
  if((input.action==="create"||input.action==="replace")&&input.input.attachmentIds.length)
    return NextResponse.json({error:"media_evidence_unavailable"},{status:422})
  const isSubscribed=aminoUser.subscriptionExpiryDate&&
    new Date(aminoUser.subscriptionExpiryDate).getTime()>Date.now() ||
    await checkAndUpdateUserIsSubscribed(aminoUser.id)
  if(!isSubscribed) return NextResponse.json({error:"subscription_required"},{status:403})
  try {
    const accepted=await acceptMealOperation(aminoUser.id,input)
    if(accepted.state==="queued") {
      // Finish the queue handoff before returning from a serverless request.
      // The committed outbox recovers dispatch failures independently.
      try {await dispatchMealOperation(input.operationId)} catch(error) {
        console.error("meal_initial_dispatch_failed",{operationId:input.operationId,error})
      }
    }
    return NextResponse.json({...accepted,statusUrl:`/api/protected/user/meal-operations/${input.operationId}`},
      {status:["succeeded","failed","cancelled","conflicted"].includes(accepted.state)?200:202})
  } catch(error) {return mealOperationError(error)}
}
