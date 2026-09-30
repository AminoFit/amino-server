import type { AuthInfo, CallToolResult, McpServer } from "@modelcontextprotocol/server"
import { z } from "zod"
import { createAdminSupabase } from "@/utils/supabase/serverAdmin"
import { userDatabase, type UserDatabase } from "./auth"
import { McpInputError, daysBetween, dailySummary, getMeals, listMeals, mealChanges } from "./meals"
import { ACTIVITY_LEVELS, SEXES, getProfile, updateBody, updateGoals } from "./profile"

export const MCP_INSTRUCTIONS = `Amino is a food-logging app. These tools read the user's logged meals (each food with its \
nutrition), daily totals, goals and body stats, and can update the goals and body stats.
- Dates are the user's local calendar days in their profile timezone (get_profile). eatenAt is UTC.
- Nutrient names carry their unit: kcal, proteinG (grams), sodiumMg (milligrams), vitaminDMcg (micrograms), waterMl.
- For questions about intake over time, start with get_daily_summary; use list_meals for what was eaten.
- To import every meal or keep a copy up to date, use sync_meals and store the cursor it returns.
- Body stats are metric: convert pounds, feet and inches before calling update_body_stats.`

const RATE_LIMIT_PER_MINUTE = 120
const date = z.iso.date().describe("Local date, YYYY-MM-DD")
const limit = z.number().int().min(1).max(100).default(50).describe("Meals per page (1-100)")
const allNutrients = z.boolean().default(false)
  .describe("Every nutrient (about 40, vitamins and minerals included) instead of energy, macros, fibre, sugar and sodium")
const READ = { readOnlyHint: true, openWorldHint: false } as const
const WRITE = { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false } as const

type Call = { db: UserDatabase; userId: string }
type Outcome = { data: object; rows?: number }

const result = (data: object): CallToolResult =>
  ({ content: [{ type: "text", text: JSON.stringify(data) }], structuredContent: data as Record<string, unknown> })
const failure = (text: string): CallToolResult => ({ isError: true, content: [{ type: "text", text }] })

/** Every tool call: the per-user rate limit, the call itself as the user, and one McpRequest row. */
async function run(tool: string, authInfo: AuthInfo | undefined, work: (call: Call) => Promise<Outcome>) {
  const userId = (authInfo?.extra as { userId?: string } | undefined)?.userId
  if (!authInfo || !userId) return failure("Not signed in to Amino.")
  const admin = createAdminSupabase() as any
  const startedAt = Date.now()
  const record = (ok: boolean, errorCode: string | null, rows: number | null) =>
    admin.from("McpRequest").insert({ userId, clientId: authInfo.clientId, tool, ok, errorCode, rows,
      durationMs: Date.now() - startedAt }).then(({ error }: { error?: { message: string } | null }) => {
      if (error) console.warn("mcp_request_not_recorded", { error: error.message })
    })
  const recent = await admin.from("McpRequest").select("id", { count: "exact", head: true }).eq("userId", userId)
    .gte("createdAt", new Date(startedAt - 60_000).toISOString())
  if ((recent.count ?? 0) >= RATE_LIMIT_PER_MINUTE) {
    await record(false, "rate_limited", null)
    return failure(`Too many requests: at most ${RATE_LIMIT_PER_MINUTE} a minute. Wait a minute and try again.`)
  }
  try {
    const outcome = await work({ db: userDatabase(authInfo.token), userId })
    await record(true, null, outcome.rows ?? null)
    return result(outcome.data)
  } catch (error) {
    if (error instanceof McpInputError) {
      await record(false, "invalid_input", null)
      return failure(error.message)
    }
    console.error("mcp_tool_failed", { tool, error })
    await record(false, "failed", null)
    return failure("Amino couldn't complete that request. Try again shortly.")
  }
}

function checkRange(from: string, to: string, maxDays: number) {
  if (to < from) throw new McpInputError("`to` is before `from`.")
  if (daysBetween(from, to) > maxDays) throw new McpInputError(`Ask for at most ${maxDays} days at a time.`)
}

export function registerAminoTools(server: McpServer) {
  server.registerTool("get_profile", {
    title: "Get profile",
    description: "The user's timezone, display units, daily calorie and macro goals, and body stats (weight, height, " +
      "date of birth and age, sex, activity level).",
    inputSchema: z.object({}),
    annotations: READ
  }, (_args, ctx) => run("get_profile", ctx.http?.authInfo, async ({ db, userId }) =>
    ({ data: await getProfile(db, userId) })))

  server.registerTool("list_meals", {
    title: "List meals",
    description: "Meals eaten on the local days from..to (inclusive), oldest first, each with its foods (amount, " +
      "grams, nutrition) and totals. When hasMore is true, call again with nextCursor for the next page.",
    inputSchema: z.object({ from: date, to: date.optional().describe("Local date, YYYY-MM-DD (defaults to from)"),
      cursor: z.string().max(200).optional(), limit, allNutrients }),
    annotations: READ
  }, ({ from, to, cursor, limit, allNutrients }, ctx) => run("list_meals", ctx.http?.authInfo, async ({ db }) => {
    checkRange(from, to ?? from, 3660)
    const page = await listMeals(db, { from, to: to ?? from, cursor, limit, allNutrients })
    return { data: page, rows: page.meals.length }
  }))

  server.registerTool("get_meals", {
    title: "Get meals",
    description: "Specific meals by id, with every nutrient for each food.",
    inputSchema: z.object({ ids: z.array(z.number().int().positive()).min(1).max(50) }),
    annotations: READ
  }, ({ ids }, ctx) => run("get_meals", ctx.http?.authInfo, async ({ db }) => {
    const meals = await getMeals(db, ids)
    return { data: { meals }, rows: meals.length }
  }))

  server.registerTool("get_daily_summary", {
    title: "Get daily summary",
    description: "Totals per local day (kcal, protein, carbs, fat, saturated fat, fibre, sugar, sodium, alcohol, " +
      "caffeine, water) and the user's goals, for up to 366 days. Days with nothing logged are left out.",
    inputSchema: z.object({ from: date, to: date }),
    annotations: READ
  }, ({ from, to }, ctx) => run("get_daily_summary", ctx.http?.authInfo, async ({ db, userId }) => {
    checkRange(from, to, 366)
    const [summary, profile] = await Promise.all([dailySummary(db, from, to), getProfile(db, userId)])
    return { data: { ...summary, goals: profile.goals }, rows: summary.days.length }
  }))

  server.registerTool("sync_meals", {
    title: "Sync meals",
    description: "All of the user's meals as a change feed, for importing them or keeping a copy up to date. Call " +
      "without a cursor to start from the beginning, keep calling with nextCursor while hasMore is true, and store " +
      "nextCursor: a later call with it returns only meals added, changed or deleted since. A deleted meal comes back " +
      "as {id, deleted: true}; a changed meal comes back whole, so replace your copy by id. Meals still being " +
      "processed have status \"processing\" and come back again once they finish. Changes from the last 15 seconds " +
      "arrive on the next call.",
    inputSchema: z.object({ cursor: z.string().max(200).optional(), limit, allNutrients }),
    annotations: READ
  }, ({ cursor, limit, allNutrients }, ctx) => run("sync_meals", ctx.http?.authInfo, async ({ db }) => {
    const page = await mealChanges(db, { cursor, limit, allNutrients })
    return { data: page, rows: page.changes.length }
  }))

  server.registerTool("update_goals", {
    title: "Update goals",
    description: "Set the user's daily calorie and/or macro goals. Macros you set are kept exactly (they are marked " +
      "as set by hand, so the app won't recalculate them). If you change only calories and the user's macros follow " +
      "their calories, the macros are rescaled to keep the same split. Returns the updated profile.",
    inputSchema: z.object({
      calories: z.number().int().min(800).max(8000).optional().describe("kcal per day"),
      proteinG: z.number().min(0).max(600).optional().describe("grams of protein per day"),
      carbsG: z.number().min(0).max(1500).optional().describe("grams of carbohydrate per day"),
      fatG: z.number().min(0).max(500).optional().describe("grams of fat per day")
    }).refine(value => Object.values(value).some(v => v != null), "Set at least one goal"),
    annotations: WRITE
  }, (change, ctx) => run("update_goals", ctx.http?.authInfo, async ({ db, userId }) =>
    ({ data: await updateGoals(db, userId, change), rows: 1 })))

  server.registerTool("update_body_stats", {
    title: "Update body stats",
    description: "Update the user's body stats, in metric units. Only the fields you pass change. Returns the " +
      "updated profile.",
    inputSchema: z.object({
      weightKg: z.number().min(25).max(350).optional(),
      heightCm: z.number().min(90).max(250).optional(),
      dateOfBirth: z.iso.date().optional().describe("YYYY-MM-DD"),
      sex: z.enum(SEXES).optional(),
      activityLevel: z.enum(ACTIVITY_LEVELS).optional()
        .describe("None, Light Exercise (1-3 days a week), Moderate Exercise (3-5), Very Active (6-7), Extremely Active")
    }).refine(value => Object.values(value).some(v => v != null), "Set at least one body stat"),
    annotations: WRITE
  }, (change, ctx) => run("update_body_stats", ctx.http?.authInfo, async ({ db, userId }) => {
    if (change.dateOfBirth) {
      const age = (Date.now() - Date.parse(`${change.dateOfBirth}T00:00:00Z`)) / (365.25 * 86_400_000)
      if (age < 10 || age > 120) throw new McpInputError("dateOfBirth must give an age between 10 and 120.")
    }
    return { data: await updateBody(db, userId, change), rows: 1 }
  }))
}
