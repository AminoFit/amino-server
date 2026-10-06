import { z } from "zod"
import type { AuthInfo } from "@modelcontextprotocol/server"
import { createAdminSupabase } from "@/utils/supabase/serverAdmin"
import { listGrants } from "@/utils/supabase/oauthServer"
import { UserFoodError, logFoodsAsMeal, priceItems, type QuantityInput } from "@/userFoods/userFoods"
import type { UserDatabase } from "./auth"
import { McpInputError, getMeals } from "./meals"

// Meals logged and changed by agents (2026-10-03-mcp-food-search-and-writes-plan.md, phase 4). The agent matches the
// foods itself (search_foods) and gives exact amounts: the server prices them, and Amino's meal agent never runs on
// these meals, so nothing an agent sends is interpreted by a model. Changes are made the way the app makes them
// (20261013000000_agent_meal_writes.sql), on the server for the verified user.

/** How much of a food: a number of its servings, grams, or portions of a recipe. */
export const amountFields = {
  servingId: z.number().int().positive().optional().describe("One of the food's servings (search_foods), with `amount`"),
  amount: z.number().finite().positive().max(1000).optional().describe("How many of that serving"),
  grams: z.number().finite().positive().max(5000).optional(),
  portions: z.number().finite().positive().max(1000).optional().describe("For a recipe: how many portions")
}
const oneAmount = (value: { servingId?: number; amount?: number; grams?: number; portions?: number }) =>
  [value.servingId != null && value.amount != null, value.grams != null, value.portions != null].filter(Boolean).length === 1 &&
  (value.servingId == null) === (value.amount == null)
const AMOUNT_RULE = "Give one amount: servingId with amount, or grams, or portions"
export const mealFood = z.object({ foodId: z.number().int().positive().describe("A food or recipe from search_foods"),
  ...amountFields }).refine(oneAmount, AMOUNT_RULE)

export const quantityFrom = (value: { servingId?: number; amount?: number; grams?: number; portions?: number }): QuantityInput =>
  value.servingId != null ? { servingId: value.servingId, amount: value.amount! }
    : value.grams != null ? { grams: value.grams } : { portions: value.portions! }

const MESSAGES: Record<string, string> = {
  food_unavailable: "A food isn't available to log: use ids from search_foods. An older version of the user's own food " +
    "can't be logged (get_food shows replacedBy).",
  meal_unavailable: "No meal of the user's has that id (or it was deleted). Find meals with list_meals.",
  serving_unavailable: "That serving doesn't belong to the food. Use a servingId from search_foods or get_food.",
  invalid_nutrition: "That amount gives impossible values for this food. Check the amount and its unit.",
  meal_busy: "Amino is still working on this meal, or it can only be changed in the app. Try again in a minute, or ask " +
    "the user to change it in the app.",
  last_food: "That is the meal's only food: delete the meal instead (delete_meal).",
  invalid_time: "eatenAt is more than a year away: check the date.",
  restore_expired: "Deleted meals can be restored for 30 days; this one was deleted longer ago.",
  invalid_amount: "That amount isn't valid for this food.",
  invalid_meal: "Give between 1 and 50 foods."
}

/** A database or Foods-tab failure as something the agent can act on. */
function asInputError(error: unknown): never {
  const code = error instanceof UserFoodError ? error.code
    : error && typeof error === "object" && "message" in error ? String((error as { message: unknown }).message) : ""
  if (MESSAGES[code]) throw new McpInputError(MESSAGES[code])
  throw error
}
const rpc = async (name: string, args: Record<string, unknown>) => {
  const { data, error } = await (createAdminSupabase() as any).rpc(name, args)
  if (error) asInputError(error)
  return data
}
/** Planned meals and meals eaten every day are logged ahead, so a future time is fine; a year out is a typo. */
const YEAR_MS = 366 * 86_400_000
const checkTime = (instant: string) => {
  if (Math.abs(Date.parse(instant) - Date.now()) > YEAR_MS) throw new McpInputError(MESSAGES.invalid_time)
}
/** Postgres timestamp (UTC wall clock, as Message.consumedOn stores it) for an ISO instant. */
const utcWallClock = (instant: string) => new Date(instant).toISOString().replace("T", " ").replace("Z", "")

const agentNames = new Map<string, { name: string | null; at: number }>()
/** The connected agent's name as the user saw it when connecting ("Claude"), for "via Claude" in the app. */
export async function agentName(authInfo: AuthInfo) {
  const hit = agentNames.get(authInfo.clientId)
  if (hit && Date.now() - hit.at < 3_600_000) return hit.name
  const name = await listGrants(authInfo.token).then(grants => grants.find(grant => grant.client.id === authInfo.clientId)
    ?.client.name?.trim().slice(0, 60) || null).catch(() => null)
  if (agentNames.size > 1_000) agentNames.clear()
  agentNames.set(authInfo.clientId, { name, at: Date.now() })
  return name
}

/** Logs a meal of foods the agent picked, priced on the server. The same idempotencyKey returns the meal already logged. */
export async function logMeal(db: UserDatabase, userId: string, agent: { clientId: string; name: string | null },
  input: { foods: z.infer<typeof mealFood>[]; eatenAt?: string; note?: string; idempotencyKey: string }) {
  const eatenAt = input.eatenAt ?? new Date().toISOString()
  checkTime(eatenAt)
  const logged = await logFoodsAsMeal(userId, input.foods.map(food => ({ foodItemId: food.foodId, quantity: quantityFrom(food) })),
    eatenAt, input.idempotencyKey).catch(asInputError)
  if (logged.created) {
    const note = input.note?.trim()
    const { error } = await (createAdminSupabase() as any).from("Message").update({ agentClientId: agent.clientId,
      agentName: agent.name, ...(note ? { content: note.slice(0, 500) } : {}) }).eq("id", logged.messageId).eq("userId", userId)
    if (error) console.error("agent_meal_label_failed", { messageId: logged.messageId, error: error.message })
  }
  const [meal] = await getMeals(db, [logged.messageId])
  return { created: logged.created, ...(logged.created ? {} : { note: "This meal was already logged with that idempotencyKey." }),
    meal, targets: [logged.messageId] }
}

/** A meal's text, as the log shows it. (A text that only lists the meal's foods follows them on its own:
 * 20261014100000_meal_text_lists_foods.sql.) */
async function setMealText(userId: string, mealId: number, text: string) {
  const { data, error } = await (createAdminSupabase() as any).from("Message").update({ content: text.slice(0, 500) })
    .eq("id", mealId).eq("userId", userId).is("deletedAt", null).select("id")
  // A meal Amino is still working on (guard_meal_message_write) can't be changed yet.
  if (error?.code === "55000") throw new McpInputError(`Meal ${mealId} is still being processed. Try again in a minute.`)
  if (error) throw error
  if (!data?.length) throw new McpInputError(`No meal ${mealId}. Use the ids list_meals shows.`)
}

/** Adds foods to one of the user's meals, at the meal's time. */
export async function addToMeal(db: UserDatabase, userId: string, mealId: number, foods: z.infer<typeof mealFood>[]) {
  const priced = await priceItems(userId, foods.map(food => ({ foodItemId: food.foodId, quantity: quantityFrom(food) })))
    .catch(asInputError)
  await rpc("agent_add_meal_foods", { p_user_id: userId, p_message_id: mealId, p_items: priced.map(entry => entry.item) })
  const [meal] = await getMeals(db, [mealId])
  return { meal, targets: [mealId] }
}

type LoggedRow = { id: number; messageId: number | null; foodItemId: number | null }

/** Changes one of the user's meals: its time, foods' amounts, foods taken out, and its text. Each part is saved as it's
 * made. */
export async function updateMeal(db: UserDatabase, userId: string, mealId: number, change: { eatenAt?: string
  foods?: ({ id: number } & Partial<Record<keyof typeof amountFields, number>>)[]; removeFoods?: number[]; text?: string }) {
  const loggedIds = [...(change.foods ?? []).map(food => food.id), ...(change.removeFoods ?? [])]
  const { data, error } = loggedIds.length ? await (createAdminSupabase() as any).from("LoggedFoodItem")
    .select("id,messageId,foodItemId").in("id", loggedIds).eq("userId", userId).is("deletedAt", null) : { data: [], error: null }
  if (error) throw error
  const rows = new Map(((data ?? []) as LoggedRow[]).map(row => [row.id, row]))
  for (const id of loggedIds) if (rows.get(id)?.messageId !== mealId)
    throw new McpInputError(`Food ${id} isn't in meal ${mealId}. Use the item ids get_meals shows for this meal.`)
  if (change.eatenAt) {
    checkTime(change.eatenAt)
    await rpc("agent_move_meal", { p_user_id: userId, p_message_id: mealId, p_consumed_on: utcWallClock(change.eatenAt) })
  }
  for (const food of change.foods ?? []) {
    const row = rows.get(food.id)!
    if (!row.foodItemId) throw new McpInputError(`Food ${food.id} has no catalogue food, so its amount can't be changed.`)
    // The same food at a new amount (an older version of the user's own food is priced as it was).
    const [priced] = await priceItems(userId, [{ foodItemId: row.foodItemId, quantity: quantityFrom(food) }], undefined,
      { archived: true }).catch(asInputError)
    await rpc("agent_set_meal_food", { p_user_id: userId, p_logged_food_item_id: food.id, p_item: priced.item })
  }
  for (const id of change.removeFoods ?? [])
    await rpc("agent_remove_meal_food", { p_user_id: userId, p_logged_food_item_id: id })
  const text = change.text?.trim()
  if (text) await setMealText(userId, mealId, text)
  const [meal] = await getMeals(db, [mealId])
  return { meal, targets: [mealId] }
}

export async function deleteMeal(userId: string, mealId: number) {
  await rpc("agent_delete_meal", { p_user_id: userId, p_message_id: mealId })
  return { deleted: true, mealId, note: "restore_meal brings it back within 30 days.", targets: [mealId] }
}

export async function restoreMeal(db: UserDatabase, userId: string, mealId: number) {
  await rpc("agent_restore_meal", { p_user_id: userId, p_message_id: mealId })
  const [meal] = await getMeals(db, [mealId])
  return { restored: true, meal, targets: [mealId] }
}
