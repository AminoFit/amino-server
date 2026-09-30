import { NextRequest,NextResponse } from "next/server"
import { dispatchPendingMeals } from "@/mealOperations/dispatch"
import { createAdminSupabase } from "@/utils/supabase/serverAdmin"

export const dynamic="force-dynamic"
export const maxDuration=60

export async function GET(request:NextRequest) {
  if(!process.env.CRON_SECRET||request.headers.get("authorization")!==`Bearer ${process.env.CRON_SECRET}`)
    return NextResponse.json({error:"Unauthorized"},{status:401})
  // Meal debug records are kept 60 days; each run deletes a bounded batch of older ones. Never blocks dispatch.
  const pruned=Promise.resolve().then(()=>(createAdminSupabase() as any).rpc("prune_meal_runs"))
    .then((result:{error?:{message?:string}|null})=>{if(result?.error) console.warn("meal_runs_not_pruned",{error:result.error.message})})
    .catch((error:unknown)=>console.warn("meal_runs_not_pruned",{error:error instanceof Error?error.message:"unknown"}))
  try {const dispatched=await dispatchPendingMeals();await pruned;return NextResponse.json(dispatched)}
  catch(error) {console.error("meal_outbox_cron_failed",error);await pruned
    return NextResponse.json({error:"Dispatch unavailable"},{status:503})}
}
