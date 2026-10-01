import type { UserDatabase } from "./auth"

// Meals, daily totals and the change feed, from the mcp_* database functions (see 20261002000000_mcp_access.sql).
// Those run as the user, so row-level security limits them to the user's own meals.

export type Meal = Record<string, unknown> & { id: number }
type PageRow = { position: string; id: number; meal: Meal }

export class McpInputError extends Error {}

/** Cursors are opaque to clients: the (timestamp, id) position of the last row returned, exactly as the database
 * printed it, so no precision is lost. The kind stops a list_meals cursor being passed to sync_meals. */
export function encodeCursor(kind: "meals" | "sync", position: string, id: number) {
  return Buffer.from(JSON.stringify([kind, position, id])).toString("base64url")
}

const TIMESTAMP = /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}(\.\d{1,6})?([+-]\d{2}(:?\d{2})?|Z)?$/

export function decodeCursor(kind: "meals" | "sync", cursor: string | undefined) {
  if (!cursor) return null
  try {
    const [cursorKind, position, id] = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8"))
    if (cursorKind === kind && typeof position === "string" && TIMESTAMP.test(position) && Number.isSafeInteger(id))
      return { position, id: id as number }
  } catch {}
  throw new McpInputError("That cursor isn't valid. Start again without a cursor.")
}

/** The database returns one row more than the page; that extra row only says another page follows. */
export function pageOf(kind: "meals" | "sync", rows: PageRow[], limit: number) {
  const page = rows.slice(0, limit)
  const last = page[page.length - 1]
  return { meals: page.map(row => row.meal), hasMore: rows.length > limit,
    nextCursor: last ? encodeCursor(kind, last.position, last.id) : undefined }
}

async function rpc<T>(db: UserDatabase, name: string, args: Record<string, unknown>) {
  const { data, error } = await (db as any).rpc(name, args)
  if (error) throw error
  return data as T
}

export async function listMeals(db: UserDatabase, input: { from: string; to: string; cursor?: string; limit: number
  allNutrients: boolean }) {
  const after = decodeCursor("meals", input.cursor)
  const rows = await rpc<{ eaten: string; id: number; meal: Meal }[]>(db, "mcp_list_meals", {
    p_from: input.from, p_to: input.to, p_after_eaten: after?.position ?? null, p_after_id: after?.id ?? null,
    p_limit: input.limit, p_all: input.allNutrients })
  return pageOf("meals", rows.map(row => ({ position: row.eaten, id: row.id, meal: row.meal })), input.limit)
}

export async function getMeals(db: UserDatabase, ids: number[]) {
  return rpc<Meal[]>(db, "mcp_get_meals", { p_ids: ids })
}

export async function dailySummary(db: UserDatabase, from: string, to: string, allNutrients = false) {
  return rpc<{ timezone: string; days: Record<string, unknown>[] }>(db, "mcp_daily_summary", { p_from: from, p_to: to, p_all: allNutrients })
}

export async function mealChanges(db: UserDatabase, input: { cursor?: string; limit: number; allNutrients: boolean }) {
  const after = decodeCursor("sync", input.cursor)
  const rows = await rpc<{ changedAt: string; id: number; meal: Meal }[]>(db, "mcp_meal_changes", {
    p_after_at: after?.position ?? null, p_after_id: after?.id ?? null, p_limit: input.limit, p_all: input.allNutrients })
  const page = pageOf("sync", rows.map(row => ({ position: row.changedAt, id: row.id, meal: row.meal })), input.limit)
  // With nothing new, the client keeps its cursor.
  return { changes: page.meals, hasMore: page.hasMore, nextCursor: page.nextCursor ?? input.cursor ?? null }
}

/** Whole local days between two dates, inclusive. */
export function daysBetween(from: string, to: string) {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000) + 1
}
