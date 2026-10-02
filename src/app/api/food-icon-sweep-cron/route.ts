import { NextRequest, NextResponse } from "next/server"
import { queueMissingFoodIcons } from "@/foodSearch/iconSweep"

export const dynamic = "force-dynamic"
export const maxDuration = 60

/** Every 6 hours: foods without an icon are queued for one (foodSearch/iconSweep). */
export async function GET(request: NextRequest) {
  if (!process.env.CRON_SECRET || request.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  try { return NextResponse.json(await queueMissingFoodIcons()) }
  catch (error) {
    console.error("food_icon_sweep_failed", error)
    return NextResponse.json({ error: "Icon sweep unavailable" }, { status: 503 })
  }
}
