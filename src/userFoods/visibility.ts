import type { createAdminSupabase } from "@/utils/supabase/serverAdmin"

// Who may see a food, for server reads: they use the service role, which bypasses row security. This mirrors
// public.food_visible (20261015000000, 20261015020000): the shared catalogue, the user's own private foods, and foods
// shared with them (FoodAccess, by lineage). Every server read of foods on a user's behalf filters through here, so the
// rule lives in one place on each side.

type Db = ReturnType<typeof createAdminSupabase>
type FoodOwner = { privateToUserId: string | null; lineageId?: number | null }

/** Lineages shared with this user. */
async function sharedLineages(db: Db, userId: string): Promise<number[]> {
  const { data, error } = await (db as any).from("FoodAccess").select("lineageId").eq("recipientId", userId)
    .is("revokedAt", null).limit(1000)
  if (error) throw error
  return ((data ?? []) as { lineageId: number }[]).map(row => row.lineageId)
}

/** A PostgREST `.or()` filter for the FoodItem rows this user may see. */
export async function visibleFoodFilter(db: Db, userId: string): Promise<string> {
  const lineages = await sharedLineages(db, userId)
  const own = `privateToUserId.is.null,privateToUserId.eq.${userId}`
  return lineages.length ? `${own},lineageId.in.(${lineages.join(",")})` : own
}

/** The catalogue and this user's own foods, never foods shared with them: the space a barcode is unique in and
 * duplicates are looked for in. */
export function catalogueOrOwnFilter(userId: string | null): string {
  return userId ? `privateToUserId.is.null,privateToUserId.eq.${userId}` : "privateToUserId.is.null"
}

/** Whether this user may see this food. */
export async function canSeeFood(db: Db, userId: string, food: FoodOwner): Promise<boolean> {
  if (!food.privateToUserId || food.privateToUserId === userId) return true
  if (food.lineageId == null) return false
  return (await sharedLineages(db, userId)).includes(food.lineageId)
}
