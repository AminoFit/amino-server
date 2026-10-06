import { createMcpHandler, withMcpAuth } from "mcp-handler"
import { verifyMcpToken } from "@/mcp/auth"
import { bufferedReply, streamsUntilClosed } from "@/mcp/bufferedReply"
import { RESOURCE_METADATA_PATH } from "@/mcp/metadata"
import { MCP_INSTRUCTIONS, registerAminoTools } from "@/mcp/tools"
import { userFlagEnabled } from "@/mealResolution/fastRouteFlag"

// The MCP server agents connect to (Streamable HTTP, stateless). Sign-in is OAuth through Supabase Auth; the
// consent step happens at /oauth/consent. FeatureFlag mcp_server is the kill switch.
export const dynamic = "force-dynamic"
export const maxDuration = 60

const mcp = createMcpHandler(registerAminoTools, {
  serverInfo: { name: "amino", version: "1.0.0" },
  instructions: MCP_INSTRUCTIONS
})

async function enabled(request: Request) {
  const userId = (request.auth?.extra as { userId?: string } | undefined)?.userId
  if (!userId || !(await userFlagEnabled("mcp_server", userId)))
    return Response.json({ error: "Amino's agent access is switched off right now." }, { status: 503 })
  const body = request.method === "POST" ? await request.clone().json().catch(() => undefined) : undefined
  if (body === undefined || streamsUntilClosed(body)) return mcp(request)
  const label = Array.isArray(body) ? "batch" : `${body?.method}${body?.params?.name ? ` ${body.params.name}` : ""}`
  const started = Date.now()
  // A request that aborts before its reply is sent tears the SDK's stream down; logged so it isn't a silent 200.
  request.signal.addEventListener("abort", () => console.warn("mcp_request_aborted", { label, ms: Date.now() - started }),
    { once: true })
  return bufferedReply(await mcp(request), { batch: Array.isArray(body), label })
}

const handler = withMcpAuth(enabled, verifyMcpToken, { required: true, resourceMetadataPath: RESOURCE_METADATA_PATH })

export { handler as GET, handler as POST, handler as DELETE }
