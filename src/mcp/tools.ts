import type { AuthInfo, CallToolResult, McpServer } from "@modelcontextprotocol/server"
import { z } from "zod"
import { createAdminSupabase } from "@/utils/supabase/serverAdmin"
import { userDatabase, type UserDatabase } from "./auth"
import { McpInputError, daysBetween, dailySummary, getMeals, listMeals, mealChanges } from "./meals"
import { ACTIVITY_LEVELS, SEXES, getProfile, goalHistory, updateBody, updateGoals, withDayGoals } from "./profile"
import { getFood, listMyFoods, recentFoods, searchFoods } from "./foods"
import { expenditureEstimate, weightHistory } from "./weight"
import { createFood, createRecipe, deleteFood, foodFields, recipeFields, restoreFood, updateFood, updateRecipe } from "./foodWrites"
import { agentWriteRefusal } from "./settings"
import { addCatalogueFood, pointerFrom } from "./catalogueAdds"
import { addToMeal, agentName, amountFields, deleteMeal, logMeal, mealFood, restoreMeal, updateMeal } from "./mealWrites"
import { copyLinkForAgent, deleteMealForAgent, logForFields, logForPeople, mealsLoggedForAgent, peopleForAgent,
  shareFoodsForAgent } from "./people"

export const MCP_INSTRUCTIONS = `Amino is a food-logging app. These tools read the user's logged meals (each food with its \
nutrition), daily totals, goals and body stats, and can update the goals and body stats.
- Dates are the user's local calendar days in their profile timezone (get_profile). eatenAt is UTC.
- Nutrient names carry their unit: kcal, proteinG (grams), sodiumMg (milligrams), vitaminDMcg (micrograms), waterMl.
- For questions about intake over time, start with get_daily_summary; use list_meals for what was eaten.
- Foods record only the nutrients their source gives (a label often lists a few vitamins). A day's total marked
  \`incomplete\` sums only the foods that record it: say it is partial rather than judging intake from it. A recipe
  whose ingredients don't all record a nutrient marks it \`partial\` ("7 of 10 ingredients"): its value is a lower
  bound, and days and meals with that recipe list the nutrient as incomplete.
- To import every meal or keep a copy up to date, use sync_meals and store the cursor it returns.
- Goals include an optional goal weight (update_goals goalWeightKg); get_weight_history compares the trend with it.
- Body stats are metric: convert pounds, feet and inches before calling update_body_stats. A weight set there is a
  weigh-in (now) in the user's weight history, which get_weight_history returns with its trend.
- For how much the user burns a day (TDEE, maintenance calories), use get_expenditure_estimate: it comes from their own
  weigh-ins and logged intake, with its uncertainty, or says what data is still missing.
- To find a food, use search_foods (any language; a barcode works too): it searches the catalogue and the user's own
  foods and recipes the way the app does, the user's own first. Each food lists its servings (by servingId) with grams
  per unit, nutrition per 100 g and per serving, and how often the user logged it with their usual amount. For "my
  usual …" or "what I eat most", use recent_foods. Foods marked \`estimate\` have estimated values.
- Food names in the catalogue are mostly English: search in English (translate the user's words), one food per search.
  Each result's \`match\` says why it was found: \`name\` (its name has the query's words), \`meaning\` (a close
  meaning), or \`loose\` (a fuzzy text hit that is often a different food): never log a loose match without checking it
  is the same food.
- A \`meaning\` match is a similar food, not the same product: for a branded or restaurant item ("NAYA toum", "Chipotle
  bowl") log it only if its name and brand are that item. Otherwise use the restaurant's or maker's published values with
  create_food (the user's own copy), or tell the user Amino has no record of it; never stand a lookalike in for it.
- When Amino doesn't have a food, add it from a database before creating the user's own: search_foods with scope "usda"
  finds USDA records (by usdaId), and add_catalogue_food adds one, or a product by its barcode (from USDA or Open Food
  Facts), or a USDA or Open Food Facts page, to Amino's shared catalogue. Barcode digits must come from the package or the
  user, never a guess; check the name and brand it returns are the product the user means. create_food is the last
  resort, for foods no database has (homemade food, a label the user reads out).
- To log a meal: find each food with search_foods (prefer the user's own foods, and recent_foods for usual meals) and
  log_meal with exact amounts. Amino doesn't interpret text: a note is only shown to the user. Meals and their foods
  have ids in list_meals/get_meals; meals you log show \`loggedBy\`.
- Changes (log_meal, add_to_meal, update_meal, delete_meal, restore_meal, create_food, create_recipe, update_food,
  update_recipe, delete_food, restore_food) need the user's "Let agents make changes" setting in the Amino app; without it they fail
  and say so. Confirm with the user before deleting anything. Foods and recipes an agent creates are private to
  the user: check search_foods(scope: "mine") first, and only change or delete what the user asked about.
- The user's own recipes and foods (list_my_foods) are what they saved in the app. A recipe's values are for one
  portion; a meal shows it as one food with an amount in portions. get_food reads any food by id with every nutrient.
- People: list_people shows who the user is linked with (partners, friends, trainers, clients) and what each may do.
  Foods someone shared with the user show \`source: "shared"\` and \`sharedBy\` (their person id). share_foods shares
  the user's own foods and recipes with linked people (they follow the user's edits); create_copy_link makes a link
  anyone can use to add their own copy. log_meal (forPersonIds) and log_meals log for people who let the user log for
  them, each in their own diary, labelled as logged by the user via you; any of the user's own foods used are shared
  with them. Use localTime for meal plans so "12:30" is each person's lunchtime. A possibleDuplicates answer means
  someone already has a similar meal: ask the user before retrying with allowDuplicate. Linking people and permissions
  happen only in the app.`

const RATE_LIMIT_PER_MINUTE = 120
const date = z.iso.date().describe("Local date, YYYY-MM-DD")
const limit = z.number().int().min(1).max(100).default(50).describe("Meals per page (1-100)")
const allNutrients = z.boolean().default(false)
  .describe("Every nutrient (about 40, vitamins and minerals included) instead of energy, macros, fibre, sugar and sodium")
const READ = { readOnlyHint: true, openWorldHint: false } as const
const WRITE = { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false } as const
const CREATE = { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false } as const
const DELETE = { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false } as const
/** Changes to the user's foods and meals: only with the user's "Let agents make changes" on, and at a slower rate. */
const CHANGE_TOOLS = ["create_food", "create_recipe", "update_food", "update_recipe", "delete_food", "restore_food", "log_meal",
  "add_to_meal", "update_meal", "delete_meal", "restore_meal", "share_foods", "create_copy_link", "log_meals",
  "delete_meal_for_person"]
/** Meal plans for several people: entries a day across every log_meals call. */
const PLANNED_ENTRIES_PER_DAY = 2000
const CHANGES_PER_MINUTE = 20, CHANGES_PER_DAY = 300

type Call = { db: UserDatabase; userId: string; authInfo: AuthInfo }
type Outcome = { data: object; rows?: number; targets?: number[] }

const result = (data: object): CallToolResult =>
  ({ content: [{ type: "text", text: JSON.stringify(data) }], structuredContent: data as Record<string, unknown> })
const failure = (text: string): CallToolResult => ({ isError: true, content: [{ type: "text", text }] })

/** Every tool call: the per-user rate limit, the call itself as the user, and one McpRequest row. A change also needs the
 * user's setting (read on every call) and stays under its own limits. */
async function run(tool: string, authInfo: AuthInfo | undefined, work: (call: Call) => Promise<Outcome>) {
  const userId = (authInfo?.extra as { userId?: string } | undefined)?.userId
  if (!authInfo || !userId) return failure("Not signed in to Amino.")
  const admin = createAdminSupabase() as any
  const startedAt = Date.now()
  const record = (ok: boolean, errorCode: string | null, rows: number | null, targets?: number[]) =>
    admin.from("McpRequest").insert({ userId, clientId: authInfo.clientId, tool, ok, errorCode, rows,
      durationMs: Date.now() - startedAt, ...(targets?.length ? { targetIds: targets } : {}) })
      .then(({ error }: { error?: { message: string } | null }) => {
      if (error) console.warn("mcp_request_not_recorded", { error: error.message })
    })
  const recent = await admin.from("McpRequest").select("id", { count: "exact", head: true }).eq("userId", userId)
    .gte("createdAt", new Date(startedAt - 60_000).toISOString())
  if ((recent.count ?? 0) >= RATE_LIMIT_PER_MINUTE) {
    await record(false, "rate_limited", null)
    return failure(`Too many requests: at most ${RATE_LIMIT_PER_MINUTE} a minute. Wait a minute and try again.`)
  }
  if (CHANGE_TOOLS.includes(tool)) {
    const refusal = await agentWriteRefusal(userId)
    if (refusal) {
      await record(false, "changes_off", null)
      return failure(refusal)
    }
    const changes = (since: number) => admin.from("McpRequest").select("id", { count: "exact", head: true }).eq("userId", userId)
      .eq("ok", true).in("tool", CHANGE_TOOLS).gte("createdAt", new Date(startedAt - since).toISOString())
    const [minute, day] = await Promise.all([changes(60_000), changes(86_400_000)])
    if ((minute.count ?? 0) >= CHANGES_PER_MINUTE || (day.count ?? 0) >= CHANGES_PER_DAY) {
      await record(false, "rate_limited", null)
      return failure(`Too many changes: at most ${CHANGES_PER_MINUTE} a minute and ${CHANGES_PER_DAY} a day.`)
    }
  }
  try {
    const outcome = await work({ db: userDatabase(authInfo.token), userId, authInfo })
    await record(true, null, outcome.rows ?? null, outcome.targets)
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
    description: "The user's timezone, display units, daily calorie and macro goals and goal weight, and body stats (weight, height, " +
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

  server.registerTool("search_foods", {
    title: "Search foods",
    description: "Search Amino's food catalogue and the user's own foods and recipes, the way the app's search does: " +
      "typos tolerated (catalogue names are mostly English), the user's own first, then the closest catalogue matches. Or " +
      "look up a `barcode` " +
      "(EAN/UPC digits) in the catalogue. Each food has its servings (servingId, unit, gramsPerUnit), nutrition `per100g` " +
      "and `perServing` (kcal, protein, carbs, fat, saturated fat, fibre, sugar, sodium; a nutrient the food doesn't " +
      "record is left out), `source` (catalogue, custom = the user's own food, recipe = the user's own recipe), `match` " +
      "(name, meaning, or loose: often a different food), and, when " +
      "the user has logged it, `timesLogged`, `lastLoggedOn` and their `usual` amount. `filters` narrow the results by " +
      "values per 100 g. When no food has every word of the query in its name or brand, the result says so " +
      "(`exactMatch: false`). Pass nextCursor back as `cursor` for more.",
    inputSchema: z.object({
      query: z.string().trim().min(1).max(100).optional().describe("Food name, brand or description (in English for the catalogue)"),
      barcode: z.string().trim().min(6).max(20).optional().describe("A product barcode's digits, instead of a query"),
      scope: z.enum(["all", "mine", "catalogue", "usda"]).default("all")
        .describe("mine: only the user's own foods and recipes; usda: USDA records Amino doesn't have yet (add one with add_catalogue_food)"),
      kind: z.enum(["any", "food", "recipe"]).default("any"),
      filters: z.object({ minKcal: z.number().min(0).optional(), maxKcal: z.number().min(0).optional(),
        minProteinG: z.number().min(0).optional(), maxProteinG: z.number().min(0).optional(),
        maxCarbG: z.number().min(0).optional(), maxFatG: z.number().min(0).optional() }).optional()
        .describe("Per 100 g"),
      limit: z.number().int().min(1).max(30).default(10),
      cursor: z.string().max(200).optional()
    }).refine(value => !!value.query !== !!value.barcode, "Give either a query or a barcode"),
    annotations: READ
  }, (input, ctx) => run("search_foods", ctx.http?.authInfo, async ({ db, userId }) => {
    const found = await searchFoods(db, userId, input)
    return { data: found, rows: found.foods.length }
  }))

  server.registerTool("add_catalogue_food", {
    title: "Add a catalogue food",
    description: "Add a food to Amino's shared catalogue from a database, when search_foods doesn't have it: a USDA " +
      "FoodData Central record (`usdaId`, from search_foods with scope \"usda\"), a product `barcode` (looked up in USDA " +
      "and Open Food Facts; when neither has it, the barcode's product listings name the product and the barcode is added " +
      "to the food Amino already has that is surely that product), or a `url` of a USDA or Open Food Facts page. The " +
      "values come from a database or the food Amino has, never from you: don't look the barcode up yourself first. " +
      "Returns `added` (new), `found` (Amino already had it) with the food as search_foods shows it, or `unknown` " +
      "(nothing added). A barcode's food has the package it is (`barcodePackage`). Check the name and brand are the " +
      "product the user means before logging it. At most 5 foods a minute and 50 a day.",
    inputSchema: z.object({
      barcode: z.string().trim().min(6).max(20).optional().describe("The product's EAN/UPC digits, from the package or the user"),
      usdaId: z.number().int().positive().optional().describe("A USDA FoodData Central id (fdcId)"),
      url: z.string().trim().max(500).optional().describe("A fdc.nal.usda.gov or openfoodfacts.org product page")
    }),
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true }
  }, (input, ctx) => run("add_catalogue_food", ctx.http?.authInfo, async ({ db, userId, authInfo }) => {
    const pointer = pointerFrom(input)
    const { data, targets } = await addCatalogueFood(db, userId, { clientId: authInfo.clientId, name: await agentName(authInfo) },
      pointer)
    return { data, rows: "food" in data && data.food ? 1 : 0, targets }
  }))

  server.registerTool("get_food", {
    title: "Get food",
    description: "One food by id (from search_foods, a meal or a recipe) with every nutrient it records, per 100 g and " +
      "per serving, its servings and the user's history with it. A recipe also lists its foods and their amounts for " +
      "the whole recipe (all its portions). An older version of the user's own food (replaced by an edit, still used by " +
      "past meals) is marked `archived` and names the current one in `replacedBy`.",
    inputSchema: z.object({ id: z.number().int().positive() }),
    annotations: READ
  }, ({ id }, ctx) => run("get_food", ctx.http?.authInfo, async ({ db, userId }) =>
    ({ data: await getFood(db, userId, id), rows: 1 })))

  server.registerTool("recent_foods", {
    title: "Recent foods",
    description: "The foods the user logged on the local days from..to, most often logged first (a food counts once " +
      "per meal), each with `timesLogged`, `lastLoggedOn` and their `usual` amount (servingId and amount, or grams), " +
      "plus servings and nutrition as in search_foods. For \"my usual breakfast\" or \"what I eat most\".",
    inputSchema: z.object({ from: date, to: date, limit: z.number().int().min(1).max(100).default(30) }),
    annotations: READ
  }, ({ from, to, limit }, ctx) => run("recent_foods", ctx.http?.authInfo, async ({ db, userId }) => {
    checkRange(from, to, 366)
    const foods = await recentFoods(db, userId, { from, to, limit })
    return { data: { foods }, rows: foods.length }
  }))

  server.registerTool("list_my_foods", {
    title: "List my recipes and foods",
    description: "The user's own recipes and custom foods (saved in the app), most recently edited first, with " +
      "servings, nutrition per 100 g and per serving (one portion for a recipe), and when each was created and last " +
      "edited. With `deleted`, the ones they deleted instead (restore_food brings one back).",
    inputSchema: z.object({ kind: z.enum(["recipes", "foods", "all"]).default("all"),
      query: z.string().max(100).optional().describe("Only names containing this text"),
      deleted: z.boolean().default(false).describe("List deleted foods and recipes instead") }),
    annotations: READ
  }, ({ kind, query, deleted }, ctx) => run("list_my_foods", ctx.http?.authInfo, async ({ db, userId }) => {
    const foods = await listMyFoods(db, userId, { kind, query, deleted })
    return { data: { foods }, rows: foods.length }
  }))

  server.registerTool("create_food", {
    title: "Create my food",
    description: "Add a food to the user's own foods (private to them; Amino's shared catalogue can't be changed). Use " +
      "it when search_foods has nothing that is the same food. Energy and macros are for `serving` (e.g. 1 bar = 45 g, " +
      "as the label says). If the user already has this food (same name and brand, or barcode), nothing is created and " +
      "the existing one is returned. Returns the food as get_food shows it. Needs the user's \"Let agents make changes\" " +
      "setting.",
    inputSchema: z.object(foodFields),
    annotations: CREATE
  }, (fields, ctx) => run("create_food", ctx.http?.authInfo, async ({ db, userId }) =>
    ({ data: await createFood(db, userId, fields), rows: 1 })))

  server.registerTool("create_recipe", {
    title: "Create my recipe",
    description: "Add a recipe to the user's own recipes: its foods (from search_foods; recipes don't nest) with amounts " +
      "for the whole recipe, and how many portions they make. Amino prices it per portion from the foods. A recipe with " +
      "the same name is returned instead of a second one. Needs the user's \"Let agents make changes\" setting.",
    inputSchema: z.object(recipeFields),
    annotations: CREATE
  }, (fields, ctx) => run("create_recipe", ctx.http?.authInfo, async ({ db, userId }) =>
    ({ data: await createRecipe(db, userId, fields), rows: 1 })))

  server.registerTool("update_food", {
    title: "Update my food",
    description: "Change one of the user's own foods (from list_my_foods or search_foods with source custom). Only the " +
      "fields you pass change; `nutrients` adds to or replaces the ones you name. Past meals keep the values they were " +
      "logged with: a food already logged is saved as a new version with a new id, which the result gives. Needs the " +
      "user's \"Let agents make changes\" setting.",
    inputSchema: z.object({ id: z.number().int().positive(), ...Object.fromEntries(Object.entries(foodFields)
      .map(([key, schema]) => [key, (schema as z.ZodType).optional()])) as { [K in keyof typeof foodFields]: z.ZodOptional<(typeof foodFields)[K]> } }),
    annotations: WRITE
  }, ({ id, ...change }, ctx) => run("update_food", ctx.http?.authInfo, async ({ db, userId }) =>
    ({ data: await updateFood(db, userId, id, change), rows: 1 })))

  server.registerTool("update_recipe", {
    title: "Update my recipe",
    description: "Change one of the user's own recipes: its name, portions, cooked weight, or its foods (`ingredients` " +
      "replaces the whole list; amounts for the whole recipe). Past meals keep the values they were logged with: a " +
      "recipe already logged is saved as a new version with a new id. Needs the user's \"Let agents make changes\" setting.",
    inputSchema: z.object({ id: z.number().int().positive(), name: recipeFields.name.optional(),
      portions: recipeFields.portions.optional(), cookedWeightGrams: recipeFields.cookedWeightGrams,
      ingredients: recipeFields.ingredients.optional() }),
    annotations: WRITE
  }, ({ id, ...change }, ctx) => run("update_recipe", ctx.http?.authInfo, async ({ db, userId }) =>
    ({ data: await updateRecipe(db, userId, id, change), rows: 1 })))

  server.registerTool("delete_food", {
    title: "Delete my food or recipe",
    description: "Delete one of the user's own foods or recipes. It leaves their Foods list and search; meals that " +
      "already have it keep showing it, and restore_food brings it back. Only delete what the user asked to. Needs the " +
      "user's \"Let agents make " +
      "changes\" setting.",
    inputSchema: z.object({ id: z.number().int().positive() }),
    annotations: DELETE
  }, ({ id }, ctx) => run("delete_food", ctx.http?.authInfo, async ({ userId }) =>
    ({ data: await deleteFood(userId, id), rows: 1 })))

  server.registerTool("restore_food", {
    title: "Restore my food or recipe",
    description: "Bring back one of the user's deleted foods or recipes (list_my_foods with deleted: true), for when " +
      "one was deleted by mistake. Not an older version an edit replaced, and not while another of the user's foods " +
      "has the same name. Needs the user's \"Let agents make changes\" setting.",
    inputSchema: z.object({ id: z.number().int().positive() }),
    annotations: WRITE
  }, ({ id }, ctx) => run("restore_food", ctx.http?.authInfo, async ({ db, userId }) =>
    ({ data: await restoreFood(db, userId, id), rows: 1, targets: [id] })))

  server.registerTool("log_meal", {
    title: "Log a meal",
    description: "Log a meal of foods you matched yourself: each food from search_foods (or recent_foods) with an exact " +
      "amount (servingId and amount, grams, or portions of a recipe). Amino prices them from its food records; it " +
      "doesn't read or interpret `note`, which is shown to the user as the meal's text. eatenAt defaults to now. Send a " +
      "new idempotencyKey (a UUID) per meal: a retry with the same key returns the meal already logged. The app shows " +
      "the meal as logged by you. A planned meal can be logged ahead (up to a year). Needs the user's \"Let agents " +
      "make changes\" setting.",
    inputSchema: z.object({
      foods: z.array(mealFood).min(1).max(50),
      eatenAt: z.iso.datetime({ offset: true }).optional()
        .describe("When it was (or will be) eaten, ISO 8601 with offset; up to a year either way"),
      note: z.string().trim().max(500).optional().describe("The meal's text in the log, e.g. \"Lunch at Nando's\""),
      idempotencyKey: z.uuid(),
      ...logForFields
    }),
    annotations: CREATE
  }, (input, ctx) => run("log_meal", ctx.http?.authInfo, async ({ db, userId, authInfo }) => {
    const agent = { clientId: authInfo.clientId, name: await agentName(authInfo) }
    if (input.forPersonIds && !(input.forPersonIds.length === 1 && input.forPersonIds[0] === userId)) {
      const { targets, ...data } = await logForPeople(db, userId, agent, input) as Record<string, any>
      return { data, rows: (targets as number[] | undefined)?.length ?? 0, targets }
    }
    const { targets, ...data } = await logMeal(db, userId, agent, input)
    return { data, rows: 1, targets }
  }))

  server.registerTool("add_to_meal", {
    title: "Add foods to a meal",
    description: "Add foods (from search_foods, with exact amounts as in log_meal) to one of the user's meals, at the " +
      "meal's time. Returns the meal. Needs the user's \"Let agents make changes\" setting.",
    inputSchema: z.object({ mealId: z.number().int().positive(), foods: z.array(mealFood).min(1).max(50) }),
    annotations: CREATE
  }, ({ mealId, foods }, ctx) => run("add_to_meal", ctx.http?.authInfo, async ({ db, userId }) => {
    const { targets, ...data } = await addToMeal(db, userId, mealId, foods)
    return { data, rows: 1, targets }
  }))

  server.registerTool("update_meal", {
    title: "Update a meal",
    description: "Change one of the user's meals: when it was eaten (`eatenAt`), a food's amount (`foods`: the item id " +
      "from get_meals with a new servingId and amount, grams or portions; it stays the same food), or take foods out " +
      "(`removeFoods`: item ids; to remove the last food, delete the meal), or its `text` (the meal's words in the " +
      "log; only when the user asks). To swap a food, remove it and add_to_meal the right one. A meal whose text only " +
      "lists its foods (\"Kefir (1 cup), …\") keeps that list up to date by itself. Returns the meal. Needs the user's " +
      "\"Let agents make changes\" setting.",
    inputSchema: z.object({
      mealId: z.number().int().positive(),
      eatenAt: z.iso.datetime({ offset: true }).optional(),
      foods: z.array(z.object({ id: z.number().int().positive().describe("The item id from get_meals"), ...amountFields })
        .refine(value => [value.servingId != null && value.amount != null, value.grams != null, value.portions != null]
          .filter(Boolean).length === 1, "Give one amount: servingId with amount, or grams, or portions")).max(50).optional(),
      removeFoods: z.array(z.number().int().positive()).max(50).optional(),
      text: z.string().trim().min(1).max(500).optional().describe("The meal's new text, as the user wants it in the log")
    }).refine(value => value.eatenAt || value.foods?.length || value.removeFoods?.length || value.text,
      "Change at least one thing"),
    annotations: WRITE
  }, ({ mealId, ...change }, ctx) => run("update_meal", ctx.http?.authInfo, async ({ db, userId }) => {
    const { targets, ...data } = await updateMeal(db, userId, mealId, change)
    return { data, rows: 1, targets }
  }))

  server.registerTool("delete_meal", {
    title: "Delete a meal",
    description: "Delete one of the user's meals (only one they asked you to delete). It can be brought back for 30 " +
      "days with restore_meal. Needs the user's \"Let agents make changes\" setting.",
    inputSchema: z.object({ mealId: z.number().int().positive() }),
    annotations: DELETE
  }, ({ mealId }, ctx) => run("delete_meal", ctx.http?.authInfo, async ({ userId }) => {
    const { targets, ...data } = await deleteMeal(userId, mealId)
    return { data, rows: 1, targets }
  }))

  server.registerTool("restore_meal", {
    title: "Restore a deleted meal",
    description: "Bring back a meal deleted in the last 30 days (in the app or by an agent), with the foods it had " +
      "when it was deleted. sync_meals lists deleted meals' ids. Needs the user's \"Let agents make changes\" setting.",
    inputSchema: z.object({ mealId: z.number().int().positive() }),
    annotations: WRITE
  }, ({ mealId }, ctx) => run("restore_meal", ctx.http?.authInfo, async ({ db, userId }) => {
    const { targets, ...data } = await restoreMeal(db, userId, mealId)
    return { data, rows: 1, targets }
  }))

  server.registerTool("list_people", {
    title: "List linked people",
    description: "People the user is linked with in Amino (partner, friend, trainer or client) and what each side allows: " +
      "whether the user can log meals for them, whether they can log for the user, and whether either sees all the " +
      "other's foods. Ids are for share_foods, log_meal (forPersonIds), log_meals and list_meals_logged_for.",
    inputSchema: z.object({}),
    annotations: READ
  }, (_args, ctx) => run("list_people", ctx.http?.authInfo, async ({ userId }) => {
    const data = await peopleForAgent(userId)
    return { data, rows: data.people.length }
  }))

  server.registerTool("share_foods", {
    title: "Share foods with people",
    description: "Share (share: true) or stop sharing the user's own foods and recipes (ids from list_my_foods) with " +
      "linked people. They see them in their Foods and follow the user's edits; a recipe brings its own private " +
      "ingredients. Stopping leaves them a copy of anything they used. Recipes with someone else's food in them are " +
      "refused. Needs the user's \"Let agents make changes\" setting.",
    inputSchema: z.object({ foodIds: z.array(z.number().int().positive()).min(1).max(50),
      personIds: z.array(z.uuid()).min(1).max(50), share: z.boolean() }),
    annotations: WRITE
  }, (input, ctx) => run("share_foods", ctx.http?.authInfo, async ({ userId, authInfo }) => {
    const data = await shareFoodsForAgent(userId, authInfo.clientId, input)
    return { data, rows: data.changed, targets: input.foodIds }
  }))

  server.registerTool("create_copy_link", {
    title: "Create a copy link",
    description: "A link to one of the user's own foods or recipes that anyone can open in Amino to add their own copy " +
      "(it doesn't follow later edits). Needs the user's \"Let agents make changes\" setting.",
    inputSchema: z.object({ foodId: z.number().int().positive() }),
    annotations: CREATE
  }, ({ foodId }, ctx) => run("create_copy_link", ctx.http?.authInfo, async ({ userId }) =>
    ({ data: await copyLinkForAgent(userId, foodId), rows: 1, targets: [foodId] })))

  server.registerTool("log_meals", {
    title: "Log several meals",
    description: "Log up to 100 meals in one call, e.g. a week's meal plan for several clients: each entry is a meal " +
      "(foods as in log_meal) for forPersonIds (default the user), at eatenAt or localTime (each person's own " +
      "timezone). Entries are logged one by one: each reports its own result, and a failure doesn't stop the rest. " +
      "Each entry needs its own idempotencyKey. Needs the user's \"Let agents make changes\" setting, and each " +
      "person's permission.",
    inputSchema: z.object({ entries: z.array(z.object({
      foods: z.array(mealFood).min(1).max(50),
      eatenAt: z.iso.datetime({ offset: true }).optional(),
      note: z.string().trim().max(500).optional(),
      idempotencyKey: z.uuid(),
      ...logForFields
    })).min(1).max(100) }),
    annotations: CREATE
  }, ({ entries }, ctx) => run("log_meals", ctx.http?.authInfo, async ({ db, userId, authInfo }) => {
    const admin = createAdminSupabase() as any
    const { data: today } = await admin.from("McpRequest").select("rows").eq("userId", userId).eq("tool", "log_meals").eq("ok", true)
      .gte("createdAt", new Date(Date.now() - 86_400_000).toISOString())
    const planned = ((today ?? []) as { rows: number | null }[]).reduce((sum, row) => sum + (row.rows ?? 0), 0)
    if (planned + entries.length > PLANNED_ENTRIES_PER_DAY)
      throw new McpInputError(`At most ${PLANNED_ENTRIES_PER_DAY} planned meals a day; ${Math.max(0, PLANNED_ENTRIES_PER_DAY - planned)} left today.`)
    const agent = { clientId: authInfo.clientId, name: await agentName(authInfo) }
    const results = []
    const targets: number[] = []
    for (const entry of entries) {
      try {
        const { targets: ids, meal: _meal, ...data } = await logForPeople(db, userId, agent, entry) as Record<string, any>
        targets.push(...((ids as number[] | undefined) ?? []))
        results.push({ idempotencyKey: entry.idempotencyKey, ...data })
      } catch (error) {
        if (!(error instanceof McpInputError)) throw error
        results.push({ idempotencyKey: entry.idempotencyKey, logged: false, error: error.message })
      }
    }
    return { data: { results }, rows: entries.length, targets }
  }))

  server.registerTool("list_meals_logged_for", {
    title: "Meals logged for a person",
    description: "Meals the user logged for one linked person (newest first, with totals, 100 at a time), while that person " +
      "still lets the user log for them. The user can't see the rest of their diary. For older meals, pass the reply's " +
      "next.before and next.beforeId.",
    inputSchema: z.object({ personId: z.uuid(), before: z.string().optional().describe("next.before from the previous reply"),
      beforeId: z.number().int().positive().optional().describe("next.beforeId from the previous reply") }),
    annotations: READ
  }, ({ personId, before, beforeId }, ctx) => run("list_meals_logged_for", ctx.http?.authInfo, async ({ userId }) => {
    const data = await mealsLoggedForAgent(userId, personId, { before, beforeId }) as { meals: unknown[] }
    return { data, rows: data.meals.length }
  }))

  server.registerTool("delete_meal_for_person", {
    title: "Delete a meal logged for someone",
    description: "Delete a meal the user logged for someone else (only one they asked you to delete), while that person " +
      "still lets them log. The person can restore it from their log for 30 days. Needs the user's \"Let agents make " +
      "changes\" setting.",
    inputSchema: z.object({ mealId: z.number().int().positive() }),
    annotations: DELETE
  }, ({ mealId }, ctx) => run("delete_meal_for_person", ctx.http?.authInfo, async ({ userId }) =>
    ({ data: await deleteMealForAgent(userId, mealId), rows: 1, targets: [mealId] })))

  server.registerTool("get_weight_history", {
    title: "Get weight history",
    description: "The user's weigh-ins per local day (from Apple Health, the app and agents), for up to 2 years: " +
      "`weightKg` is the day's average, `bodyFatPct` appears only when a scale measured it, and `trendKg` is a smoothed " +
      "trend (an exponential moving average, about a 19-day window) that hides day-to-day water swings. The trend lags a " +
      "changing weight by about 9 days, so for a rate of change (kg per week, energy balance) fit a line through the " +
      "weigh-ins rather than subtracting trend values. `summary` has the latest weigh-in, today's trend and the trend's " +
      "change over 7 and 30 days, and the user's `goalWeightKg` with `trendToGoalKg` (goal minus trend) when they set " +
      "one. Days without a weigh-in are left out.",
    inputSchema: z.object({ from: date, to: date }),
    annotations: READ
  }, ({ from, to }, ctx) => run("get_weight_history", ctx.http?.authInfo, async ({ db, userId }) => {
    checkRange(from, to, 731)
    const [history, profile] = await Promise.all([weightHistory(db, from, to), getProfile(db, userId)])
    const goal = profile.goals.weightKg
    const summary = history.summary && goal != null
      ? { ...history.summary, goalWeightKg: goal, trendToGoalKg: Math.round((goal - history.summary.trendKg) * 100) / 100 }
      : history.summary && { ...history.summary, goalWeightKg: goal }
    return { data: { ...history, summary }, rows: history.days.length }
  }))

  server.registerTool("get_expenditure_estimate", {
    title: "Get expenditure estimate",
    description: "The user's estimated daily energy expenditure (TDEE) from their own data: mean intake over complete " +
      "logged days (at least 60% of their median logged day) minus the weight trend's slope × 7,700 kcal/kg, the slope " +
      "fitted through the weigh-ins over the last `days` local days (default 28, ending yesterday) with outliers down-" +
      "weighted. `kcalPerDay` ± `plusMinus` (one standard error; wider for shorter windows), with `meanIntakeKcal`, " +
      "`trendKgPerWeek`, `weighings` and `completeDays`. Without enough data, `insufficient` says how many more weigh-in " +
      "days and complete logged days are needed instead of a number.",
    inputSchema: z.object({ days: z.number().int().min(14).max(56).default(28) }),
    annotations: READ
  }, ({ days }, ctx) => run("get_expenditure_estimate", ctx.http?.authInfo, async ({ db }) => {
    const estimate = await expenditureEstimate(db, days)
    return { data: estimate, rows: 1 }
  }))

  server.registerTool("update_goals", {
    title: "Update goals",
    description: "Set the user's daily calorie and/or macro goals, and/or their goal weight. Macros you set are kept " +
      "exactly (they are marked as set by hand, so the app won't recalculate them). If you change only calories and the " +
      "user's macros follow their calories, the macros are rescaled to keep the same split. goalWeightKg is metric " +
      "(convert pounds); null clears it. Returns the updated profile.",
    inputSchema: z.object({
      calories: z.number().int().min(800).max(8000).optional().describe("kcal per day"),
      proteinG: z.number().min(0).max(600).optional().describe("grams of protein per day"),
      carbsG: z.number().min(0).max(1500).optional().describe("grams of carbohydrate per day"),
      fatG: z.number().min(0).max(500).optional().describe("grams of fat per day"),
      goalWeightKg: z.number().min(25).max(350).nullable().optional().describe("the weight the user is aiming for, in kg")
    }).refine(value => Object.values(value).some(v => v !== undefined), "Set at least one goal"),
    annotations: WRITE
  }, ({ goalWeightKg, ...change }, ctx) => run("update_goals", ctx.http?.authInfo, async ({ db, userId }) =>
    ({ data: await updateGoals(db, userId, { ...change, weightKg: goalWeightKg }), rows: 1 })))

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
