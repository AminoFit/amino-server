# MCP: food search, and adding, editing and deleting foods and meals

**Date:** 2026-10-03 · **Status:** phases 1-3 live, app switch and goal weight on the phone (2026-10-03); phase 4 server pushed, its migration to apply, then the app's "via Claude" label · **Scope:** amino-server (`src/mcp`, migrations), amino-mobile (Connected agents, meal rows, goals)

## Goal

Agents (Claude, ChatGPT, …) connected through MCP can:

1. **Search** foods flexibly (always on, read-only): the catalogue, the user's own foods and recipes, barcodes, and what the user usually eats.
2. **Add, edit and delete** (off by default, one switch in the app for all agents): log meals from foods the agent matched itself, change and delete any of the user's meals, and create, edit and delete the user's own foods and recipes.
3. **Set a goal weight** (new), alongside the calorie and macro goals agents can already set.

Everything goes through the code the app already uses (`searchFoodsForUser`, `userFoods.ts`, `log_foods_as_meal`, the structured meal operations). No second implementation of pricing, versioning or meal writes.

## Owner decisions (2026-10-03)

- **One switch for all agents** ("Let agents make changes"), off by default.
- **Agents may change and delete any of the user's meals** for now (not only meals an agent logged).
- **Goals stay outside the switch.** A goal weight is added as a new goal.
- **No text logging.** The agent matches the foods itself (with `search_foods`) and logs exact foods and amounts. A meal can carry a message (the agent's note), but **Amino's meal agent never runs on an MCP meal**: no LLM cost on our side, and nothing re-interprets what the agent logged.

## Finding that shapes the security design

MCP access tokens are ordinary Supabase `authenticated` sessions (with a `client_id` claim), and `userDatabase(token)` sends them straight to PostgREST. So **an agent holding a token can already write any row RLS lets the user write**, by calling Supabase directly and skipping the MCP server: no app switch can stop that today. (`update_goals` and `update_body_stats` already write `User` this way.)

**Checked live (2026-10-03).** These policies aren't in `supabase/migrations`. An `authenticated` token, the agent's included, can today:

| Table | Agent token can | Effect |
|---|---|---|
| `Message` | insert, update (incl. `deletedAt`, `consumedOn`, `content`) | log, move, delete or rewrite any of the user's meals |
| `LoggedFoodItem` | insert, update, delete | change any food's amount or **nutrients** directly, unpriced |
| `User` | update any column | goals and body stats, but also `email`, `phone`, `subscriptionType`, `subscriptionExpiryDate` |
| `UserFavoriteFoodItem`, `UserMessageImages`, `ExpoPushTokens` | all writes | favourites, meal photos, push tokens |
| `userSubmittedBug` | insert (any row) | |
| RPCs `record_weight`, `import_weight_entries` | call | add or delete weigh-ins (scoped to `auth.uid()`) |

`FoodItem`, `Serving`, `Nutrient` and `RecipeIngredient` have no write policies, so agent tokens can't write foods. `WeightEntry`, `MealOperation` and the other operation tables have no write grants.

**Fix:** a restrictive policy on each table above that refuses INSERT/UPDATE/DELETE when the JWT has a `client_id` (`(auth.jwt() ->> 'client_id') IS NULL`), and the same check at the top of `record_weight` / `import_weight_entries`. The app's own sessions have no `client_id`, so the app is unaffected. OAuth tokens become read-only at the database. MCP writes run server-side as the verified user (admin client scoped by `userId`, as the app's own routes do), after the permission check. Tested by calling PostgREST with an agent token before and after.

**Separate, not agent-specific:** `User.subscriptionExpiryDate` is updatable by *any* signed-in user, and the server gates meal logging on it (`meal-operations/route.ts`). The app writes it itself (RevenueCat result → Watermelon → sync), so fixing it means letting only the RevenueCat webhook write it. Tracked as its own task, outside this plan.

## Setting: "Let agents make changes" (default off, all agents)

- App: Settings › Connected agents gets a switch, **Let agents make changes**, footnote: "Connected agents can log, edit and delete your meals and add your own foods and recipes. Deleted meals can be restored for 30 days." The "What a connected agent can do" list follows the switch.
- Stored in a new `AgentSettings` table (`userId` PK, `writesEnabled bool default false`, `updatedAt`). `authenticated` gets SELECT only; changes go through `POST /api/protected/user/oauth/settings`, which **refuses OAuth tokens**, so an agent can never switch on its own permission.
- Every write tool reads the setting at call time (no cache), so switching off takes effect on the next call.
- When off, write tools are still listed (clients cache tool lists) and return: "Changes are off. Turn on Let agents make changes in the Amino app: Settings › Connected agents."
- Runtime kill switch: FeatureFlag `mcp_writes` (owner first, then `all`), alongside `mcp_server`.
- Goal tools (`update_goals`, `update_body_stats`, goal weight) are **not** behind the switch.

## Phase 1: search (read-only, available to everyone)

Since agents now match foods themselves, search is what makes logging good. It has to return everything needed to log without a second lookup.

### `search_foods`
- Input: `query` (any language, typos ok) **or** `barcode`; `scope`: `all` (default) | `mine` (own foods and recipes) | `catalogue`; `kind`: `any` | `food` | `recipe`; `limit` (≤ 25); `cursor`.
- Uses `searchFoodsForUser` (the app's search: own foods first, text + meaning blend, typo pass). `barcode` uses the catalogue lookup only: search never creates foods or calls the web.
- Each result: `id`, `name`, `brand`, `source` (`recipe` | `custom` | `catalogue`), `servings` (`servingId`, unit, grams per unit), nutrition **per 100 g and per default serving** (kcal, macros, fibre, sugar, sodium), `estimate: true` for a marked estimate, and from the user's history `timesLogged` / `lastLoggedOn`.
- Optional `filters` (min/max per 100 g for kcal and protein) narrow the results; they don't search the whole catalogue by nutrient.

### `get_food`
Any food the user can see (shared, own, or an archived own version that past meals use), with every nutrient, servings, and for a recipe its ingredients. Replaces `get_my_food` (`list_my_foods` stays).

### `recent_foods`
The foods the user logged in a date range, most frequent first, with the usual amount (`servingId` + amount or grams) and last date. For "log my usual breakfast". One SQL function over `LoggedFoodItem` (indexed on `userId`, `consumedOn`).

Done 2026-10-03 (migration `20261011000000_mcp_food_history.sql`, `src/mcp/foods.ts`). Checked live: English, typo, own recipe and filter queries work. Catalogue names are mostly English, so "Haferflocken" or "鶏むね肉" find nothing proper: the instructions tell agents to search in English, and every result carries `match` (`name` | `meaning` | `loose`) so a fuzzy filler ("Chicken Ham" for oats) is never mistaken for the food.

## Phase 2: permission plumbing and goal weight

Server and database done 2026-10-03 (`20261012000000_agent_access.sql`, applied in the SQL editor; checked live: an agent token reads the user's 2834 meals but updates nothing, the app session updates). The app's API routes (`GetUserIdOnRequest`, `GetAminoUserOnRequest`) also refuse agent tokens: before, an agent token could call any of them, delete-account included.

1. ~~List current RLS write policies~~ (done, see above).
2. Migration: restrictive "no writes from agent tokens" policy on each table listed above, plus the check in the two weight RPCs; `AgentSettings`; FeatureFlag `mcp_writes` seeded for the owner; `Message.agentClientId`.
3. Move `update_goals` / `update_body_stats` onto the server-side write path (they'd break otherwise), still ungated.
4. **Goal weight:** `User.goalWeightKg` (nullable). `update_goals` takes `goalWeightKg`; `get_profile` and `get_weight_history` return it (the summary also says how far the trend is from it). App: set it in the goals editor, and show it as a line on the weight trend tile and Weight history page. Only a target weight for now, no target date.
5. App: the switch on Connected agents, the settings route, the copy.
6. `McpRequest` gains `action` and `targetIds` (meal or food ids written), so every agent change can be traced.

## Phase 3: own foods and recipes

| Tool | Does | Uses |
|---|---|---|
| `create_food` | A private custom food: name, brand, serving (unit, amount, grams), macros, optional nutrients and extra servings, barcode | `saveCustomFood` |
| `create_recipe` | Name, portions, ingredients (`foodId` + grams or `servingId` + amount), optional cooked weight | `saveRecipe` |
| `update_food` / `update_recipe` | Same fields; only what's passed changes | same functions; forward-only versioning |
| `delete_food` | Archives an own food or recipe | `archiveUserFood` |

- **Agents never write the shared catalogue.** "Add a food to the database" creates a food private to the user, so one user's agent (or a prompt-injected one) can't change everyone's search.
- Duplicate guard: the user's own foods are checked for the same barcode or the same name + brand; a match returns `{duplicateOf: id}` instead of creating, unless `createAnyway: true`. `idempotencyKey` (uuid) makes a retried call return the first result.
- Values validated as in the app (`validNutrition`: energy and macros fit the serving; barcode check digit).
- Descriptions say edits apply going forward: past meals keep the values they were logged with.

## Phase 4: meals (exact foods only)

Built 2026-10-03 (`20261013000000_agent_meal_writes.sql`, `src/mcp/mealWrites.ts`). Two changes from the first draft, after looking at production: structured meal operations (portion, move, delete) have never run there, and 72 of the last 73 meals aren't owned by the operation protocol, so agents change meals the way the app does (server functions mirroring the app's direct writes), and a meal the protocol owns or is still processing is refused ("try again, or change it in the app"). No revision check: those meals have no revision. Owner, 2026-10-03: planned and every-day meals are logged ahead, so a time up to a year either way is accepted.

Meals are `Message` rows with their `LoggedFoodItem`s. Agent meals are written the way Add Food's tray writes them: created **resolved**, priced on the server, the meal agent never runs. The app, the sync feed (`MealChange`), totals and the web log see them like any other meal.

| Tool | Does | Uses |
|---|---|---|
| `log_meal` | `items`: `foodId` + (`servingId` + amount \| grams \| portions), 1–50; `eatenAt` (ISO with offset; defaults to now); optional `note`; `idempotencyKey` | `logFoodsAsMeal` |
| `add_to_meal` | Adds foods to an existing meal | new SQL function on `insert_priced_food_row` |
| `update_meal` | Change the time (`eatenAt`), one food's amount, or remove one food | structured operations `move`, `portion`, `delete` (item) |
| `delete_meal` | Soft-deletes one meal | operation `delete` |
| `restore_meal` | Undoes a delete within 30 days | new, small SQL function |

- **The message:** `note` is the meal's text as the user sees it (e.g. "Lunch at Nando's"); without one, the text is the foods' names and amounts, as Add Food writes it. It's stored only: no resolver run, no takeover. (If the user later rewrites the text in the app, that's their own edit and runs the agent as usual.)
- The structured operations are deterministic (`structuredPlan` in `worker.ts`, model "structured-action"), so edits don't run the meal agent either. To check when building: an Add Food-style meal has no published plan and goes through `legacySnapshot`; confirm `portion` and `move` work on one, or price edits directly like `update-logged-food-item-serving`.
- **Concurrency:** meal JSON gains `revision`; edits pass it, and a meal changed in the app meanwhile returns "This meal changed. Read it again with get_meals."
- **Where it came from:** `Message.agentClientId`; the app shows "via Claude" (the OAuth client's name) under the meal on the Log and in meal details.
- Ids in `list_meals` / `get_meals` (meal id, each food's logged id) are what the edit tools take.

## Security summary

1. Off by default; switched on only from the app with the app's own session; an agent token can't change it.
2. Agent tokens are read-only at the database (Phase 2); all writes are server-side, scoped to the verified user, after the setting and the `mcp_writes` flag are checked.
3. Scope: the user's own meals and private foods; never shared catalogue rows; ids are checked as owned.
4. Prompt injection and runaway agents: delete tools carry `destructiveHint` (clients ask the user first); one meal per delete; deletes restorable for 30 days; a write limit separate from reads (e.g. 20 a minute, 300 a day).
5. No server-side LLM on agent writes: nothing an agent sends is interpreted by our models, so there's no cost to abuse and no prompt to inject.
6. Retries can't double-log (`idempotencyKey`); stale edits can't overwrite app edits (revisions).
7. Every change is logged in `McpRequest` with what it touched, and agent meals are labelled in the app.

## Instructions text (`MCP_INSTRUCTIONS`) additions

- To log a meal: find each food with `search_foods` (prefer the user's own foods and `recent_foods` for usual meals), then `log_meal` with exact amounts. Amino doesn't interpret text: the note is only shown to the user.
- If no food fits, `create_food` (private to the user) after checking `search_foods(scope: "mine")`.
- Don't change or delete meals the user didn't ask about; confirm before deleting.

## Order

1. Search (ships on its own).
2. Permission plumbing + goal weight (server and app).
3. Own foods and recipes.
4. Meals.
