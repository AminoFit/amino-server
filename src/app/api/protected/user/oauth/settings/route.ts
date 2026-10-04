import { NextResponse } from "next/server"
import { GetAppSessionOnRequest } from "@/utils/supabase/GetUserIdFromRequest"
import { agentWritesEnabled, setAgentWrites } from "@/mcp/settings"

// Settings › Connected agents: whether agents may make changes. Only the app's own session reads or changes it; a
// connected agent's token is refused, so an agent can never allow itself.
export const dynamic = "force-dynamic"

const failed = (error: unknown) => {
  console.error("agent_settings_failed", error)
  return NextResponse.json({ error: "unavailable" }, { status: 502 })
}

export async function GET() {
  const { userId } = await GetAppSessionOnRequest()
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  try { return NextResponse.json({ writesEnabled: await agentWritesEnabled(userId) }) } catch (error) { return failed(error) }
}

export async function POST(request: Request) {
  const { userId } = await GetAppSessionOnRequest()
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  const body = await request.json().catch(() => null)
  if (typeof body?.writesEnabled !== "boolean") return NextResponse.json({ error: "invalid_request" }, { status: 422 })
  try {
    await setAgentWrites(userId, body.writesEnabled)
    return NextResponse.json({ writesEnabled: body.writesEnabled })
  } catch (error) { return failed(error) }
}
