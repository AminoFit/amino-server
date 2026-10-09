import { createAdminSupabase } from "@/utils/supabase/serverAdmin"

// The user's choice: may connected agents make changes (log, edit and delete meals, add their own foods and recipes)?
// Off until the user turns it on in the app; only the app's own session changes it (AgentSettings is written by the
// server, never with a user's token). FeatureFlag mcp_writes is the kill switch.

export const WRITES_OFF = "Changes are off. Ask the user to turn on Let agents make changes in the Amino app: Settings › " +
  "Connected agents."
export async function agentWritesEnabled(userId: string) {
  const { data, error } = await (createAdminSupabase() as any).from("AgentSettings").select("writesEnabled")
    .eq("userId", userId).maybeSingle()
  if (error) throw error
  return data?.writesEnabled === true
}

/** Why an agent may not write for this user right now, or null when it may. Read on every call (no cache), so turning
 * the setting off applies to the next call. */
export async function agentWriteRefusal(userId: string) {
  return (await agentWritesEnabled(userId)) ? null : WRITES_OFF
}

export async function setAgentWrites(userId: string, enabled: boolean) {
  const { error } = await (createAdminSupabase() as any).from("AgentSettings")
    .upsert({ userId, writesEnabled: enabled, updatedAt: new Date().toISOString() }, { onConflict: "userId" })
  if (error) throw error
}
