import { createAdminSupabase } from "./serverAdmin"

// Supabase Auth's OAuth 2.1 server, called as the signed-in user. The consent page on the web and the app (through
// /api/protected/user/oauth/*) use it to approve an agent's connection and to list or revoke connections.

const AUTH_URL = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1`
const AUTHORIZATION_ID = /^[A-Za-z0-9_-]{8,128}$/
const HANDOFF_LIFETIME_MS = 10 * 60_000

export class OAuthServerError extends Error {
  constructor(message: string, readonly status: number) { super(message) }
}

export const isAuthorizationId = (id: unknown): id is string => typeof id === "string" && AUTHORIZATION_ID.test(id)

async function authRequest<T>(path: string, accessToken: string, init: { method?: string; body?: object } = {}) {
  const response = await fetch(`${AUTH_URL}${path}`, {
    method: init.method ?? "GET", cache: "no-store",
    headers: { apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, Authorization: `Bearer ${accessToken}`,
      ...(init.body ? { "Content-Type": "application/json" } : {}) },
    body: init.body ? JSON.stringify(init.body) : undefined
  })
  const text = await response.text()
  const data = text ? JSON.parse(text) : {}
  if (!response.ok) throw new OAuthServerError(data.msg ?? data.message ?? data.error_description ?? "oauth_error", response.status)
  return data as T
}

export type OAuthClient = { id: string; name: string; uri: string | null; logoUri: string | null }
type RawClient = { id?: string; client_id?: string; name?: string; client_name?: string; uri?: string; client_uri?: string
  logo_uri?: string }
const clientOf = (client: RawClient | undefined): OAuthClient => ({
  id: client?.id ?? client?.client_id ?? "", name: client?.name ?? client?.client_name ?? "An app",
  uri: client?.uri ?? client?.client_uri ?? null, logoUri: client?.logo_uri ?? null })

export type AuthorizationRequest =
  | { status: "pending"; client: OAuthClient; redirectHost: string; scopes: string[] }
  | { status: "decided"; redirectUrl: string }

/** What an agent is asking for. Fetching it ties the request to this user. If the user already approved this client,
 * Supabase answers with the redirect straight away. */
export async function getAuthorizationRequest(authorizationId: string, accessToken: string): Promise<AuthorizationRequest> {
  const data = await authRequest<{ redirect_url?: string; client?: RawClient; redirect_uri?: string; scope?: string }>(
    `/oauth/authorizations/${authorizationId}`, accessToken)
  if (data.redirect_url) return { status: "decided", redirectUrl: data.redirect_url }
  let redirectHost = data.redirect_uri ?? ""
  try { redirectHost = new URL(redirectHost).host || redirectHost } catch {}
  return { status: "pending", client: clientOf(data.client), redirectHost,
    scopes: (data.scope ?? "").split(" ").filter(Boolean) }
}

export async function decideAuthorization(authorizationId: string, accessToken: string, action: "approve" | "deny") {
  const data = await authRequest<{ redirect_url?: string }>(`/oauth/authorizations/${authorizationId}/consent`,
    accessToken, { method: "POST", body: { action } })
  if (!data.redirect_url) throw new OAuthServerError("no_redirect", 502)
  return data.redirect_url
}

export type OAuthGrant = { client: OAuthClient; scopes: string[]; grantedAt: string }
export async function listGrants(accessToken: string): Promise<OAuthGrant[]> {
  const data = await authRequest<{ client?: RawClient; scopes?: string[]; granted_at?: string }[]>("/user/oauth/grants", accessToken)
  return (Array.isArray(data) ? data : []).map(grant => ({ client: clientOf(grant.client), scopes: grant.scopes ?? [],
    grantedAt: grant.granted_at ?? "" }))
}

export async function revokeGrant(accessToken: string, clientId: string) {
  await authRequest(`/user/oauth/grants?client_id=${encodeURIComponent(clientId)}`, accessToken, { method: "DELETE" })
}

/** The app approved (or denied) the request: leave the client's redirect for the browser that is waiting on it. */
export async function saveHandoff(authorizationId: string, redirectUrl: string) {
  const db = createAdminSupabase() as any
  const { error } = await db.from("OAuthConsentHandoff").upsert({ authorizationId, redirectUrl, createdAt: new Date().toISOString() })
  if (error) throw error
  await db.from("OAuthConsentHandoff").delete().lt("createdAt", new Date(Date.now() - HANDOFF_LIFETIME_MS).toISOString())
}

/** The redirect for a waiting browser, once. */
export async function takeHandoff(authorizationId: string): Promise<string | null> {
  const db = createAdminSupabase() as any
  const { data, error } = await db.from("OAuthConsentHandoff").delete().eq("authorizationId", authorizationId)
    .gte("createdAt", new Date(Date.now() - HANDOFF_LIFETIME_MS).toISOString()).select("redirectUrl").maybeSingle()
  if (error) throw error
  return data?.redirectUrl ?? null
}
