import type { AuthInfo, CallToolResult, McpServer } from "@modelcontextprotocol/server"
import { z } from "zod"
import { createAdminSupabase } from "@/utils/supabase/serverAdmin"
import { userDatabase, type UserDatabase } from "./auth"
import { McpInputError, daysBetween, dailySummary, getMeals, listMeals, mealChanges } from "./meals"
import { ACTIVITY_LEVELS, SEXES, getProfile, goalHistory, updateBody, updateGoals, withDayGoals } from "./profile"
import { getMyFood, listMyFoods } from "./userFoods"
import { weightHistory } from "./weight"

export const MCP_INSTRUCTIONS = `Amino is a food-logging app. These tools read the user's logged meals (each food with its \
nutrition), daily totals, goals and body stats, and can update the goals and body stats.
- Dates are the user's local calendar days in their profile timezone (get_profile). eatenAt is UTC.
- Nutrient names carry their unit: kcal, proteinG (grams), sodiumMg (milligrams), vitaminDMcg (micrograms), waterMl.
- For questions about intake over time, start with get_daily_summary; use list_meals for what was eaten.
- Foods record only the nutrients their source gives (a label often lists a few vitamins). A day's total marked
  \`incomplete\` sums only the foods that record it: say it is partial rather than judging intake from it.
- To import every meal or keep a copy up to date, use sync_meals and store the cursor it returns.
- Body stats are metric: convert pounds, feet and inches before calling update_body_stats. A weight set there is a
  weigh-in (now) in the user's weight history, which get_weight_history returns with its trend.
- The user's own recipes and foods (list_my_foods, get_my_food) are what they saved in the app. A recipe's values are
  for one portion; a meal shows it as one food with an amount in portions.`

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
      "date of birth and age, sex, activity level). goalHistory lists the goals from each date they changed (local " +
      "dates, oldest first); the first entry is where history starts.",
    inputSchema: z.object({}),
    annotations: READ
  }, (_args, ctx) => run("get_profile", ctx.http?.authInfo, async ({ db, userId }) => {
    const [profile, history] = await Promise.all([getProfile(db, userId), goalHistory(db, userId)])
    return { data: { ...profile, goalHistory: history } }
  }))

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
      "caffeine, water) and the user's goals, for up to 366 days. Days with nothing logged are left out. With " +
      "allNutrients, each day also has `nutrients`: its vitamins and minerals (and other fats, cholesterol, omega-3/6), " +
      "each summed over the foods that record it. `foods` is how many foods the day has; `incomplete` lists every total " +
      "shown that only some of them record (\"zincMg\": \"8 of 20 foods\"): that total is a lower bound, not the day's " +
      "intake, so don't read it as low intake. A nutrient no food records is absent (unknown), never 0. " +
      "Each day has the `goals` it had (goals change over time); top-level " +
      "`goals` are today's, and `goalChanges` lists changes inside the range.",
    inputSchema: z.object({ from: date, to: date, allNutrients }),
    annotations: READ
  }, ({ from, to, allNutrients }, ctx) => run("get_daily_summary", ctx.http?.authInfo, async ({ db, userId }) => {
    checkRange(from, to, 366)
    const [summary, profile, history] = await Promise.all([dailySummary(db, from, to, allNutrients), getProfile(db, userId),
      goalHistory(db, userId)])
    const { macrosSetByHand: _, ...current } = profile.goals
    return { data: { ...summary, ...withDayGoals(summary.days, history, current, from, to), goals: profile.goals },
      rows: summary.days.length }
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

  server.registerTool("list_my_foods", {
    title: "List my recipes and foods",
    description: "The user's own recipes and custom foods (saved in the app), most recently edited first: name, kind " +
      "(recipe or food), what the values are for (one portion of a recipe, else the food's serving), energy, macros, " +
      "fibre, sugar and sodium, servings, and when each was created and last edited.",
    inputSchema: z.object({ kind: z.enum(["recipes", "foods", "all"]).default("all"),
      query: z.string().max(100).optional().describe("Only names containing this text") }),
    annotations: READ
  }, ({ kind, query }, ctx) => run("list_my_foods", ctx.http?.authInfo, async ({ db, userId }) => {
    const foods = await listMyFoods(db, userId, { kind, query })
    return { data: { foods }, rows: foods.length }
  }))

  server.registerTool("get_my_food", {
    title: "Get one of my recipes or foods",
    description: "One of the user's own recipes or foods by id, with every nutrient. A recipe also lists its foods " +
      "and their amounts for the whole recipe (all its portions).",
    inputSchema: z.object({ id: z.number().int().positive() }),
    annotations: READ
  }, ({ id }, ctx) => run("get_my_food", ctx.http?.authInfo, async ({ db, userId }) =>
    ({ data: await getMyFood(db, userId, id), rows: 1 })))

  server.registerTool("get_weight_history", {
    title: "Get weight history",
    description: "The user's weigh-ins per local day (from Apple Health, the app and agents), for up to 2 years: " +
      "`weightKg` is the day's average, `bodyFatPct` appears only when a scale measured it, and `trendKg` is a smoothed " +
      "trend (an exponential moving average, about a 19-day window) that hides day-to-day water swings. The trend lags a " +
      "changing weight by about 9 days, so for a rate of change (kg per week, energy balance) fit a line through the " +
      "weigh-ins rather than subtracting trend values. `summary` has the latest weigh-in, today's trend and the trend's " +
      "change over 7 and 30 days. Days without a weigh-in are left out.",
    inputSchema: z.object({ from: date, to: date }),
    annotations: READ
  }, ({ from, to }, ctx) => run("get_weight_history", ctx.http?.authInfo, async ({ db }) => {
    checkRange(from, to, 731)
    const history = await weightHistory(db, from, to)
    return { data: history, rows: history.days.length }
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
