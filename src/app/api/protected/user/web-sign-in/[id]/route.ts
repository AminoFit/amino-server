import { NextRequest, NextResponse } from "next/server"
import { GetAppSessionOnRequest } from "@/utils/supabase/GetUserIdFromRequest"
import { decideSignIn, describeSignIn, isSignInId } from "@/utils/webSignIn"

// The app approves signing in on the web: the user scanned the sign-in page's QR code. GET shows which browser is
// asking and the numbers to pick from; POST {action: "approve", code} or {action: "deny"} decides.
export const dynamic = "force-dynamic"

export async function GET(_request: NextRequest, { params }: { params: { id: string } }) {
  const { userId } = await GetAppSessionOnRequest()
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  if (!isSignInId(params.id)) return NextResponse.json({ error: "invalid_request" }, { status: 422 })
  try {
    const request = await describeSignIn(params.id)
    return request ? NextResponse.json(request) : NextResponse.json({ error: "expired" }, { status: 404 })
  } catch (error) {
    console.error("web_sign_in_describe_failed", error)
    return NextResponse.json({ error: "unavailable" }, { status: 502 })
  }
}

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const { userId } = await GetAppSessionOnRequest()
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  if (!isSignInId(params.id)) return NextResponse.json({ error: "invalid_request" }, { status: 422 })
  const body = await request.json().catch(() => null)
  if (body?.action !== "approve" && body?.action !== "deny") return NextResponse.json({ error: "invalid_action" }, { status: 422 })
  try {
    const status = await decideSignIn(params.id, userId, body.action === "approve", body.code)
    return status === "expired" ? NextResponse.json({ error: "expired" }, { status: 404 }) : NextResponse.json({ status })
  } catch (error) {
    console.error("web_sign_in_decide_failed", error)
    return NextResponse.json({ error: "unavailable" }, { status: 502 })
  }
}
