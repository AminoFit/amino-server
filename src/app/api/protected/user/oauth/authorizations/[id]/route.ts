import { NextRequest, NextResponse } from "next/server"
import { GetAppSessionOnRequest } from "@/utils/supabase/GetUserIdFromRequest"
import { OAuthServerError, decideAuthorization, getAuthorizationRequest, isAuthorizationId, saveHandoff }
  from "@/utils/supabase/oauthServer"

// The app approves an agent's connection: the user scanned the consent page's QR code (or opened its link).
// GET shows who is asking; POST {action: "approve" | "deny"} decides and hands the redirect to the waiting browser.
export const dynamic = "force-dynamic"

const failed = (error: unknown) => error instanceof OAuthServerError
  ? NextResponse.json({ error: error.message }, { status: error.status >= 500 ? 502 : error.status === 404 ? 404 : 400 })
  : (console.error("oauth_consent_failed", error), NextResponse.json({ error: "unavailable" }, { status: 502 }))

export async function GET(_request: NextRequest, { params }: { params: { id: string } }) {
  const { token } = await GetAppSessionOnRequest()
  if (!token) return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  if (!isAuthorizationId(params.id)) return NextResponse.json({ error: "invalid_authorization" }, { status: 422 })
  try {
    const request = await getAuthorizationRequest(params.id, token)
    if (request.status === "pending") return NextResponse.json(request)
    // Already approved for this client: the browser can continue straight away.
    await saveHandoff(params.id, request.redirectUrl)
    return NextResponse.json({ status: "approved" })
  } catch (error) { return failed(error) }
}

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const { token } = await GetAppSessionOnRequest()
  if (!token) return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  if (!isAuthorizationId(params.id)) return NextResponse.json({ error: "invalid_authorization" }, { status: 422 })
  const action = (await request.json().catch(() => null))?.action
  if (action !== "approve" && action !== "deny") return NextResponse.json({ error: "invalid_action" }, { status: 422 })
  try {
    await saveHandoff(params.id, await decideAuthorization(params.id, token, action))
    return NextResponse.json({ status: action === "approve" ? "approved" : "denied" })
  } catch (error) { return failed(error) }
}
