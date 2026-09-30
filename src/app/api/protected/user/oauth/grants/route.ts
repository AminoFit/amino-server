import { NextRequest, NextResponse } from "next/server"
import { GetAppSessionOnRequest } from "@/utils/supabase/GetUserIdFromRequest"
import { OAuthServerError, listGrants, revokeGrant } from "@/utils/supabase/oauthServer"

// Connected agents (OAuth grants) for the app's Settings: list them, or DELETE ?clientId= to disconnect one.
export const dynamic = "force-dynamic"

const failed = (error: unknown) => {
  if (!(error instanceof OAuthServerError)) console.error("oauth_grants_failed", error)
  return NextResponse.json({ error: "unavailable" }, { status: 502 })
}

export async function GET() {
  const { token } = await GetAppSessionOnRequest()
  if (!token) return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  try { return NextResponse.json({ grants: await listGrants(token) }) } catch (error) { return failed(error) }
}

export async function DELETE(request: NextRequest) {
  const { token } = await GetAppSessionOnRequest()
  if (!token) return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  const clientId = request.nextUrl.searchParams.get("clientId")
  if (!clientId || clientId.length > 200) return NextResponse.json({ error: "invalid_client" }, { status: 422 })
  try { await revokeGrant(token, clientId); return NextResponse.json({ status: "revoked" }) } catch (error) { return failed(error) }
}
