import { NextRequest,NextResponse } from "next/server"
import { z } from "zod"
import { GetUserIdOnRequest } from "@/utils/supabase/GetUserIdFromRequest"
import { cancelMealOperation } from "@/mealOperations/service"
import { mealOperationError } from "@/mealOperations/http"

const body=z.object({expectedOperationVersion:z.number().int().positive()}).strict()
export async function POST(request:NextRequest,{params}:{params:{id:string}}) {
  const {userId}=await GetUserIdOnRequest()
  if(!userId) return NextResponse.json({error:"unauthorized"},{status:401})
  let raw:unknown
  try {raw=await request.json()} catch {return NextResponse.json({error:"invalid_json"},{status:400})}
  const parsed=body.safeParse(raw)
  if(!parsed.success) return NextResponse.json({error:"invalid_cancel"},{status:422})
  try {return NextResponse.json(await cancelMealOperation(userId,params.id,parsed.data.expectedOperationVersion))}
  catch(error) {return mealOperationError(error)}
}
