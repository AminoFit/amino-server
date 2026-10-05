# Food data sources: how to improve them

Covers the meal agent and app search on `main` (`/Users/seb/Documents/GitHub/amino-server-main`). The facts below come from production with read-only queries on 1 Oct 2026.

## Where we are

**Lookup order when a food isn't in the catalogue** (`src/mealResolution/foodSources.ts`):

| Step | How | Cost |
|---|---|---|
| Catalogue (14,129 shared foods + the user's own) | trigram + embedding (`evidence.searchFoods`) | 0.5–0.7 s today, mostly slow SQL (see `food-search-plan.md`) |
| USDA by name | local `UsdaFoodItemEmbedding` (470k names + embeddings) → **live FDC API** `GET /fdc/v1/foods` for nutrients and portions | a network call per lookup; FDC rate limit about 1,000 requests/hour per key |
| USDA by barcode | **live FDC API** `foods/search` with the GTIN, then `GET /foods` | two network calls |
| Open Food Facts | **barcode only**, live `api/v2/product/<gtin>` | one network call, 5 s timeout |
| Web | cited web search (Exa) for a decoded barcode nobody knows, or when asked | 6–20 s |

**What the catalogue is made of** (live foods):

| Source | Foods | Created in the last 14 days | With GTIN |
|---|---|---|---|
| USDA | 8,851 | 22 | 7,171 |
| NUTRITIONIX (legacy) | 2,802 | 0 | 167 |
| GPT4 (legacy, model-estimated) | 1,187 | 4 | 81 |
| FATSECRET (legacy) | 1,185 | 2 | 26 |
| AgentEstimate | 58 | 3 | 12 |
| Online (Open Food Facts / web) | 41 | 6 | 13 |
| Label (user photo) | 6 | 6 | 4 |

**What the agent's tool calls show** (the 30389 popcorn run, typical of a missing branded food):
1. `findFood` (catalogue only)
2. `findFood` again with `includeSources: true` (3.4 s)
3. `addFood` → `possible_duplicates`
4. `addFood` again with `sameAs`

That's **four tool calls and three model turns** to add one USDA product, at about 4–7 s per model turn.

## Proposals, by impact

### 1. Keep USDA locally instead of calling the API (speed, reliability)

FoodData Central publishes full downloads: Branded, Foundation, SR Legacy and FNDDS as CSV/JSON, with Branded updated monthly. We already store names and embeddings for 470k of them; store the rest too.

- **New tables**, filled by a monthly import script:
  - `UsdaFood (fdcId, dataType, name, brand, brandOwner, gtinUpc, servingSize, servingUnit, householdServing, publishedAt)`
  - `UsdaNutrient (fdcId, kcal, protein, carb, fat, fiber, sugar, satFat, sodium, …)`, per 100 g
  - `UsdaPortion (fdcId, name, amount, grams)`
- **Barcode lookup becomes a local index query** on `gtinUpc` (normalized to GTIN-14), replacing `searchUsdaBranded` + `getUsdaFoodsInfo`: two network calls become one indexed read.
- **A name match comes with nutrients straight away**, so `findFood` can return complete USDA candidates in its first answer (see 4).
- Add a trigram index on the USDA name and brand, so USDA gets the same text + meaning blend as the catalogue.
- Keep the live API only as a fallback for products newer than the last import.
- **Size:** about 470k rows of nutrients is a few hundred MB, which is fine in Postgres. Look at `halfvec` for the embeddings at the same time (it halves the index, which also helps the cold-start problem).

### 2. Open Food Facts: keep it, and use it better

**a. Fix the parser** (`offByGtin`, `foodSources.ts:202`):
- **Per-serving-only products:** when `*_100g` is missing but `*_serving` and the serving grams exist, derive per-100 g instead of rejecting the product (it currently falls through to web search).
- **Energy check:** reject or flag a product when calories differ from 4·protein + 4·carbs + 9·fat (+ 7·alcohol) by more than about 20%. That catches kJ/kcal mix-ups and typos before a bad record becomes a catalogue food.
- **Single-serve packs:** with no labelled serving, use `product_quantity` when it's small (≤ 100 g/ml) rather than 100 g.
- **Explicit energy units:** read `energy-kj_100g` when present, and treat `energy_100g` as kJ only when `energy_unit` is kJ or missing.
- Take the product name in the user's locale (`product_name_<lang>`) when it exists.

**b. Optional: a local barcode index from the Open Food Facts dump.**
- Open Food Facts publishes full and daily delta exports. Import products that have a GTIN, complete nutrition, and a country in our markets (US/UK/CA/…), a few hundred thousand to about 1M rows, into `OffProduct (gtin, name, brand, per-100 g nutrients, serving, package, completeness, lastModified)`.
- Barcode lookups become instant, it works when their API is slow or rate-limited (about 100 product reads/minute), and it adds **branded name search**, which their live API can't serve (about 10 searches/minute).
- **Licence:** ODbL. Internal use and showing values with attribution ("Data: Open Food Facts") is fine. Publishing a derived database would trigger share-alike, so don't expose the mirror as a dataset.

### 3. One quality gate for every source

Add one `validateSourceFood(food)`, used by USDA, Open Food Facts, web, label and agent estimates before `createFoodFromSource` writes anything:

- the energy check above;
- the serving is greater than 0, not larger than the package, and plausible for the unit (a "1 cup" serving of 1 g is rejected, as the A1 audit already does for stored servings);
- macros are non-negative, and grams of macros don't exceed the serving weight;
- the source is recorded with `retrievedAt`, so stale external records can be refreshed.

Then a source order **per field, not per food**:
1. the user's label photo;
2. USDA Foundation / SR Legacy (for generic foods);
3. USDA Branded and Open Food Facts (for packaged foods, with matching GTINs preferred);
4. web;
5. estimate.

When two sources share a GTIN and differ by more than about 10%, keep the higher-priority one and record the disagreement for the admin dashboard.

### 4. Fewer agent turns: one `findFood` that returns everything

Today the agent needs a second `findFood` with `includeSources` to see USDA, then a duplicate round trip in `addFood`. Proposal:
- **`findFood` returns catalogue, local USDA and local Open Food Facts candidates in one answer**, each labelled by source and complete with nutrients and servings. That's possible once 1 and 2b are local.
- **Duplicates are resolved in code where it's certain:** the same GTIN, or the same normalized brand + name + serving. `addFood` then attaches to the existing food without asking the model. Only true near-matches go back to the model.
- **The catalogue absorbs what's used:** a source food becomes a catalogue food the first time it's picked (as now), so the next lookup is a catalogue hit.
- **Expected:** the popcorn path drops from 4 tool calls / 3 model turns to 2 calls / 1–2 turns, saving about 5–15 s per missing branded food.

### 5. Clean up the legacy catalogue

- **GPT4 (1,187 foods):** model-estimated nutrition from the old pipeline. Mark them as estimates (like `AgentEstimate`) so search ranks real sources above them and the agent prefers a sourced food. Re-source them in the background: for each, look for a USDA/Open Food Facts match (by GTIN when there is one, else name + brand). When a match passes the quality gate, make it the new version (`previousVersionId`) so past logs keep their old values.
- **NUTRITIONIX (2,802) and FATSECRET (1,185):** check both providers' terms on keeping copies of their data. Some API tiers allow only time-limited caching and require attribution. If storing isn't allowed, re-source them the same way and archive the originals.
- **Duplicates:** with GTINs on 7k+ foods, run a one-off pass merging foods that share a GTIN (keeping the oldest ID and redirecting new logs), plus a name + brand + nutrition near-duplicate report for review.

### 6. Fill the coverage gaps deliberately

- **Restaurant and chain foods** (Chick-fil-A, Starbucks): USDA has few. Today these go to web search (6–20 s) or estimates. Better: when a chain item is first found on the web with a citation, it becomes a catalogue food (already true). Add a `chain` field and an "official nutrition page" source type, so these get high trust and their own ranking. A curated import of the top chains' published nutrition tables is a later option if usage shows it's worth it.
- **Home recipes and dishes:** USDA FNDDS (part of 1) covers mixed dishes ("chicken stir fry", "lasagna") with portions. It's a better default than model estimates.
- **Non-US products:** Open Food Facts (2b) is the main answer.

### Not worth adding

- **Fruityvice:** about 40–50 fruits, per 100 g, five nutrients, no portions. USDA Foundation/SR Legacy already covers every fruit with full nutrients and portion weights.
- **Wger:** its ingredients are largely imported from Open Food Facts, so they duplicate data we already reach directly, and the workouts are irrelevant.

## Order of work

1. Open Food Facts parser fixes + the shared quality gate (2a, 3). Small, and stops bad records now.
2. The local USDA import with nutrients, portions and GTIN, replacing the live FDC calls for barcodes and name matches (1).
3. `findFood` returning all local sources in one answer, plus deterministic duplicate resolution (4). This depends on 2.
4. Legacy catalogue clean-up: mark estimates, re-source in the background, merge GTIN duplicates (5).
5. Optional: the Open Food Facts local mirror (2b), and chain-food trust and FNDDS defaults (6).

## How we'll know it worked

The admin dashboard / `MealRun` should show:
- fewer tool calls and model turns per resolved item;
- web-search use and estimates going down;
- external API errors and timeouts near zero, because they're no longer on the hot path;
- quality-gate rejections, with the reasons.

Add a small eval set: 30 barcodes, 30 generic foods, 20 chain items and 20 non-US products, each with an expected food and calories within ±10%. Run it before and after each step.
