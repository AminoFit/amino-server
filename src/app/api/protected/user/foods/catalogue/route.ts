import { NextRequest, NextResponse } from "next/server"
import { GetUserIdOnRequest } from "@/utils/supabase/GetUserIdFromRequest"
import { catalogueIds, cataloguePage } from "@/foodSearch/catalogueSync"

export const dynamic = "force-dynamic"

/** The shared catalogue for the app's on-device search: ?since=<lastUpdated>&cursor=<id> pages foods changed since
 * the app's last pull; ?ids=1 lists every live food id (to drop foods merged away). */
export async function GET(request: NextRequest) {
  const { userId } = await GetUserIdOnRequest()
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  const params = request.nextUrl.searchParams
  try {
    if (params.get("ids") === "1") return NextResponse.json({ ids: await catalogueIds() })
    const since = params.get("since")
    const cursor = Number(params.get("cursor") ?? 0)
    if ((since && !Number.isFinite(Date.parse(since))) || !Number.isSafeInteger(cursor) || cursor < 0)
      return NextResponse.json({ error: "invalid_request" }, { status: 422 })
    return NextResponse.json({ ...(await cataloguePage(since, cursor)), serverTime: new Date().toISOString().replace("Z", "") })
  } catch (error) {
    console.error("catalogue_sync_failed", error)
    return NextResponse.json({ error: "catalogue_unavailable" }, { status: 500 })
  }
}
