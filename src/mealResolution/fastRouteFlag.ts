import { createAdminSupabase } from "@/utils/supabase/serverAdmin"

/** FeatureFlag.meal_text_fast_route: "off", "all", or a comma-separated list of user IDs. Cached for 30 s, so a flip
 * takes effect without a deploy; a failed read keeps the last value (off before any read). */
export const FAST_ROUTE_FLAG = "meal_text_fast_route"
let cached: { value: string; at: number } | undefined

export function fastRouteEnabledFor(value: string, userId: string) {
  const trimmed = value.trim().toLowerCase()
  if (trimmed === "all") return true
  if (!trimmed || trimmed === "off") return false
  return trimmed.split(",").map(id => id.trim()).includes(userId.toLowerCase())
}

export async function textFastRouteEnabled(userId: string,
  db: ReturnType<typeof createAdminSupabase> = createAdminSupabase()): Promise<boolean> {
  if (!cached || Date.now() - cached.at >= 30_000) {
    const { data, error } = await (db as any).from("FeatureFlag").select("value").eq("name", FAST_ROUTE_FLAG).maybeSingle()
    cached = { value: error ? cached?.value ?? "off" : (data as { value?: string } | null)?.value ?? "off", at: Date.now() }
  }
  return fastRouteEnabledFor(cached.value, userId)
}
