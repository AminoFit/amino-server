import { NextRequest,NextResponse } from "next/server"
import { GetUserIdOnRequest } from "@/utils/supabase/GetUserIdFromRequest"
import { getMealOperation } from "@/mealOperations/service"
import { mealOperationError } from "@/mealOperations/http"

export const dynamic="force-dynamic"
export async function GET(_request:NextRequest,{params}:{params:{id:string}}) {
  const {userId}=await GetUserIdOnRequest()
  if(!userId) return NextResponse.json({error:"unauthorized"},{status:401})
  try {
    const operation=await getMealOperation(userId,params.id)
    return operation?NextResponse.json(operation):NextResponse.json({error:"operation_unavailable"},{status:404})
  } catch(error) {return mealOperationError(error)}
}
