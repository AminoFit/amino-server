import { NextRequest,NextResponse } from "next/server"
import { GetAminoUserOnRequest } from "@/utils/supabase/GetUserFromRequest"
import { checkAndUpdateUserIsSubscribed } from "@/subscription/checkAndUpdateUserIsSubscribed"
import { operationRequest } from "@/mealOperations/contracts"
import { acceptMealOperation } from "@/mealOperations/service"
import { dispatchMealOperation } from "@/mealOperations/dispatch"
import { mealOperationError } from "@/mealOperations/http"
import { afterReply } from "@/utils/afterReply"

export const dynamic="force-dynamic"
export const maxDuration=30

export async function POST(request:NextRequest) {
  const {aminoUser}=await GetAminoUserOnRequest()
  if(!aminoUser) return NextResponse.json({error:"unauthorized"},{status:401})
  let raw:unknown
  try {raw=await request.json()} catch {return NextResponse.json({error:"invalid_json"},{status:400})}
  const parsed=operationRequest.safeParse(raw)
  if(!parsed.success) return NextResponse.json({error:"invalid_operation",issues:parsed.error.issues},{status:422})
  const input=parsed.data
  const isSubscribed=aminoUser.subscriptionExpiryDate&&
    new Date(aminoUser.subscriptionExpiryDate).getTime()>Date.now() ||
    await checkAndUpdateUserIsSubscribed(aminoUser.id)
  if(!isSubscribed) return NextResponse.json({error:"subscription_required"},{status:403})
  try {
    const accepted=await acceptMealOperation(aminoUser.id,input)
    // The queue handoff runs after the reply (waitUntil keeps the function alive until it's done): the app only needs
    // to know the operation was accepted. The committed outbox recovers dispatch failures independently.
    if(accepted.state==="queued") afterReply("meal_initial_dispatch",()=>dispatchMealOperation(input.operationId))
    return NextResponse.json({...accepted,statusUrl:`/api/protected/user/meal-operations/${input.operationId}`},
      {status:["succeeded","failed","cancelled","conflicted"].includes(accepted.state)?200:202})
  } catch(error) {return mealOperationError(error)}
}
