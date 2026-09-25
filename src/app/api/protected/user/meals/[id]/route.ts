import { NextRequest,NextResponse } from "next/server"
import { GetUserIdOnRequest } from "@/utils/supabase/GetUserIdFromRequest"
import { getMealSnapshot } from "@/mealOperations/service"
import { mealOperationError } from "@/mealOperations/http"

export const dynamic="force-dynamic"
export async function GET(_request:NextRequest,{params}:{params:{id:string}}) {
  const {userId}=await GetUserIdOnRequest()
  if(!userId) return NextResponse.json({error:"unauthorized"},{status:401})
  const id=Number(params.id)
  if(!Number.isSafeInteger(id)||id<1) return NextResponse.json({error:"invalid_meal_id"},{status:422})
  try {return NextResponse.json(await getMealSnapshot(userId,id))}
  catch(error) {return mealOperationError(error)}
}
