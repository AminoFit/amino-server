import { createHash, randomBytes } from "node:crypto"
import { z } from "zod"
import { createAdminSupabase } from "@/utils/supabase/serverAdmin"
import { userFlagEnabled } from "@/mealResolution/fastRouteFlag"
import { UserFoodError } from "@/userFoods/userFoods"
import { notify } from "@/push/notify"

// People: linking (both agree), grants, blocking, and the meals one person logged for another. The rules live in SQL
// (20261015020000_people_and_sharing.sql, 20261015030000_log_for_others.sql); this calls them as the signed-in user
// and notifies the other person. Plan: 2026-10-07-people-and-sharing-plan.md.

type Db = ReturnType<typeof createAdminSupabase>

export const SITE = "https://www.amino.fit"

/** Errors the people functions raise on purpose (their message is the code), with the status the app gets. */
const KNOWN: Record<string, number> = {
  name_required: 409, too_many_invites: 429, rate_limited: 429, invite_unavailable: 410, own_invite: 409, not_linked: 404,
  not_allowed: 403, food_not_shareable: 422, not_shareable: 422, food_unavailable: 404, link_unavailable: 410,
  meal_unavailable: 404, meal_has_no_foods: 422, invalid_invite: 422, invalid_share: 422, invalid_person: 422,
  ingredient_unavailable: 422
}

export async function rpc<T>(db: Db, name: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await (db as any).rpc(name, args)
  if (error) {
    if (error.message in KNOWN) throw new UserFoodError(error.message, KNOWN[error.message], error.details || undefined)
    throw new Error(`${name} failed: ${error.message}`)
  }
  return data as T
}

/** People is rolled out by FeatureFlag `people`. */
export async function requirePeople(userId: string, db: Db = createAdminSupabase()) {
  if (!(await userFlagEnabled("people", userId, db))) throw new UserFoodError("people_unavailable", 404)
}

const tokenHash = (token: string) => createHash("sha256").update(token).digest("hex")
/** An invite or copy link token: 192 random bits, URL-safe. Only its hash is stored. */
export function newToken() {
  const token = randomBytes(24).toString("base64url")
  return { token, hash: tokenHash(token) }
}
export const hashOf = (token: string) => tokenHash(token)

const name = (db: Db, userId: string) => rpc<string | null>(db, "person_name", { p_user_id: userId })

export const kindInput = z.enum(["friend", "partner", "trainer", "client"])

export async function listPeople(userId: string, db: Db = createAdminSupabase()) {
  await requirePeople(userId, db)
  return rpc(db, "people_list", { p_user_id: userId })
}

export const inviteInput = z.object({ kind: kindInput, asksToLog: z.boolean().default(false),
  channel: z.enum(["qr", "link"]) }).strict()

export async function createInvite(userId: string, input: z.infer<typeof inviteInput>, db: Db = createAdminSupabase()) {
  await requirePeople(userId, db)
  const { token, hash } = newToken()
  const invite = await rpc<{ id: string; expiresAt: string }>(db, "people_create_invite", { p_user_id: userId,
    p_token_hash: hash, p_kind: input.kind, p_asks_to_log: input.asksToLog, p_channel: input.channel })
  return { url: `${SITE}/link/${token}`, token, expiresAt: invite.expiresAt }
}

export const inviteRef = z.union([z.object({ token: z.string().min(16).max(80) }).strict(),
  z.object({ id: z.string().uuid() }).strict()])
const refArgs = (ref: z.infer<typeof inviteRef>) =>
  "token" in ref ? { p_token_hash: hashOf(ref.token), p_invite_id: null } : { p_token_hash: null, p_invite_id: ref.id }

export async function previewInvite(userId: string, ref: z.infer<typeof inviteRef>, db: Db = createAdminSupabase()) {
  await requirePeople(userId, db)
  return rpc(db, "people_invite_preview", { p_user_id: userId, ...refArgs(ref) })
}

export const respondInput = z.object({ invite: inviteRef, accept: z.boolean(), block: z.boolean().default(false),
  canLogForMe: z.boolean().default(false), shareAllFoods: z.boolean().default(false) }).strict()

export async function respondToInvite(userId: string, input: z.infer<typeof respondInput>, db: Db = createAdminSupabase()) {
  await requirePeople(userId, db)
  const result = await rpc<{ status: string; otherId?: string }>(db, "people_respond", { p_user_id: userId,
    ...refArgs(input.invite), p_accept: input.accept, p_block: input.block, p_can_log: input.canLogForMe,
    p_share_all: input.shareAllFoods })
  if (result.status === "accepted" && result.otherId) {
    const who = (await name(db, userId)) ?? "Someone"
    void notify([result.otherId], { kind: "link_accepted", title: `${who} accepted`, body: "You're linked on Amino.",
      url: `${SITE}/people/${userId}` })
  }
  return result
}

export const emailRequestInput = z.object({ email: z.string().trim().email().max(320), kind: kindInput,
  asksToLog: z.boolean().default(false) }).strict()

/** Always answers the same, whether or not the email has an account. */
export async function requestByEmail(userId: string, input: z.infer<typeof emailRequestInput>, db: Db = createAdminSupabase()) {
  await requirePeople(userId, db)
  const target = await rpc<string | null>(db, "people_request_by_email", { p_user_id: userId, p_email: input.email,
    p_kind: input.kind, p_asks_to_log: input.asksToLog })
  if (target) {
    const who = (await name(db, userId)) ?? "Someone"
    void notify([target], { kind: "link_request", title: `${who} wants to link on Amino`, body: "Open People to accept or decline.",
      url: `${SITE}/people` })
  }
  return { sent: true }
}

export const grantInput = z.object({ canLogForMe: z.boolean().optional(), shareAllFoods: z.boolean().optional() }).strict()

export async function setGrant(userId: string, other: string, input: z.infer<typeof grantInput>, db: Db = createAdminSupabase()) {
  await requirePeople(userId, db)
  return rpc(db, "people_set_grant", { p_user_id: userId, p_other: other, p_can_log: input.canLogForMe ?? null,
    p_share_all: input.shareAllFoods ?? null })
}

/** Silent: the other person isn't told (owner). */
export async function endLink(userId: string, other: string, db: Db = createAdminSupabase()) {
  await requirePeople(userId, db)
  return { ended: await rpc<boolean>(db, "people_end_link", { p_user_id: userId, p_other: other }) }
}

export async function block(userId: string, other: string, db: Db = createAdminSupabase()) {
  await requirePeople(userId, db)
  await rpc(db, "people_block", { p_user_id: userId, p_other: other })
  return { blocked: true }
}

export async function unblock(userId: string, other: string, db: Db = createAdminSupabase()) {
  await requirePeople(userId, db)
  await rpc(db, "people_unblock", { p_user_id: userId, p_other: other })
  return { blocked: false }
}

/** Meals the user logged for someone, while they may still log for them. */
export async function mealsLoggedFor(userId: string, other: string, db: Db = createAdminSupabase()) {
  await requirePeople(userId, db)
  return { meals: await rpc(db, "meals_logged_for", { p_actor: userId, p_target: other, p_limit: 100 }) }
}

/** Deletes a meal the user logged for someone (the owner can restore it from their log for 30 days). */
export async function deleteMealLoggedFor(userId: string, messageId: number, db: Db = createAdminSupabase()) {
  await requirePeople(userId, db)
  const target = await rpc<string | null>(db, "meal_logged_by", { p_actor: userId, p_message_id: messageId })
  if (!target) throw new UserFoodError("meal_unavailable", 404)
  await rpc(db, "agent_delete_meal", { p_user_id: target, p_message_id: messageId })
  return { deleted: true }
}

/** People who let this user log for them. */
export async function logTargets(userId: string, db: Db = createAdminSupabase()) {
  return rpc<{ id: string; name: string | null; tz: string | null }[]>(db, "log_targets", { p_actor: userId })
}
