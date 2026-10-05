# Food search: include your recipes and custom foods

The "add food to your log" search lives in two repos:

- **App:** `amino-mobile/common/foodSearch/useSearchForFoodByString.ts`, used by `screens/AddFoodModal.tsx`, `screens/Foods/IngredientSearchScreen.tsx` and `FoodSearchView.tsx`.
- **Server:** `amino-server-main/src/app/api/search-food/route.ts`.

The findings below come from production with read-only queries.

## Why your recipes and custom foods don't reliably show up

1. **Recipes are filtered out by a feature flag meant for the meal agent.** The `get_cosine_results` database function drops every food with `recipePortions` unless `user_flag_enabled('recipes_in_agent', user)` is true. That flag is `off`. So **"Chicken Pasta Sauce – 9/30/26" (food 15315) can never appear in search**, even typed exactly. The same function feeds the meal agent's prefetch, which is why one flag controls both.
2. **The app's search is embedding-only, with no text match**, although the meal agent already runs a pg_trgm + embedding hybrid (see server change 1). Your custom food (15298, "Dark Chocolate Quinoa Crisps") is eligible. But it has to beat about 15,000 catalogue foods on vector similarity to make the **top 10** (`amount_of_results: 10`). Then the app hides anything under **0.6 similarity** (`filteredResults`). A short or partial query ("quinoa", "pasta sauce") can easily push it out. Nothing guarantees that your own foods rank first.
3. **The response doesn't say whose a food is.** `search-food` returns `id, name, brand, nutrients, Serving, images`. It doesn't return `privateToUserId`, `recipePortions`, `lastUpdated` or `createdAtDateTime`, so the app couldn't badge a result as a recipe or show a date even if it appeared.
4. **Edits can show stale results for a while.** The app caches results per query (`searchCache`). Editing a recipe creates a new version with a new `id` and archives the old one, but a cached search can still show the old version until it expires.

## Last-edited date: the data already exists

Editing a recipe or custom food inserts a new `FoodItem` row (`previousVersionId` → the old one; the old one gets `archivedAt`):

- `createdAtDateTime` is copied forward (commit `2b2f144`: "a new version keeps the date it was created");
- `lastUpdated` defaults to `now()` on insert, so **the current version's `lastUpdated` is the last-edited time**.

No migration is needed. Before relying on it, check that `saveUserFood` doesn't copy `lastUpdated` forward too. A unit test on the version insert covers it.

Your recipe's name already carries a hand-typed date ("– 9/30/26"). Once the date shows automatically, you won't need that.

## Server changes

1. **Hybrid search: text (pg_trgm) plus embeddings, reusing what the meal agent already has.** Nothing new is needed in the database except a recipes parameter:
   - **Text:** `search_meal_food_catalogue(p_query, p_limit, p_offset, p_user_id)`. It uses pg_trgm `word_similarity` (threshold 0.45) on `food_identity_part(name)`, backed by the existing GIN index `FoodItem_name_trgm_idx`, plus brand and aliases, and it covers shared foods and the user's private foods. Production check: "quinoa crisps" already returns your custom food 15298 first.
   - **Meaning:** `search_food_catalogue_nearest(p_embedding_cache_id, p_limit, p_user_id)`, backed by the HNSW index `FoodItem_bgeBaseEmbedding_idx`.
   - **Blend:** `blendSearch` (`src/mealResolution/searchBlend.ts`): exact name match, then nearest by meaning, then names containing every query word, then the remaining text hits, deduped. Move it to a shared module, and have `search-food` and the agent call the same `searchFoodsForUser(userId, query)`. That way the app and the agent rank foods the same way, and each fix improves both.
   - **Recipes:** add `p_include_recipes boolean DEFAULT false` to both functions, replacing their internal `recipes_in_agent` check with `(f."recipePortions" IS NULL OR p_include_recipes OR <flag>)`. The app always passes `true`; the agent keeps the flag. Without this, "pasta sauce" still won't find your recipe.
   - **Yours first:** after blending, move the user's own matches (`privateToUserId = user`) into a "Yours" group ahead of the catalogue. Within the group, sort by exact name, then the blend's order, then most recently edited. The 0.6 cut never applies to them. Optional: a small extra text-only query over just the user's private live foods with a lower trigram threshold (around 0.3), so a two-letter typo still finds your own recipe. It's cheap, because each user has only a handful of private rows.
   - **Why not a weighted score:** trigram and cosine numbers aren't on comparable scales. The rank-based blend, already tuned on agent queries ("apples" → Apple, "sea salt rxbar" → RXBAR), avoids tuning weights. If a single score is wanted later, reciprocal rank fusion (`1/(60+rank_text) + 1/(60+rank_vector)`) is the standard drop-in. It also ranks by position, not raw scores.
   - Run the two queries in parallel (as `evidence.searchFoods` already does). The query embedding is cached per string (`getCachedOrFetchEmbeddings`). If the embedding call fails, return the text results alone.
2. **Separate the agent flag from UI search.** `get_cosine_results` keeps `recipes_in_agent` for the meal agent. Whether the agent should log your recipes from text ("a portion of my chicken pasta sauce") is a separate decision. Recommendation: turn it on for you once search works, because today a text log can't find your recipe either.
3. **Richer results from `search-food`.** Each result gets `source: "recipe" | "custom" | "catalogue"`, `lastEditedAt` (`lastUpdated`), `createdAt` (`createdAtDateTime`), `recipePortions`, and nutrition per portion for recipes. Group the response as `{yours: [...], catalogue: [...]}`, or keep the flat `results` with the `source` field so older app builds keep working. **Prefer the flat list plus `source`**: it's backwards compatible.
4. **The client threshold moves to the server.** Rows in "Yours" are never removed by the 0.6 floor. Apply the floor only to catalogue rows, on the server, so every app screen behaves the same.
5. **An empty-query mode for the start screen.** `GET /api/protected/user/foods?recent=…` (or a `search-food` call with an empty query) returns the user's recipes and custom foods sorted by last edited, plus recently logged foods. This feeds the start screen below.

## App changes (inspired by the screenshot)

The screenshot's structure works well: tabs along the top (**Scan / Search / Quick Add / Library**), a horizontal **Favorites** row of big icons with a `+`, and a **Latest** list. Each row there shows an icon, a name, a macro line (`195🔥 16P 13F 1C • 2 jumbo (126 g)`) and a `+` button, with the search field and **Log Foods** pinned at the bottom.

How that maps onto Amino:

1. **Start screen (no query yet), instead of the current empty `RenderStartScreen`:**
   - **My recipes & foods:** a horizontal row of icons with `+`, sorted by last edited, each labelled with name and "Edited 30 Sep". Tapping `+` logs one portion or the default serving. Tapping the item opens it.
   - **Recent:** the foods you logged most recently, one tap to re-log at the last amount used.
2. **Search results in two sections:**
   - **Your recipes & foods** first, always visible when they match. Each row has a small "Recipe" or "My food" chip and, for recipes, **"Edited 30 Sep 2026"** (relative for recent edits: "Edited today", "Edited yesterday", else the date).
   - **Catalogue** below, as today.
3. **Use the screenshot's row format everywhere:** icon · name · `kcal P F C • serving` · `+`. For a recipe the serving is "1 portion (of 12)", with nutrition per portion.
4. **Clear the search cache when foods change.** Clear the cached searches on any create, edit, archive or recipe save from `userFoodsApi`, so an edited recipe never shows its old version.
5. Optionally, later: a **Library** tab listing all your recipes and foods (the Foods tab content), and a **Scan** tab that goes into the barcode flow in `barcode-route-plan.md`.

## Recipe ingredient search ("Add a Food" in the recipe editor) must search the whole food database

**Today:** `amino-mobile/screens/Foods/IngredientSearchScreen.tsx` uses the same `useSearchForFoodByString` → `/api/search-food`. That means 10 embedding hits, with anything under 0.6 hidden. Your own foods come from a local substring filter over `useUserFoods` (fine, keep it), and recipes are excluded, both in the app and on the server (`ingredient_unavailable`, no nested recipes). That's correct; keep it. So an ingredient has to be among the 10 nearest of the **14,129 shared catalogue foods**. The **USDA copy (`UsdaFoodItemEmbedding`, about 470,000 foods)** is reachable only by the meal agent (`search_usda_database` / `foodSources.usdaByName`).

**Change:**
1. **The same shared `searchFoodsForUser`, in an `ingredient` mode:** `includeRecipes: false`, with your foods first as before.
2. **The whole catalogue, with paging.** The text search already supports `p_offset`. Return `nextCursor` and load more as you scroll ("Show more"), instead of stopping at 10. Text hits are never removed by the similarity cut.
3. **USDA results in the same list.** Show a **"More from USDA"** section below the catalogue, from `search_usda_database` (embedding). Optionally add a trigram index on the USDA description for name matches, with the size impact checked first (470k rows). Load it with the first page when the catalogue has few strong hits, otherwise when you scroll to the end. Skip USDA rows already in the catalogue (`externalId` / `fdcId`).
4. **Picking a USDA result creates the catalogue food first, then adds it as the ingredient.** Use the existing duplicate-checked path (`foodSources.createFoodFromSource`). That way the recipe always points at a real `FoodItem` with servings and nutrients, and the next search finds it in the catalogue. This needs a small app endpoint, e.g. `POST /api/protected/user/foods/from-source {sourceId}`, because today only the agent can create foods from a source.
5. **Escape hatches at the bottom of the list:** "Scan barcode" (the barcode lookup from `barcode-route-plan.md`: catalogue → USDA → Open Food Facts) and "Create custom food / read a label" (the existing `read-label` and user-food routes).
6. **Use the same rules in the add-to-log search.** Paging and the USDA section help there too. Only the recipe rule differs: the log search includes your recipes; ingredient search excludes them.

**Tests:**
- an ingredient that's only in USDA appears under "More from USDA", and picking it creates one catalogue food (a second pick reuses it, with no duplicate);
- page 2 continues without repeating results;
- recipes never appear in ingredient search;
- your foods still come first.

## Speed: where the time goes, and what to fix

Measured in production with read-only `EXPLAIN ANALYZE`, warm cache unless stated. Every search runs these steps **one after another**:

| Step | Cost | Why |
|---|---|---|
| Auth: `supabase.auth.getUser(token)` + User row | one or two network round trips (not measured) | `GetAminoUserOnRequest` checks the token with Supabase Auth on every keystroke search |
| Query embedding: cache lookup, then Cloudflare on a miss + upsert | cache hit: one query. Miss: a Cloudflare call + a write (not measured) | The cache is keyed on the exact string, so every new prefix while typing ("pas", "past", "pasta s") is a miss |
| `get_cosine_results` (app search) | **~650 ms** | The planner estimates ~1 matching row (out of 14,130), so it **skips the HNSW index** and computes the distance for every food. The function also returns `"bgeBaseEmbedding"::text`, which converts all 14k vectors to text before the top 10 are picked, and `search-food` doesn't even use that column. The same query using the index takes **~1 ms**. |
| `search_food_catalogue_nearest` (agent) | ~135 ms | Same mis-estimate, without the text conversion |
| `search_meal_food_catalogue` (trigram, agent) | **~460 ms** | The trigram part alone is 58 ms on the index. The rest comes from the `OR` with the brand/alias checks, which defeats the index, and from `food_identity_part()` running per row. It has `SET search_path`, which stops Postgres inlining it, so each call is a full function call with `unaccent`. |
| USDA search | 2 ms warm, **1.36 s cold** | The 470k-row HNSW index (about 1.5 GB of 768-d vectors) is read from disk after it drops out of memory |
| Load foods + images + servings | one more query | Runs after the search, not alongside it |

Also: `foodEmbeddingCache` (185,691 rows; stats say 1,518) and `UsdaFoodItemEmbedding` (470,102 rows; stats say 0) have **never been analyzed**.

### 1. Fix the SQL first (the biggest win, no caching needed)

- **Vector search uses the index.** Search the HNSW index first, then filter: `WITH nn AS (SELECT id, … FROM "FoodItem" ORDER BY "bgeBaseEmbedding" <=> q LIMIT 60) SELECT … FROM nn WHERE <shared or mine, live, recipe rule> LIMIT k`. pgvector 0.5.1 has no iterative index scans, so take more than needed and then filter. The user's private foods are a handful of rows, so search them exactly in a second small query and merge. **Stop returning the embedding as text.** Alternatively, a partial HNSW index `WHERE "privateToUserId" IS NULL AND "archivedAt" IS NULL` keeps the main index exact for shared foods. Target: 650 ms → under 5 ms.
- **Trigram search uses its index.**
  - Add a stored generated column `name_identity = food_identity_part(name)` with the GIN trigram index on it.
  - Split the brand and alias matches into a `UNION` of separately indexed queries instead of `OR`.
  - Order by `word_similarity` on the stored column.
  - Target: 460 ms → about 10–30 ms.
- **Run `ANALYZE`** on `foodEmbeddingCache`, `UsdaFoodItemEmbedding` and `FoodItem`, and check autovacuum on the two big tables.
- **Keep the USDA index warm.** Use `pg_prewarm` on the index after restarts, or a cheap scheduled query. Consider `halfvec` for the USDA embeddings, which halves the index size so it stays in memory more easily.

### 2. Caching, server side

- **Query embeddings:**
  - lower-case and trim the cache key, so "Pasta sauce " and "pasta sauce" share a row;
  - keep an in-memory LRU of recent vectors in the function instance (Fluid Compute reuses instances);
  - skip the embedding entirely for queries under 4 characters, using text search only.
- **Search results:** cache the response per `(user, normalized query, mode)` for about 10 minutes. Use Vercel Runtime Cache, or the Redis that already exists (`PROMPT_CACHE_REDIS_URL`). Tag entries with the user ID and invalidate the tag whenever that user creates, edits or archives a food or recipe. Catalogue changes are rare and can expire on the timer.
- **Food cards** (food + servings + top images) by food ID: shared foods change rarely, so cache them for hours and look them up by ID after the search, instead of re-joining images and servings every time.
- **Auth:** verify the Supabase JWT locally (`getClaims` / JWKS with asymmetric keys) instead of calling `auth.getUser` on every request. Cache the user row for the token's lifetime.

### 3. Return results faster, without waiting for everything

- **Run text and embedding in parallel**, as `evidence.searchFoods` already does. Return text hits as soon as they're ready: either two responses (text first, then the blended list), or one streamed response that the app merges. With the SQL fixes, both finish in tens of milliseconds, so one response may be enough. Measure before adding streaming.
- **The app shows local results instantly:** your foods and recipes (already loaded by `useUserFoods`) and recently logged foods match locally as you type, before the server answers. While a request is in flight, narrow the cached results from the previous prefix ("pasta" → "pasta s") instead of showing a spinner. Then shorten the debounce from 300 ms to about 150 ms.
- **USDA loads only when needed:** on scroll or "Show more", or when catalogue hits are weak, so its cold-start cost never blocks the first results.

### 4. Use the WatermelonDB cache on the phone: search locally first, the server fills in

**What's already on the device** (`amino-mobile/watermelon`, schema v10):
- `food_items` (with `privateToUserId`, `archivedAt`, `recipePortions`, `createdAtDateTime`, `lastUpdated`, `foodImageUrl`);
- `servings`, `recipe_ingredients` and `logged_food_items`.

The sync (`syncLoggedFoodItem.ts`) already pulls your own foods and recipes incrementally on `lastUpdated`, with their servings, icons, recipe ingredients and the foods those ingredients use. It also pulls the foods behind your logged items. **None of this is used by search today**, apart from the ingredient screen's substring filter over `useUserFoods`.

**Tier 1: personal search from what's already local (no new sync).**
- One local query when the search opens, and on each keystroke: `food_items` where the normalized name or brand contains every query word (stemmed like `searchBlend.words`), restricted to your foods and recipes plus foods you've logged.
- Rank:
  1. exact name;
  2. your recipes and foods (recipes most recently edited first, showing "Edited 30 Sep");
  3. how often and how recently you've logged it, counted from `logged_food_items`.
- Rows render with nutrition and servings from the local tables, so tapping `+` adds the food **immediately**, with no network.
- This also gives the screenshot's start screen for free: **Favorites** (most logged) and **Latest** (last logged, at the amount used last time), both read straight from `logged_food_items`.
- Expected: results within one frame (~20 ms) for everything you've logged or created, which covers most searches.

**Tier 2: mirror the whole shared catalogue on the phone.**
- **Size:** 14,129 shared foods and about 20k servings. With the existing columns, that's roughly 5–10 MB in SQLite. The 470k-row USDA set and the embeddings stay on the server.
- **Sync:** an incremental pull of shared `FoodItem` + `Serving` on a `lastUpdated` cursor, reusing the private-food pull pattern. Add a tombstone list (or `archivedAt`) for removed or replaced foods, and a full refresh as a safety net (e.g. weekly, or when the server bumps a catalogue version). The first sync runs in the background after login. Search falls back to tier 1 + server until it finishes.
- **Fast local text search:**
  - add a normalized `searchText` column (lower-case, unaccented name + brand + aliases), set by the sync;
  - for prefix and multi-word search ("pas sau" → "Pasta Sauce"), create an SQLite **FTS5** table over `searchText` in a Watermelon migration (`unsafeExecute` SQL), kept in step with the sync's writes;
  - without FTS, `Q.like('%word%')` over 14k rows with JSI is still only tens of milliseconds, an acceptable first version.
- **Result:** every catalogue text match appears instantly, even offline, and picking one adds it with no fetch. That covers recipe ingredients too.
- **What the server is still needed for:** matching by meaning ("french press coffee" → Coffee, Brewed) and typos beyond FTS. It also covers USDA and other external sources, and foods created in the last few minutes on other devices (until the next sync).

**Tier 3: keep search results on the device.**
- Replace the in-memory `searchCache` with a small Watermelon table `search_results (userId, query, mode, foodIds JSON, fetchedAt)`. Server answers then survive app restarts and show instantly when the query is repeated.
- Results are stored as **food IDs only** and rendered from local `food_items`. Server results bring any missing food rows into Watermelon, so the next tap is instant.
- Use stale-while-revalidate: show the stored result, refresh in the background, and replace it quietly if it changed. Clear the user's rows on any food or recipe create, edit or archive, which also fixes stale versions after an edit.

**Merging local and server results without the list jumping:**
- Local results render first and keep their positions.
- Server results that local search didn't find go into the right section ("Yours" or catalogue) **below** the local rows. Rows already shown are never reordered while you're looking at them.
- Keys are food IDs, so rows only update in place.
- A small "Searching more…" row stays at the bottom until the server answers, then becomes "More from USDA" when that section applies.

**Server support needed:**
- a catalogue sync endpoint (`GET /api/protected/foods/catalogue?since=…&cursor=…`, returning foods + servings + tombstones, paged);
- `search-food` accepts `knownIds` / `localOnlyQuery` hints, so it can leave out rows the app already has, which keeps responses small.

### Targets

With WatermelonDB, the first results come from the phone: **under 50 ms** for anything you've logged or created (tier 1), and for any catalogue name once the catalogue is mirrored (tier 2). Repeated queries are instant (tier 3). The server's meaning-based and USDA results follow, with the aim of under 300 ms for a warm, cached query. That breaks down as under 50 ms for local results, under 30 ms in the database, and the rest in the network. Add timing per step (`auth`, `embed`, `text`, `vector`, `hydrate`) to `search-food` logs, so real production numbers replace the "not measured" rows above. I couldn't read Vercel function timings, because the Vercel connection needs authorizing.

## Tests

- **Server:**
  - a query that's a substring of a recipe name returns the recipe first, with the flag off;
  - an archived version never appears;
  - another user's private food never appears;
  - after an edit, the new version's `lastEditedAt` is the edit time and `createdAt` is the original date;
  - catalogue rows are deduped against "Yours".
- **App:**
  - "Your recipes & foods" renders above the catalogue, with the chip and date;
  - the 0.6 floor no longer hides your own foods;
  - editing a recipe and then searching shows the new version.

## Order of work

0. **The speed fixes in SQL:** the vector search uses its index and stops returning the embedding as text; the trigram search uses its index; `ANALYZE` the big tables. This is quick, low-risk, and also speeds up the meal agent's searches.
1. A shared `searchFoodsForUser` (trigram + embedding + `blendSearch`, recipes parameter, yours first), plus the richer, backwards-compatible `search-food` response (1, 3, 4), with per-step timing logs.
2. The app's search sections, chips and edited date, plus cache clearing (2–4 in the app list), and **WatermelonDB tier 1** (local personal search, plus Favorites and Latest from `logged_food_items`). Tier 1 needs no new sync, so it's the cheapest big speed-up in the app.
3. Ingredient search over the whole database: paging, the USDA section, the create-from-source endpoint and the escape hatches; the add-to-log search then gets the same paging and USDA section.
4. The start screen with My recipes & foods and Recent (server 5, app 1).
4b. **WatermelonDB tiers 2–3:** the catalogue sync endpoint, the local catalogue mirror with FTS5, and stored search results with stale-while-revalidate.
5. Decide whether to turn on `recipes_in_agent` for text and photo logging.
