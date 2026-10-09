import { createAdminSupabase } from "@/utils/supabase/serverAdmin"

/** A per-user switch in FeatureFlag: "off", "all", or a comma-separated list of user IDs. Cached for 30 s, so a flip
 * takes effect without a deploy; a failed read keeps the last value (off before any read). Before launch only kill
 * switches for external dependencies live here (meal_agent_sonnet), each with a removal date. */
const cached = new Map<string, { value: string; at: number }>()

export function fastRouteEnabledFor(value: string, userId: string) {
  const trimmed = value.trim().toLowerCase()
  if (trimmed === "all") return true
  if (!trimmed || trimmed === "off") return false
  return trimmed.split(",").map(id => id.trim()).includes(userId.toLowerCase())
}

/** Whether a FeatureFlag switch is on for this user. */
export async function userFlagEnabled(flag: string, userId: string,
  db: ReturnType<typeof createAdminSupabase> = createAdminSupabase()) {
  const hit = cached.get(flag)
  if (!hit || Date.now() - hit.at >= 30_000) {
    const { data, error } = await (db as any).from("FeatureFlag").select("value").eq("name", flag).maybeSingle()
    cached.set(flag, { value: error ? hit?.value ?? "off" : (data as { value?: string } | null)?.value ?? "off", at: Date.now() })
  }
  return fastRouteEnabledFor(cached.get(flag)!.value, userId)
}
