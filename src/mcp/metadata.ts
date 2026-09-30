import { generateProtectedResourceMetadata, getPublicOrigin } from "mcp-handler"

// OAuth discovery for MCP clients (RFC 9728): /api/mcp is protected by Supabase Auth's OAuth 2.1 server. Its issuer
// can differ from the URL the app uses for Supabase (a custom domain), so it's read from the server's own metadata.
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
let issuer: Promise<string> | undefined

export function authorizationServer() {
  issuer ??= fetch(`${SUPABASE_URL}/.well-known/oauth-authorization-server/auth/v1`, { cache: "no-store" })
    .then(response => response.ok ? response.json() : Promise.reject(new Error(`status ${response.status}`)))
    .then((metadata: { issuer?: string }) => metadata.issuer ?? `${SUPABASE_URL}/auth/v1`)
    .catch(error => {
      console.warn("oauth_issuer_unavailable", { error: error instanceof Error ? error.message : String(error) })
      issuer = undefined
      return `${SUPABASE_URL}/auth/v1`
    })
  return issuer
}

export const MCP_RESOURCE_PATH = "/api/mcp"
export const RESOURCE_METADATA_PATH = `/.well-known/oauth-protected-resource${MCP_RESOURCE_PATH}`

export async function protectedResourceMetadata(request: Request) {
  const metadata = generateProtectedResourceMetadata({ authServerUrls: [await authorizationServer()],
    resourceUrl: `${getPublicOrigin(request)}${MCP_RESOURCE_PATH}` })
  return Response.json({ ...metadata, resource_name: "Amino", bearer_methods_supported: ["header"] }, {
    headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "*", "Cache-Control": "max-age=3600" }
  })
}
