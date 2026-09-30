import { NextRequest, NextResponse } from "next/server"
import { isAuthorizationId, takeHandoff } from "@/utils/supabase/oauthServer"

// The consent page polls this while the user approves in the app. The redirect it returns carries an authorization
// code that only the requesting client (holding the PKCE verifier) can exchange.
export const dynamic = "force-dynamic"

export async function GET(_request: NextRequest, { params }: { params: { id: string } }) {
  if (!isAuthorizationId(params.id)) return NextResponse.json({ error: "invalid_authorization" }, { status: 422 })
  try {
    const redirectUrl = await takeHandoff(params.id)
    return NextResponse.json(redirectUrl ? { status: "decided", redirectUrl } : { status: "waiting" })
  } catch (error) {
    console.error("oauth_handoff_failed", error)
    return NextResponse.json({ status: "waiting" })
  }
}
