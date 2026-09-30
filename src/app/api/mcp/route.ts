import { createMcpHandler, withMcpAuth } from "mcp-handler"
import { verifyMcpToken } from "@/mcp/auth"
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
  return mcp(request)
}

const handler = withMcpAuth(enabled, verifyMcpToken, { required: true, resourceMetadataPath: RESOURCE_METADATA_PATH })

export { handler as GET, handler as POST, handler as DELETE }
