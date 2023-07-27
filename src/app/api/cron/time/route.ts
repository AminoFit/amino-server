const runtime = "edge"

import { NextResponse } from "next/server"

export async function GET() {
  return NextResponse.json(
    { now: Date.now() },
    {
      status: 200,
      headers: {
        "Cache-Control": "public, s-maxage=1",
        "CDN-Cache-Control": "public, s-maxage=1",
        "Vercel-CDN-Cache-Control": "public, s-maxage=1"
      }
    }
  )
}
