import { NextRequest,NextResponse } from "next/server"
import { z } from "zod"
import { GetUserIdOnRequest } from "@/utils/supabase/GetUserIdFromRequest"
import { answerMealOperation } from "@/mealOperations/service"
import { dispatchMealOperation } from "@/mealOperations/dispatch"
import { mealOperationError } from "@/mealOperations/http"

const body=z.object({expectedOperationVersion:z.number().int().positive(),
  answer:z.string().trim().min(1).max(2000)}).strict()
export async function POST(request:NextRequest,{params}:{params:{id:string}}) {
  const {userId}=await GetUserIdOnRequest()
  if(!userId) return NextResponse.json({error:"unauthorized"},{status:401})
  let raw:unknown
  try {raw=await request.json()} catch {return NextResponse.json({error:"invalid_json"},{status:400})}
  const parsed=body.safeParse(raw)
  if(!parsed.success) return NextResponse.json({error:"invalid_answer"},{status:422})
  try {
    const updated=await answerMealOperation(userId,params.id,parsed.data.expectedOperationVersion,parsed.data.answer)
    try {await dispatchMealOperation(params.id)}
    catch(error) {console.error("meal_answer_dispatch_failed",error)}
    return NextResponse.json(updated,{status:202})
  } catch(error) {return mealOperationError(error)}
}
