import { NextRequest, NextResponse } from "next/server"
import { repriceLogsForCorrectedFoods } from "@/mealOperations/logRefresh"

export const dynamic = "force-dynamic"
export const maxDuration = 300

/** Hourly: logs of foods whose values were corrected are repriced through the meal protocol (mealOperations/logRefresh). */
export async function GET(request: NextRequest) {
  if (!process.env.CRON_SECRET || request.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  try { return NextResponse.json(await repriceLogsForCorrectedFoods()) }
  catch (error) {
    console.error("meal_log_reprice_failed", error)
    return NextResponse.json({ error: "Reprice unavailable" }, { status: 503 })
  }
}
