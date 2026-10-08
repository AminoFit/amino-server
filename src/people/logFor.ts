import { z } from "zod"
import { createAdminSupabase } from "@/utils/supabase/serverAdmin"
import { UserFoodError, describe, iconsFor, listsFoods, logFoodsAsMeal, priceItems, quantityInput,
  utcWallClock } from "@/userFoods/userFoods"
import { utcInstant, validTimezone, wallClockInZone } from "@/mealOperations/instant"
import { notify } from "@/push/notify"
import { SITE, logTargets, requirePeople, rpc } from "./people"

// Logging meals for other people (20261015030000_log_for_others.sql): one meal per person, priced once, the actor's own
// foods shared with them as needed. Same amounts for everyone; each person changes their own portion afterwards.

type Db = ReturnType<typeof createAdminSupabase>

export const logForInput = z.object({
  items: z.array(z.object({ foodItemId: z.number().int().positive(), quantity: quantityInput }).strict()).min(1).max(50),
  consumedOn: z.string().datetime({ offset: true }),
  /** A chosen day and time ("2026-10-07T19:00"): it happens at that wall clock time in each person's own timezone.
   * Without it ("now") everyone gets the same instant. */
  wallClock: z.string().regex(/^\d{4}-\d\d-\d\dT\d\d:\d\d$/).optional(),
  localId: z.string().uuid(),
  forUserIds: z.array(z.string().uuid()).min(1).max(20).optional(),
  allowDuplicate: z.boolean().default(false)
}).strict()

type Duplicate = { userId: string; name: string | null; meal: { messageId: number; consumedOn: string; content: string } }

/** Each person's instant for this meal (UTC wall clock, as Message.consumedOn stores it). */
async function instantsFor(db: Db, actor: string, ids: string[], consumedOn: string, wallClock: string | undefined) {
  if (!wallClock) return new Map(ids.map(id => [id, utcWallClock(consumedOn)]))
  const zones = new Map((await logTargets(actor, db)).map(target => [target.id, target.tz]))
  if (ids.includes(actor)) {
    const { data } = await db.from("User").select("tzIdentifier").eq("id", actor).maybeSingle()
    zones.set(actor, data?.tzIdentifier ?? null)
  }
  return new Map(ids.map(id => {
    const zone = zones.get(id)
    return [id, utcWallClock(validTimezone(zone) ? wallClockInZone(wallClock, zone) : consumedOn)]
  }))
}

/** Add Food's tray (or an agent's log) for the user and/or people who let them log for them. */
export async function logFoodsFor(actor: string, input: z.infer<typeof logForInput>, options: { agentClientId?: string | null;
  agentName?: string | null } = {}, db: Db = createAdminSupabase()) {
  const ids = [...new Set(input.forUserIds ?? [actor])]
  if (ids.length === 1 && ids[0] === actor) {
    const meal = await logFoodsAsMeal(actor, input.items, input.consumedOn, input.localId, db)
    // An agent's entry for the user alone (log_meals) is labelled like any other agent meal.
    if (meal.created && options.agentClientId) await (db as any).from("Message").update({ agentClientId: options.agentClientId,
      agentName: options.agentName ?? null }).eq("id", meal.messageId).eq("userId", actor)
    return { status: "logged" as const, meals: [{ userId: actor, ...meal }] }
  }
  await requirePeople(actor, db)
  const priced = await priceItems(actor, input.items, db)
  const content = priced.map(entry => describe(entry.food, entry.item)).join(", ")
  const instants = await instantsFor(db, actor, ids, utcInstant(input.consumedOn), input.wallClock)
  const result = await rpc<{ status: "logged" | "possible_duplicate"; duplicates?: Duplicate[];
    meals?: { userId: string; messageId: number; created: boolean; loggedFoodItemIds: number[] }[] }>(db, "log_foods_for_people", {
    p_actor: actor, p_targets: ids.map(id => ({ userId: id, consumedOn: instants.get(id) })), p_local_id: input.localId,
    p_content: content, p_items: priced.map(entry => entry.item), p_allow_duplicate: input.allowDuplicate })
  if (result.status === "possible_duplicate") return result
  const created = (result.meals ?? []).filter(meal => meal.created)
  if (created.length) {
    await Promise.all([iconsFor(db, priced.map(entry => entry.food.id)), ...created.map(meal => listsFoods(db, meal.messageId))])
    if (options.agentClientId) await (db as any).from("Message").update({ agentClientId: options.agentClientId,
      agentName: options.agentName ?? null }).in("id", created.map(meal => meal.messageId))
    await notifyLogged(db, actor, created.filter(meal => meal.userId !== actor).map(meal => meal.userId), content,
      priced.reduce((sum, entry) => sum + (entry.item.nutrition?.kcal ?? 0), 0), options.agentName)
  }
  return result
}

export const copyMealInput = z.object({ forUserIds: z.array(z.string().uuid()).min(1).max(20),
  allowDuplicate: z.boolean().default(false) }).strict()

/** "Log for…" on a past meal: the same foods and numbers into other people's diaries, at the same time. */
export async function copyMealTo(actor: string, messageId: number, input: z.infer<typeof copyMealInput>, db: Db = createAdminSupabase()) {
  await requirePeople(actor, db)
  if (input.forUserIds.includes(actor)) throw new UserFoodError("invalid_meal", 422)
  const result = await rpc<{ status: string; duplicates?: Duplicate[]; meals?: { userId: string; messageId: number; created: boolean }[] }>(
    db, "copy_meal_to_people", { p_actor: actor, p_message_id: messageId,
      p_targets: input.forUserIds.map(userId => ({ userId })), p_allow_duplicate: input.allowDuplicate })
  if (result.status === "logged") {
    const { data } = await db.from("Message").select("content").eq("id", messageId).maybeSingle()
    const { data: rows } = await db.from("LoggedFoodItem").select("kcal").eq("messageId", messageId).is("deletedAt", null)
    await notifyLogged(db, actor, (result.meals ?? []).filter(meal => meal.created).map(meal => meal.userId), data?.content ?? "a meal",
      ((rows ?? []) as { kcal: number | null }[]).reduce((sum, row) => sum + (row.kcal ?? 0), 0))
  }
  return result
}

async function notifyLogged(db: Db, actor: string, targets: string[], content: string, kcal: number, agentName?: string | null) {
  if (!targets.length) return
  const who = (await rpc<string | null>(db, "person_name", { p_user_id: actor })) ?? "Someone"
  const what = content.length > 60 ? `${content.slice(0, 57)}…` : content
  void notify(targets, { kind: "meal_logged", title: `${who}${agentName ? ` (via ${agentName})` : ""} logged a meal for you`,
    body: `${what} · ${Math.round(kcal)} kcal`, url: `${SITE}/log` })
}
