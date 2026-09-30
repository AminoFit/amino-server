import { metadataCorsOptionsRequestHandler } from "mcp-handler"
import { protectedResourceMetadata } from "@/mcp/metadata"

// Clients that don't use the path-specific document (./api/mcp) look here; there is only one protected resource.
export const dynamic = "force-dynamic"
export const GET = protectedResourceMetadata
export const OPTIONS = metadataCorsOptionsRequestHandler()
