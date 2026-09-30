import { metadataCorsOptionsRequestHandler } from "mcp-handler"
import { protectedResourceMetadata } from "@/mcp/metadata"

export const dynamic = "force-dynamic"
export const GET = protectedResourceMetadata
export const OPTIONS = metadataCorsOptionsRequestHandler()
