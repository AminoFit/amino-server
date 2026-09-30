"use server"

import { createClient } from "@/utils/supabase/server"
import { decideAuthorization, isAuthorizationId } from "@/utils/supabase/oauthServer"

/** Approve or deny on the web, for someone signed in here. Returns the client's redirect for the browser to follow
 * (it can be a custom scheme or a local address, which a server redirect can't reach). */
export async function decideOnWeb(authorizationId: string, action: "approve" | "deny") {
  if (!isAuthorizationId(authorizationId) || (action !== "approve" && action !== "deny")) return { error: "invalid" }
  const { data: { session } } = await createClient().auth.getSession()
  if (!session) return { error: "signed_out" }
  try {
    return { redirectUrl: await decideAuthorization(authorizationId, session.access_token, action) }
  } catch (error) {
    console.error("oauth_web_consent_failed", error)
    return { error: "failed" }
  }
}
