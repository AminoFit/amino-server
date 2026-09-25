import { NextRequest,NextResponse } from "next/server"
import { dispatchPendingMeals } from "@/mealOperations/dispatch"

export const dynamic="force-dynamic"
export const maxDuration=60

export async function GET(request:NextRequest) {
  if(!process.env.CRON_SECRET||request.headers.get("authorization")!==`Bearer ${process.env.CRON_SECRET}`)
    return NextResponse.json({error:"Unauthorized"},{status:401})
  try {return NextResponse.json(await dispatchPendingMeals())}
  catch(error) {console.error("meal_outbox_cron_failed",error)
    return NextResponse.json({error:"Dispatch unavailable"},{status:503})}
}
