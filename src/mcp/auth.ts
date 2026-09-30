import type { AuthInfo } from "@modelcontextprotocol/server"
import { createClient } from "@supabase/supabase-js"
import { decodeJwt } from "jose"
import { createHash } from "node:crypto"
import { createAdminSupabase } from "@/utils/supabase/serverAdmin"

// Agents connect through Supabase Auth's OAuth 2.1 server, so their access tokens are ordinary user sessions with a
// `client_id` claim. Only those are accepted here: every connection is then a grant the user can see and revoke.
// A verified token is trusted for up to a minute, so a revoked grant stops working within a minute.
const VERIFIED_FOR_MS = 60_000
const verified = new Map<string, { auth: AuthInfo; at: number }>()

export type McpAuth = AuthInfo & { extra: { userId: string } }

export async function verifyMcpToken(_request: Request, token?: string): Promise<McpAuth | undefined> {
  if (!token) return undefined
  const key = createHash("sha256").update(token).digest("hex")
  const hit = verified.get(key)
  if (hit && Date.now() - hit.at < VERIFIED_FOR_MS && (!hit.auth.expiresAt || hit.auth.expiresAt * 1000 > Date.now()))
    return hit.auth as McpAuth
  const claims = oauthClaims(token)
  if (!claims) return undefined
  const { data, error } = await createAdminSupabase().auth.getUser(token)
  if (error || !data.user || data.user.id !== claims.sub) return undefined
  const auth: McpAuth = { token, clientId: claims.clientId, scopes: claims.scopes, expiresAt: claims.exp,
    extra: { userId: data.user.id } }
  if (verified.size > 5_000) verified.clear()
  verified.set(key, { auth, at: Date.now() })
  return auth
}

/** The claims of an OAuth-issued access token, or null for anything else (including the app's own sessions). */
export function oauthClaims(token: string) {
  try {
    const claims = decodeJwt(token)
    if (typeof claims.client_id !== "string" || !claims.client_id || typeof claims.sub !== "string") return null
    return { sub: claims.sub, clientId: claims.client_id, exp: typeof claims.exp === "number" ? claims.exp : undefined,
      scopes: typeof claims.scope === "string" ? claims.scope.split(" ").filter(Boolean) : [] }
  } catch {
    return null
  }
}

/** A database client acting as the user, so row-level security applies to everything an agent reads or writes. */
export function userDatabase(token: string) {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false }
  })
}
export type UserDatabase = ReturnType<typeof userDatabase>
