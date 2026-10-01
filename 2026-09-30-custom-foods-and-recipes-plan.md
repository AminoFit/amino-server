# Custom foods and recipes plan

**Date:** 2026-09-30
**Status:** planned. Phase 1 (server) is next.
**Scope:** amino-server (database, API, meal agent, MCP) and amino-mobile (new Foods tab, log actions, food detail).

Users can create their own foods and recipes, see and edit them in a new Foods tab, and log them. A recipe is a named group of foods that makes a number of portions ("I ate 1.5 portions"), and it can be saved from a past meal.

---

## Why now

- **Meal 30365** (2026-09-29 19:12) is a photo with "Create custom recipe for this. There are 12 portions total". The agent ignored the request and logged the 7 ingredients as the meal (746 kcal).
- **Meal 30388** (2026-09-30 19:53) is the same 7 rows copied by "Log Again Now", so the second portion counted the full 746 kcal again.
- The amounts (227 g chicken, 76 g pasta) look like one plate rather than a 12-portion pot. Saving a meal as a recipe therefore has to ask what the logged amounts were.

## What exists today

- **Private foods:** `FoodItem.privateToUserId` (migration `20260927010000_private_foods`). Database row rules, catalogue search and the agent are all private-aware. Only the agent creates private foods: personal dish estimates and unnamed labels. There is no create, edit or delete API. Production has 1 private food.
- **No recipe concept.** The nearest thing is `historyGroupSelections`: the agent re-logs a past meal's group, scaled. `historyCheck.ts` uses Jev to confirm the wording refers to a past meal.
- **Logged nutrients are stored per row.** `LoggedFoodItem` keeps 40+ nutrient columns, and every total sums them. Past logs never change when a food changes.
- **App:** Watermelon (schema v8) is a read cache. Foods are cached only when a log uses them, and there is no local food search. Favourites can be toggled but are never listed. "Log Again Now" copies every row of a meal.
- **Meal operations are off in the app.** It writes to Supabase directly, or through `update-logged-food-item-serving`. Agent-created meals are operation-owned, so the guard triggers block direct row writes to them.

---

## Decisions (owner, 2026-09-30)

1. **Foods tab:** a 4th tab between Log and Goals, with a Recipes | Foods switch.
2. **One row per logged recipe.** A logged recipe is one row with one icon ("Chicken pasta · 1.5 portions"). Tapping it opens the food detail: the portion picker, the foods in it scaled to the logged portion, and "Edit recipe".
3. **Edits apply going forward only.** Past logs keep what was eaten: their numbers, their ingredient list, and the result of a later portion change.
4. **Long-press a meal → "Add as recipe".** This sits next to "Log Again Now". If the meal is already a single recipe log, the menu shows "Open recipe" instead.
5. **The agent sees your foods and recipes only when relevant.** Using a recipe must never take over an ordinary log (see Phase 4).

## Data model

**A recipe is a private `FoodItem`** with `foodInfoSource = 'Recipe'`. Its servings:

- **"portion"**, the default serving. `defaultServingWeightGram` is the weight of one portion, so nutrients per serving are per portion.
- **"whole recipe"**.
- **grams**, as for every food.

Because a recipe is a food, logging, search, totals, sync, the MCP server and the web log work with it unchanged. "1.5 portions" is an ordinary serving log.

**Migration:**

- Add `Recipe` to the `FoodInfoSource` enum.
- Add these `FoodItem` columns:
  - `archivedAt timestamptz`: hidden from search, lists and the agent. Past logs still show it.
  - `previousVersionId int`: the version this one replaced.
  - `recipePortions numeric`: not null exactly when the food is a recipe.
  - `cookedWeightGram float8`, optional. When set, a portion is the cooked weight divided by the portions, so "350 g of the chili" is right. Otherwise a portion is the sum of the ingredient grams divided by the portions.
- New table `RecipeIngredient`:
  - `id`, `recipeFoodItemId` (FK, cascade), `foodItemId` (FK, restrict), `grams`, `servingId`, `servingAmount`, `loggedUnit`, `position`.
  - Index on `recipeFoodItemId` and on `foodItemId`.
  - Row rules: readable when the recipe food is readable. Writes go through the server only.
- Change `FoodItem_name_brand_owner_key` to a partial index (`archivedAt is null`), so a new version can keep the name of the version it replaces.
- `merge_catalogue_food` repoints `RecipeIngredient.foodItemId`, so catalogue merges keep working.
- No nested recipes in v1: an ingredient can't be a recipe.

**Versions (forward-only edits):**

- Saving an edit to a food or recipe that **has logs** creates a new `FoodItem`. It gets the edited values, the same icon (copied `FoodItemImages` link) and `previousVersionId` set. The old row gets `archivedAt`.
- Past logs keep pointing at the old version. They keep its ingredient list, and a later portion change recalculates from that version.
- A food or recipe with **no logs** is edited in place.
- Deleting archives. Nothing is ever hard-deleted, because `LoggedFoodItem.foodItemId` would be nulled.

**Nutrition of a recipe:**

- Each ingredient's nutrients come from `food.<x>PerServing × grams / defaultServingWeightGram`. Micronutrients come from the `Nutrient` table on the same basis.
- The recipe stores totals ÷ portions as its per-serving values, and its micronutrients as `Nutrient` rows per portion.
- Values are computed on the server when the recipe is saved. That keeps one nutrition implementation, shared with the MCP server later.

**Names:**

- A name must be unique among the owner's current foods and recipes (case-insensitive). The editor says so before saving.
- A recipe may share a name with a shared catalogue food. Other users never see it.
- Phase 4 keeps a clash from pulling the recipe into ordinary logs.

---

## Phase 1: server

1. **Migration**, as above, with SQL tests on a disposable database:
   - per-owner names, and archived versions don't clash
   - another user can't read your recipe or its ingredients
   - a catalogue merge repoints ingredients
2. **Routes** under `/api/protected/user/`:
   - `foods`: create and edit a custom food, and archive it. Fields:
     - name, brand
     - the serving (unit plus grams or ml)
     - kcal, protein, carbs and fat
     - optional fibre, sugars, sat fat and sodium
     - extra servings
   - `foods/read-label`: read a label photo with the existing Sonnet label reader and return a pre-filled draft. Barcode digits come only from the decoding library.
   - `recipes`: create and edit (ingredients, portions, cooked weight), and archive.
   - `recipes/from-meal`: return a draft built from a meal's rows, plus `loggedAmountsAre: portion | whole`. If the logged amounts were one portion, ingredients × portions.
   - `recipes/{id}/log`: `{portions | servingId+amount | grams, consumedOn}`. Creates a resolved meal with one row.
   - **Meal → recipe portion:** a structured meal operation that replaces a meal's rows with one row of a recipe. This has to be a meal operation because agent meals are operation-owned.
3. **New foods get the existing treatment:**
   - an embedding, so search finds them
   - a category
   - an icon from the queue; a new version reuses the old icon
4. **Agent visibility:** private foods with `foodInfoSource = 'Recipe'` are left out of every agent and fast-route search until Phase 4. This uses FeatureFlag `recipes_in_agent`, seeded 'off'. Custom foods keep today's private-food behaviour.
5. **Types:** regenerate `types/supabase-generated.types.ts` (it is stale) and the app's copy.

## Phase 2: app, Foods tab and custom foods

- **The tab:** a native tab between Log and Goals. It has a Recipes | Foods switch, native header search, and a "+" menu (New recipe, New food, Scan label).
- **Food editor:**
  - uses the shared controls in `components/Themed.tsx`, with a header Save button through `useEditorOperation`
  - Scan label pre-fills the form
  - a gentle warning, not a block, when the macros don't add up at 4/4/9
- **Watermelon v9:**
  - `food_items` gains `privateToUserId`, `foodInfoSource`, `archivedAt`, `recipePortions`, `cookedWeightGram`, and an index on `privateToUserId`
  - a new `recipe_ingredients` table with an index on `recipeFoodItemId`
  - a migration, and `tests/watermelon-migration.cjs` extended
- **Sync:** pull the user's private foods (with servings and ingredients) on launch and when the app returns to the foreground, by `lastUpdated`.

## Phase 3: app, recipes

- **Recipe editor:**
  - name, portions, optional cooked weight
  - ingredient rows with the existing `FoodPortionEdit` and swipe to delete
  - Add ingredient: catalogue search plus your foods
  - live totals per portion and for the whole recipe
- **Recipe detail:** ingredients, macros, and Log with a portion stepper for the selected day.
- **Log screen:**
  - long-press → "Add as recipe" (or "Open recipe" if the meal is already one recipe log)
  - the editor opens with the meal's rows and asks "These amounts were: one portion / the whole recipe"
  - after saving it offers "Change this meal to 1 portion?" (fixes 30365 and 30388)
- **Recipe log row:** one icon, with "1.5 portions". The food detail shows the portion picker (portions / whole recipe / grams), the foods in it scaled to the logged portion, and "Edit recipe".
- **Add-food screen:** a "Mine" section listing your recipes and foods, searched locally.

## Phase 4: agent

1. **Owner-only candidates:**
   - In parallel with the existing prefetch, run the blended catalogue search over the user's current private foods only.
   - Matches above a threshold are added to the first turn as "yours · recipe · 12 portions · portion serving #…".
   - With no match, the prompt is unchanged.
2. **Recipe check (like `historyCheck`):**
   - An item that uses a recipe passes only if Jev confirms the text refers to that recipe. The check works in any language, with no keyword rules.
   - "1.5 portions of my chili" passes. "Pasta at Olive Garden" with a "Chicken pasta" recipe fails, and the agent uses the catalogue food.
3. **Fast text route:** the user's foods are candidates (marked mine), and a recipe pick goes through the same check.
4. **Photos without text never use a recipe in v1.**
5. **Chat requests** ("create a recipe for this, 12 portions"):
   - The agent logs the meal and returns a suggestion: `{name, portions, loggedAmountsAre}`.
   - The app shows a pre-filled "Save as recipe?" banner.
   - The agent never writes a recipe itself.
6. **Evals.** New cases:
   - a recipe by name
   - portions
   - half a portion
   - a generic word that overlaps a recipe name
   - a recipe named like a shared food
   - an archived version is never used
   - another user's recipe is invisible
   - a recipe request in chat

   Then the full eval (~$1.30) before the flag goes from your ID to 'all'.

## Phase 5: MCP and web

- MCP: `list_recipes` and `get_recipe` now. Logging a recipe comes with the meal write tools.
- Web log: works unchanged, because a recipe log is one food row. A read-only foods page can come later.

## Open (later)

- Nested recipes.
- Sharing a recipe with another user.
- A recipe's ingredients as a group inside a meal ("my smoothie without the banana" still uses history groups).
- "Log Again Now" copies `publishedRevision`/`logicalItemId` and uses `getUserId()`. Tidy this when the Log screen is touched in Phase 3.
