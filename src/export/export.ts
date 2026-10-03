// The user's data as CSV: every logged food, and the daily totals. Read through the same database functions as MCP
// (mcp_list_meals, mcp_daily_summary), as the user, so it is exactly what an agent sees and row-level security keeps
// it to their own meals. Nutrient columns are the MCP names, which carry their unit (proteinG, sodiumMg, vitaminDMcg).
import { HISTORY_NUTRIENTS } from "@/nutrition"
import { dailySummary, listMeals, type Meal } from "@/mcp/meals"
import type { UserDatabase } from "@/mcp/auth"

export type ExportKind = "foods" | "days"
/** Before any meal anyone logged in Amino. */
const FIRST_DAY = "2020-01-01"

/** A CSV field: quoted when it holds a comma, quote or line break; a leading = + - @ is prefixed so a spreadsheet
 * never runs a meal's text as a formula. */
export function csvField(value: unknown): string {
  if (value == null) return ""
  let text = String(value)
  if (typeof value === "string" && /^[=+\-@\t\r]/.test(text)) text = `'${text}`
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}
export const csvLine = (fields: unknown[]) => fields.map(csvField).join(",")

/** Local dates from `from` to `to` in chunks of at most 366 days (mcp_daily_summary's range). */
export function yearChunks(from: string, to: string) {
  const chunks: [string, string][] = []
  for (let start = new Date(`${from}T00:00:00Z`); start <= new Date(`${to}T00:00:00Z`);) {
    const end = new Date(Math.min(start.getTime() + 365 * 86_400_000, Date.parse(`${to}T00:00:00Z`)))
    chunks.push([start.toISOString().slice(0, 10), end.toISOString().slice(0, 10)])
    start = new Date(end.getTime() + 86_400_000)
  }
  return chunks
}

/** Every meal from `from` to `to`, oldest first, a page at a time. */
async function* meals(db: UserDatabase, from: string, to: string) {
  let cursor: string | undefined
  do {
    const page = await listMeals(db, { from, to, cursor, limit: 100, allNutrients: true })
    yield* page.meals
    cursor = page.hasMore ? page.nextCursor : undefined
  } while (cursor)
}

const FOOD_COLUMNS = ["date", "time", "mealId", "mealText", "input", "food", "brand", "amount", "unit", "grams"] as const

/** One row per logged food. A nutrient its food doesn't record is empty, never 0. */
export async function foodsCsv(db: UserDatabase, to: string) {
  const lines = [csvLine([...FOOD_COLUMNS, ...HISTORY_NUTRIENTS])]
  for await (const meal of meals(db, FIRST_DAY, to)) {
    const m = meal as Meal & { localDate?: string; localTime?: string; text?: string; input?: string
      items?: Record<string, unknown>[] }
    for (const item of m.items ?? []) lines.push(csvLine([m.localDate, m.localTime, m.id, m.text, m.input, item.food,
      item.brand, item.amount, item.unit, item.grams, ...HISTORY_NUTRIENTS.map(key => item[key])]))
  }
  return lines.join("\r\n") + "\r\n"
}

/** One row per day with food logged. A total sums the foods that record the nutrient; `incomplete` names the totals
 * only some of the day's foods record ("zincMg 8 of 20 foods"), which are lower bounds, not intake. */
export async function daysCsv(db: UserDatabase, to: string) {
  const lines = [csvLine(["date", "meals", "foods", ...HISTORY_NUTRIENTS, "incomplete"])]
  for (const [from, until] of yearChunks(FIRST_DAY, to)) {
    const { days } = await dailySummary(db, from, until, true)
    for (const day of days as (Record<string, unknown> & { nutrients?: Record<string, unknown>; incomplete?: Record<string, string> })[]) {
      const values = { ...day, ...(day.nutrients ?? {}) }
      const incomplete = Object.entries(day.incomplete ?? {}).map(([key, coverage]) => `${key} ${coverage}`).join("; ")
      lines.push(csvLine([day.date, day.meals, day.foods, ...HISTORY_NUTRIENTS.map(key => values[key]), incomplete]))
    }
  }
  return lines.join("\r\n") + "\r\n"
}

/** The export's file name: amino-foods-2026-10-02.csv. */
export const exportFileName = (kind: ExportKind, today: string) => `amino-${kind}-${today}.csv`
