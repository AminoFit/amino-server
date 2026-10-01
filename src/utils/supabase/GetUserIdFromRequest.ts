import { cookies } from "next/headers"
import { createHash } from "node:crypto"
import { createAdminSupabase } from "./serverAdmin"
import { oauthClaims } from "@/mcp/auth"

/** Serving changes only need verified identity. The owned LoggedFoodItem row
 * has a foreign key to User, so loading the full profile adds no authorization. */
// A token Supabase Auth verified is trusted for up to a minute (as for MCP tokens), so typing in a search box doesn't
// call Auth on every keystroke. A signed-out or revoked session stops working within a minute.
const VERIFIED_FOR_MS = 60_000
const verified = new Map<string, { userId: string; at: number }>()

export async function GetUserIdOnRequest(): Promise<{ userId?: string; error?: string }> {
  const token = cookies().get("sb-localhost-auth-token")?.value
  if (!token) return { error: "No token provided" }
  const key = createHash("sha256").update(token).digest("hex")
  const hit = verified.get(key)
  if (hit && Date.now() - hit.at < VERIFIED_FOR_MS) return { userId: hit.userId }
  const { data, error } = await createAdminSupabase().auth.getUser(token)
  if (error || !data.user) return { error: error?.message ?? "Invalid session" }
  if (verified.size > 5_000) verified.clear()
  verified.set(key, { userId: data.user.id, at: Date.now() })
  return { userId: data.user.id }
}

/** The app's own session and its access token, for calls made as the user (the OAuth consent endpoints). A token an
 * agent got through OAuth is refused, so a connected agent can't approve or revoke connections itself. */
export async function GetAppSessionOnRequest(): Promise<{ userId?: string; token?: string; error?: string }> {
  const token = cookies().get("sb-localhost-auth-token")?.value
  if (!token) return { error: "No token provided" }
  if (oauthClaims(token)) return { error: "Agent sessions can't do this" }
  const { data, error } = await createAdminSupabase().auth.getUser(token)
  if (error || !data.user) return { error: error?.message ?? "Invalid session" }
  return { userId: data.user.id, token }
}
