"use server"

import { createClient } from "@/utils/supabase/server"
import { OAuthServerError, revokeGrant } from "@/utils/supabase/oauthServer"

/** Disconnect an agent: revoke its OAuth grant (as the app's Settings → Connected agents does). */
export async function disconnectAgent(clientId: string): Promise<{ ok: true } | { error: string }> {
  if (typeof clientId !== "string" || !clientId || clientId.length > 200) return { error: "invalid" }
  const { data: { session } } = await createClient().auth.getSession()
  if (!session) return { error: "signed_out" }
  try {
    await revokeGrant(session.access_token, clientId)
    return { ok: true }
  } catch (error) {
    if (!(error instanceof OAuthServerError)) console.error("web_disconnect_agent_failed", error)
    return { error: "failed" }
  }
}
