import { z } from "zod"
import { createAdminSupabase } from "@/utils/supabase/serverAdmin"
import { UserFoodError } from "@/userFoods/userFoods"
import { deleteMealLoggedFor, listPeople, mealsLoggedFor } from "@/people/people"
import { createCopyLink, shareFood } from "@/people/sharing"
import { logFoodsFor } from "@/people/logFor"
import { McpInputError, getMeals } from "./meals"
import { mealFood, quantityFrom } from "./mealWrites"
import type { UserDatabase } from "./auth"

// People for agents: who the user is linked with, sharing their foods, and logging meals for people who let the user
// log for them (a trainer's whole roster). Linking, accepting and permissions stay in the app.

const MESSAGES: Record<string, string> = {
  not_linked: "The user isn't linked with that person: list_people shows who they are linked with.",
  not_allowed: "That person hasn't let the user log meals for them (they turn it on in the Amino app).",
  food_not_shareable: "A food in it belongs to someone else, who shared it only with the user, so it can't be passed on. " +
    "The user can save their own copy in the app first.",
  not_shareable: "A recipe has someone else's food in it, so it can't be shared. The user can save their own copy of that food first.",
  food_unavailable: "Only the user's own current foods and recipes can be shared: use ids from list_my_foods.",
  meal_unavailable: "That isn't a meal the user logged for someone who still lets them.",
  meal_has_no_foods: "That meal has no foods to copy.",
  invalid_meal: "Give between 1 and 50 foods.",
  serving_unavailable: "That serving doesn't belong to the food. Use a servingId from search_foods or get_food.",
  invalid_nutrition: "That amount gives impossible values for this food. Check the amount and its unit.",
  rate_limited: "Too many copy links today."
}

function asInputError(error: unknown): never {
  const code = error instanceof UserFoodError ? error.code : ""
  if (MESSAGES[code]) throw new McpInputError(MESSAGES[code] + (error instanceof UserFoodError && error.detail ? ` (${error.detail})` : ""))
  throw error
}

type Person = { id: string; name: string | null; kind: string; mine: { canLogForMe: boolean; shareAllFoods: boolean };
  theirs: { canLogForMe: boolean; shareAllFoods: boolean } }

export async function peopleForAgent(userId: string) {
  const people = await listPeople(userId).catch(asInputError) as { linked: Person[] }
  return { people: people.linked.map(person => ({ id: person.id, name: person.name, kind: person.kind,
    youCanLogForThem: person.theirs.canLogForMe, theyCanLogForYou: person.mine.canLogForMe,
    theySeeAllYourFoods: person.mine.shareAllFoods, youSeeAllTheirFoods: person.theirs.shareAllFoods })) }
}

export async function shareFoodsForAgent(userId: string, agentClientId: string, input: { foodIds: number[]; personIds: string[]; share: boolean }) {
  const result = await shareFood(userId, input.foodIds, input.personIds, input.share, { via: "mcp", agentClientId }).catch(asInputError)
  return { changed: result.changed, refused: result.refused.map(row => ({ personId: row.recipientId, lineageId: row.lineageId ?? null,
    reason: row.reason === "not_shareable" ? `has someone else's food in it (${row.foods})` : row.reason === "not_linked"
      ? "not linked with the user" : row.reason === "not_yours" ? "not the user's own current food" : row.reason })) }
}

export async function copyLinkForAgent(userId: string, foodId: number) {
  return createCopyLink(userId, foodId).catch(asInputError)
}

export const logForFields = {
  forPersonIds: z.array(z.uuid()).min(1).max(20).optional()
    .describe("Who it's for: person ids from list_people (include the user's own id to log it for them too). Default: the user."),
  localTime: z.string().regex(/^\d{4}-\d\d-\d\dT\d\d:\d\d$/).optional()
    .describe("A day and time (\"2026-10-14T12:30\") meant in each person's own timezone, for meal plans. Overrides eatenAt."),
  allowDuplicate: z.boolean().default(false)
    .describe("Log even when someone already has a similar meal within 90 minutes (only after checking with the user)")
}

/** One meal for several people (or a batch entry). */
export async function logForPeople(db: UserDatabase, userId: string, agent: { clientId: string; name: string | null },
  input: { foods: z.infer<typeof mealFood>[]; eatenAt?: string; localTime?: string; forPersonIds?: string[]; allowDuplicate: boolean;
    idempotencyKey: string; note?: string }) {
  const result = await logFoodsFor(userId, { items: input.foods.map(food => ({ foodItemId: food.foodId, quantity: quantityFrom(food) })),
    consumedOn: input.eatenAt ?? new Date().toISOString(), wallClock: input.localTime, localId: input.idempotencyKey,
    forUserIds: input.forPersonIds, allowDuplicate: input.allowDuplicate }, { agentClientId: agent.clientId, agentName: agent.name })
    .catch(asInputError)
  if (result.status === "possible_duplicate") return { logged: false, possibleDuplicates: (result.duplicates ?? []).map(duplicate => ({
    personId: duplicate.userId, name: duplicate.name, mealId: duplicate.meal.messageId, eatenAt: duplicate.meal.consumedOn,
    text: duplicate.meal.content })), note: "Someone already has a similar meal near that time. Ask the user, then retry with allowDuplicate." }
  const meals = result.meals ?? []
  const note = input.note?.trim()
  if (note) await (createAdminSupabase() as any).from("Message").update({ content: note.slice(0, 500) })
    .in("id", meals.filter(meal => meal.created).map(meal => meal.messageId))
  const own = meals.find(meal => meal.userId === userId)
  return { logged: true, meals: meals.map(meal => ({ personId: meal.userId, mealId: meal.messageId, created: meal.created })),
    ...(own ? { meal: (await getMeals(db, [own.messageId]))[0] } : {}), targets: meals.map(meal => meal.messageId) }
}

export async function mealsLoggedForAgent(userId: string, personId: string, page: { before?: string; beforeId?: number } = {}) {
  return mealsLoggedFor(userId, personId, { ...page, limit: 100 }).catch(asInputError)
}

export async function deleteMealForAgent(userId: string, mealId: number) {
  return deleteMealLoggedFor(userId, mealId).catch(asInputError)
}
