import { NextRequest,NextResponse } from "next/server"
import { dispatchPendingMeals } from "@/mealOperations/dispatch"
import { createAdminSupabase } from "@/utils/supabase/serverAdmin"
import { fillLogsForRecentFoods } from "@/mealOperations/logRefresh"
import { refreshRecipesForRecentFoods } from "@/userFoods/recipeRefresh"

export const dynamic="force-dynamic"
export const maxDuration=60

export async function GET(request:NextRequest) {
  if(!process.env.CRON_SECRET||request.headers.get("authorization")!==`Bearer ${process.env.CRON_SECRET}`)
    return NextResponse.json({error:"Unauthorized"},{status:401})
  // Meal debug records and MCP request logs are kept 60 days; each run deletes a bounded batch of older ones.
  // Never blocks dispatch.
  const prune=(fn:string)=>Promise.resolve().then(()=>(createAdminSupabase() as any).rpc(fn))
    .then((result:{error?:{message?:string}|null})=>{if(result?.error) console.warn(`${fn}_failed`,{error:result.error.message})})
    .catch((error:unknown)=>console.warn(`${fn}_failed`,{error:error instanceof Error?error.message:"unknown"}))
  // Recipes using foods that just changed are recomputed; then logs of foods (recipes included) that just gained vitamins
  // or minerals get them too (fill-only). Never blocks dispatch.
  const filled=refreshRecipesForRecentFoods()
    .catch(error=>console.warn("recipe_refresh_failed",{error:error instanceof Error?error.message:"unknown"}))
    .then(()=>fillLogsForRecentFoods())
    .catch(error=>console.warn("meal_log_fill_failed",{error:error instanceof Error?error.message:"unknown"}))
  const pruned=Promise.all([prune("prune_meal_runs"),prune("prune_mcp_requests"),filled])
  try {const dispatched=await dispatchPendingMeals();await pruned;return NextResponse.json(dispatched)}
  catch(error) {console.error("meal_outbox_cron_failed",error);await pruned
    return NextResponse.json({error:"Dispatch unavailable"},{status:503})}
}
