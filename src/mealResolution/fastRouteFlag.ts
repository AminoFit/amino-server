import { createAdminSupabase } from "@/utils/supabase/serverAdmin"

/** Fast-route switches in FeatureFlag: "off", "all", or a comma-separated list of user IDs. Cached for 30 s, so a flip
 * takes effect without a deploy; a failed read keeps the last value (off before any read). */
export const FAST_ROUTE_FLAG = "meal_text_fast_route"
export const PHOTO_FAST_ROUTE_FLAG = "meal_photo_fast_route"
const cached = new Map<string, { value: string; at: number }>()

export function fastRouteEnabledFor(value: string, userId: string) {
  const trimmed = value.trim().toLowerCase()
  if (trimmed === "all") return true
  if (!trimmed || trimmed === "off") return false
  return trimmed.split(",").map(id => id.trim()).includes(userId.toLowerCase())
}

/** Any per-user switch in FeatureFlag, with the same values and 30 s cache. */
export async function userFlagEnabled(flag: string, userId: string,
  db: ReturnType<typeof createAdminSupabase> = createAdminSupabase()) {
  const hit = cached.get(flag)
  if (!hit || Date.now() - hit.at >= 30_000) {
    const { data, error } = await (db as any).from("FeatureFlag").select("value").eq("name", flag).maybeSingle()
    cached.set(flag, { value: error ? hit?.value ?? "off" : (data as { value?: string } | null)?.value ?? "off", at: Date.now() })
  }
  return fastRouteEnabledFor(cached.get(flag)!.value, userId)
}

export const textFastRouteEnabled = (userId: string, db: ReturnType<typeof createAdminSupabase> = createAdminSupabase()) =>
  userFlagEnabled(FAST_ROUTE_FLAG, userId, db)
export const photoFastRouteEnabled = (userId: string, db: ReturnType<typeof createAdminSupabase> = createAdminSupabase()) =>
  userFlagEnabled(PHOTO_FAST_ROUTE_FLAG, userId, db)
