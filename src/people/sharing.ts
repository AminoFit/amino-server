import { z } from "zod"
import { createAdminSupabase } from "@/utils/supabase/serverAdmin"
import { UserFoodError, getUserFood } from "@/userFoods/userFoods"
import { notify } from "@/push/notify"
import { SITE, hashOf, newToken, requirePeople, rpc } from "./people"

// Sharing foods: live with linked people (they follow the owner's edits), or as a copy link anyone can add to their own
// foods. The rules live in SQL (20261015020000_people_and_sharing.sql).

type Db = ReturnType<typeof createAdminSupabase>
type Food = { id: number; name: string; privateToUserId: string | null; lineageId: number | null; archivedAt: string | null }

async function ownFood(db: Db, userId: string, foodId: number) {
  const { data, error } = await (db as any).from("FoodItem").select("id,name,privateToUserId,lineageId,archivedAt").eq("id", foodId).maybeSingle()
  if (error) throw error
  const food = data as Food | null
  if (!food || food.privateToUserId !== userId || food.archivedAt) throw new UserFoodError("food_unavailable", 404)
  return food
}

/** The share sheet: linked people, and how each sees this food. */
export async function foodSharing(userId: string, foodId: number, db: Db = createAdminSupabase()) {
  await requirePeople(userId, db)
  const food = await ownFood(db, userId, foodId)
  const [people, sharedWith] = await Promise.all([rpc<{ linked: { id: string; name: string; kind: string;
    mine: { shareAllFoods: boolean } }[] }>(db, "people_list", { p_user_id: userId }),
  rpc<{ id: string; explicit: boolean; all: boolean; inRecipe: boolean }[]>(db, "food_shared_with", { p_owner: userId,
    p_lineage_id: food.lineageId })])
  const access = new Map(sharedWith.map(row => [row.id, row]))
  return { lineageId: food.lineageId, people: people.linked.map(person => ({ id: person.id, name: person.name, kind: person.kind,
    shared: access.get(person.id)?.explicit ?? false, all: person.mine.shareAllFoods,
    inRecipe: access.get(person.id)?.inRecipe ?? false })) }
}

export const shareInput = z.object({ recipientIds: z.array(z.string().uuid()).min(1).max(100), on: z.boolean() }).strict()

/** Shares (or stops sharing) one of the user's foods with linked people; tells those it's newly shared with. */
export async function shareFood(userId: string, foodIds: number[], recipientIds: string[], on: boolean,
  options: { via?: "app" | "mcp"; agentClientId?: string | null } = {}, db: Db = createAdminSupabase()) {
  await requirePeople(userId, db)
  const foods = await Promise.all(foodIds.map(id => ownFood(db, userId, id)))
  const before = on ? await (db as any).from("FoodAccess").select("recipientId,lineageId").eq("ownerId", userId)
    .in("recipientId", recipientIds).in("lineageId", foods.map(food => food.lineageId)).is("revokedAt", null) : { data: [] }
  const result = await rpc<{ changed: number; refused: { recipientId: string; lineageId?: number; reason: string; foods?: string }[] }>(
    db, "share_foods", { p_owner: userId, p_lineages: foods.map(food => food.lineageId), p_recipients: recipientIds, p_on: on,
      p_reason: "share", p_via: options.via ?? "app", p_agent: options.agentClientId ?? null })
  if (on) {
    const had = new Set(((before.data ?? []) as { recipientId: string; lineageId: number }[]).map(row => `${row.recipientId}:${row.lineageId}`))
    const refused = new Set(result.refused.map(row => `${row.recipientId}:${row.lineageId ?? "*"}`))
    const who = (await rpc<string | null>(db, "person_name", { p_user_id: userId })) ?? "Someone"
    for (const recipient of recipientIds) {
      const fresh = foods.filter(food => !had.has(`${recipient}:${food.lineageId}`) && !refused.has(`${recipient}:${food.lineageId}`)
        && !refused.has(`${recipient}:*`))
      if (!fresh.length) continue
      void notify([recipient], { kind: "food_shared", title: `${who} shared ${fresh.length === 1 ? fresh[0].name : `${fresh.length} foods`} with you`,
        body: "It's in your Foods.", url: fresh.length === 1 ? `${SITE}/foods/${fresh[0].id}` : `${SITE}/foods` })
    }
  }
  return result
}

/** A copy link for one of the user's foods. Anyone with it can add their own copy. */
export async function createCopyLink(userId: string, foodId: number, db: Db = createAdminSupabase()) {
  await requirePeople(userId, db)
  const { token, hash } = newToken()
  await rpc(db, "create_food_copy_link", { p_owner: userId, p_food_id: foodId, p_token_hash: hash })
  return { url: `${SITE}/f/${token}` }
}

export async function revokeCopyLinks(userId: string, foodId: number, db: Db = createAdminSupabase()) {
  const food = await ownFood(db, userId, foodId)
  return { revoked: await rpc<number>(db, "revoke_food_copy_links", { p_owner: userId, p_lineage_id: food.lineageId }) }
}

/** What a copy link offers: the food (read as its owner, who can see it), who shared it, and any copy the user has. */
export async function copyLinkPreview(userId: string, token: string, db: Db = createAdminSupabase()) {
  const preview = await rpc<{ status: string; foodId?: number; from?: { id: string; name: string | null }; existingCopyId?: number | null }>(
    db, "food_copy_link_preview", { p_user_id: userId, p_token_hash: hashOf(token) })
  if (preview.status === "unavailable") return { status: "unavailable" }
  const food = await getUserFood(preview.from!.id, preview.foodId!, db) as Record<string, any>
  const ingredients = (food.ingredients ?? []).map((row: any) => ({ name: row.FoodItem?.name ?? null, grams: row.grams,
    servingAmount: row.servingAmount, loggedUnit: row.loggedUnit }))
  return { status: preview.status, from: preview.from, existingCopyId: preview.existingCopyId ?? null,
    food: { name: food.name, brand: food.brand, recipePortions: food.recipePortions, defaultServingWeightGram: food.defaultServingWeightGram,
      kcalPerServing: food.kcalPerServing, proteinPerServing: food.proteinPerServing, carbPerServing: food.carbPerServing,
      totalFatPerServing: food.totalFatPerServing, fiberPerServing: food.fiberPerServing, sugarPerServing: food.sugarPerServing,
      perServing: food.perServing, isLiquid: food.isLiquid, Serving: food.Serving, ingredients } }
}

export async function copyFromLink(userId: string, token: string, again: boolean, db: Db = createAdminSupabase()) {
  return rpc<{ foodId: number; existing: boolean }>(db, "copy_food_from_link", { p_user_id: userId,
    p_token_hash: hashOf(token), p_again: again })
}

/** "Save a copy" of a food shared with the user. */
export async function saveCopy(userId: string, foodId: number, db: Db = createAdminSupabase()) {
  return { foodId: await rpc<number>(db, "save_food_copy", { p_user_id: userId, p_food_id: foodId }) }
}

/** "Remove from my foods" (or bring it back). The owner isn't told. */
export async function hideShared(userId: string, lineageId: number, hidden: boolean, db: Db = createAdminSupabase()) {
  return { hidden: (await rpc<boolean>(db, "hide_shared_food", { p_user_id: userId, p_lineage_id: lineageId, p_hidden: hidden })) && hidden }
}
