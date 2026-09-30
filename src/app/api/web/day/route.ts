import { NextRequest, NextResponse } from "next/server"
import { SignedOut, loadDay } from "@/app/dashboard/_lib/data"
import { isDay } from "@/app/dashboard/_lib/dates"

// The web log's day switcher: one day's meals and its week's totals, as the signed-in user. The middleware skips this
// route (no extra round trip to Supabase Auth); the database checks the session's token.
export const dynamic = "force-dynamic"

export async function GET(request: NextRequest) {
  const date = request.nextUrl.searchParams.get("date")
  if (!isDay(date)) return NextResponse.json({ error: "invalid_date" }, { status: 422 })
  try {
    return NextResponse.json(await loadDay(date), { headers: { "Cache-Control": "private, no-store" } })
  } catch (error) {
    if (error instanceof SignedOut) return NextResponse.json({ error: "signed_out" }, { status: 401 })
    console.error("web_day_failed", error)
    return NextResponse.json({ error: "unavailable" }, { status: 502 })
  }
}
