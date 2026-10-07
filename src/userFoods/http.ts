import { NextResponse } from "next/server"
import { ZodError, type ZodType } from "zod"
import { GetUserIdOnRequest } from "@/utils/supabase/GetUserIdFromRequest"
import { UserFoodError } from "./userFoods"

/** Runs a user-food request for the signed-in user: 401 without a session, 422 for invalid input, the
 * UserFoodError's status for known failures, 500 otherwise. */
export async function userFoodRequest(handler:(userId:string)=>Promise<unknown>,status=200) {
  const {userId}=await GetUserIdOnRequest()
  if (!userId) return NextResponse.json({error:"unauthorized"},{status:401})
  try {return NextResponse.json(await handler(userId),{status})}
  catch (error) {
    if (error instanceof UserFoodError) return NextResponse.json({error:error.code,...(error.detail?{detail:error.detail}:{})},{status:error.status})
    if (error instanceof ZodError) return NextResponse.json({error:"invalid_request",issues:error.issues.slice(0,5)},{status:422})
    console.error("User food request failed",error)
    return NextResponse.json({error:"user_food_unavailable"},{status:500})
  }
}

export async function parseBody<T>(request:Request,schema:ZodType<T>):Promise<T> {
  let body:unknown
  try {body=await request.json()} catch {throw new UserFoodError("invalid_json",400)}
  return schema.parse(body)
}

export function idParam(value:string) {
  const id=Number(value)
  if (!Number.isSafeInteger(id)||id<1) throw new UserFoodError("invalid_id",422)
  return id
}
