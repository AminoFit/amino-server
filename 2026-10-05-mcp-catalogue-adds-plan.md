# MCP: agents add catalogue foods from USDA, Open Food Facts or a barcode

**Date:** 2026-10-05 · **Status:** built 2026-10-05, migration applied, flag on for the owner; owner test next · **Scope:** amino-server (MCP tools, food sources, one migration). No app change.

## Why

When `search_foods` finds nothing, an agent's only option today is `create_food`: a private custom food with the facts the agent typed. For a packaged or USDA food that's the wrong place. Nobody else gets it, and the agent wrote the nutrition itself. The app already adds these foods to the shared catalogue when someone scans a barcode (`foodForBarcode`) or picks a USDA result (`foodFromUsda`). Agents should be able to do the same, given a pointer to a source.

## Owner decisions (2026-10-05)

- This changes the earlier rule "agents never write the shared catalogue" (2026-10-03 plan). The rule still holds for nutrition facts: the agent only gives a key (a USDA FDC id or a barcode), and the facts come from the source through the app's checks. At worst a correctly labelled real product is added.
- **No "Let agents make changes" switch.** That switch protects the user's own data, and this tool doesn't touch it. Logging the food still goes through `log_meal`, which stays behind the switch.
- **USDA and Open Food Facts only, never the web search.** The digits are typed by an agent, not read by the camera. A web search of wrong digits could store a different product under that barcode. A source record has to carry exactly that barcode (or be that FDC id). This also keeps the answer to a few seconds.
- **Rollout and kill switch:** FeatureFlag `mcp_catalogue_adds` (owner only first). Rollouts live in the FeatureFlag table, not env vars.
- **Record who added or changed each food** (user, agent client and agent name), so a bad agent's changes can be found and undone.

## What exists

- `foodForBarcode` (`src/foodSearch/barcodeLookup.ts`): own or shared food with the barcode (`foodForGtin`, including package barcodes) → `barcodeProduct` (USDA, Open Food Facts, then web) → `createFoodFromSource`.
- `barcodeSources` (`src/mealResolution/foodSources.ts`): USDA branded record with that exact GTIN, else Open Food Facts with the same code and the brand-prefix check (`offBrandFits`). No model or web search involved apart from that check.
- `createFoodFromSource`: the meal agent's duplicate check (8 nearest foods, Jev at ≥ 90 % or fail closed), then:
  - `create_catalogue_food` (identity and barcode advisory locks), or
  - `enrich_catalogue_food` on the existing food (fills an empty barcode, empty optional nutrients, new servings, an alias; never overwrites macros; a disagreeing energy density is recorded as a `FoodItemConflict` and changes nothing), or
  - `supersede_catalogue_estimate` when the existing food is an estimate (backed up first),
  - and a package barcode (`FoodBarcode`) when the same product comes in another size.
- `foodFromUsda` (`src/foodSearch/usda.ts`, the app's USDA pick) calls `create_catalogue_food` directly, without the duplicate check.
- `searchUsda`: local USDA embeddings, then FDC for details.
- MCP `run()` (`src/mcp/tools.ts`): 120 calls a minute per user, the `McpRequest` row (with `clientId`, `targetIds`), and `agentName(authInfo)` for the agent's display name.

## Design

### Tool: `add_catalogue_food`

Input: exactly one of
- `barcode`: digits (8, 12, 13 or 14, or a 6-digit UPC-E). `normalizeGtin` rejects a bad check digit.
- `usdaId`: an FDC id.
- `url`: a USDA FoodData Central page (`fdc.nal.usda.gov/food-details/<id>` or `…/fdc-app.html#/food-details/<id>`) or an Open Food Facts product page (`<any>.openfoodfacts.org/product/<code>`), parsed into one of the above. Any other URL is an input error that says which pages work.

Steps:
1. **Barcode:** `foodForGtin` first. If it's already known, return `found` with no change and no source call. Otherwise `barcodeSources` (USDA, then Open Food Facts), then `createFoodFromSource`. This is `foodForBarcode` with a new `web: false` option, so it's one code path.
2. **USDA id:** the catalogue food with that `externalId` (source USDA) if there is one. Otherwise a new `usdaSource(fdcId)` on `createFoodSources` (the existing `fromUsda` mapping, which refuses records missing a macro or a weight), then `createFoodFromSource`. It gets the same duplicate check as the meal agent. The record's barcode is kept only when USDA's own record lists it (`gtinUpc`), never one from the agent.
3. Queue the icon (and category) for a new food, as `foodForBarcode` does.
4. Write the provenance row (below).

Output, using the `search_foods` card shape (id, name, brand, servings, per-100 g and per-serving nutrition, `servingId` for a package barcode):
- `found`: the food was already in Amino (it may have been enriched).
- `added`: a new shared food.
- `unknown`: no source has it, or the duplicate check wasn't sure (`possible_duplicates`, failing closed). The message tells the agent to search by name, ask the user, or use `create_food`.
- Invalid input (bad check digit, unrecognised URL, both or neither key) is an input error.

Timeout 20 s. The tool is annotated as a non-destructive write.

### Search: USDA results in `search_foods`

`scope: "usda"` returns `searchUsda` results with their `usdaId`, name, brand, serving and macros, marked as not in Amino yet. It only searches; adding is `add_catalogue_food`. Agents rarely know FDC ids, so this is how they get one.

### Provenance: `CatalogueAgentChange`

One row per catalogue change made through MCP:

| Column | |
|---|---|
| `id`, `createdAt` | |
| `userId` | the user whose agent asked |
| `clientId`, `agentName` | the OAuth client and its name ("Claude") |
| `foodItemId` | the food created or changed |
| `action` | `created` · `enriched` · `superseded` · `package_barcode` |
| `sourceKind`, `sourceRef` | `USDA` + FDC id, or `OpenFoodFacts` + GTIN |
| `changes` | the enrichment result (`added` list, conflict), or the new `FoodBarcode` id |
| `before` | for `enriched` and `superseded`: the food's row and serving ids before the change |

RLS on with no policies (server only). Indexes on `(userId, createdAt)`, `clientId` and `foodItemId`. A lookup that finds an existing food unchanged writes no row.

To capture `before`, the tool reads the matched food just before enriching. `createFoodFromSource` already returns which food it matched. Nothing here changes the meal agent's behaviour.

`FoodItem` already stores `userId` for a created food (`messageId` is null for MCP), but the table is what covers enrichments and points at the agent.

### Limits

- The 120 calls a minute in `run()` stays.
- Its own limit, counted from `CatalogueAgentChange`: **5 a minute and 50 a day per user** of `created`/`enriched`/`superseded`/`package_barcode`. Lookups that only find an existing food don't count, since they cost nothing.
- It isn't in `CHANGE_TOOLS`, so it doesn't use the user's change budget or need their switch.
- The flag (`userFlagEnabled("mcp_catalogue_adds", userId)`) is checked first. When it's off, the tool says agents can't add catalogue foods yet and to use `create_food`.

### Repair and rollback

Not built now. This is the procedure when needed, keyed by `clientId` or `userId` and a time range:
- `created`: archive the food (`archivedAt`). If other users have logged it, merge it into the right food instead, as in the catalogue audits.
- `enriched`: put back the fields named in `changes` from `before` (barcode, filled nutrients, alias) and delete the servings it added, if nothing logged them.
- `superseded`: restore from `CatalogueAuditBackup`.
- `package_barcode`: delete the `FoodBarcode` row.

### Instructions (`MCP_INSTRUCTIONS`)

Order when the user names a food Amino doesn't have:
1. `search_foods`
2. `search_foods` with `scope: "usda"`, or a barcode or an Open Food Facts or USDA page the user or the agent has
3. `add_catalogue_food`
4. `create_food` last, for foods no database has: homemade food, or a label the user reads out.

Barcode digits must come from the package or the user, never guessed. Check the returned name and brand against what the user said before logging.

## Tests

`tests/mcp-catalogue-adds.test.cjs`, with injected sources:
- A known barcode returns `found`, makes no source call and writes no row.
- An unknown barcode with a USDA record returns `added` with the row, and the icon is queued.
- Open Food Facts only: `added`. A record with a different code, or a brand from another company, gives `unknown`.
- The web lookup is never called (a `deps.web` that throws).
- A bad check digit is an input error. Unrecognised URLs are refused. Both USDA URL forms and Open Food Facts URLs parse.
- A USDA id already in the catalogue returns `found`. A new USDA id runs the duplicate check: an existing match is `enriched` (with `before`), and an unsure match is `unknown`.
- Limits: the 6th add in a minute and the 51st in a day are refused, and found-only lookups don't count.
- With the flag off, the tool refuses. With the user's switch off, the tool works.
- `search_foods` with `scope: "usda"` returns `usdaId`s and creates nothing.

Then one live run by the owner from Claude: a product missing from the catalogue by barcode, one by USDA page, and one already known.

## Order

1. Migration: the `CatalogueAgentChange` table and the `mcp_catalogue_adds` flag (owner). Apply it with the Supabase connector, then `supabase migration repair` (as for the MCP writes).
2. `foodForBarcode` `web: false`, `usdaSource(fdcId)`, and the URL parser.
3. The `add_catalogue_food` tool, its limits and provenance, plus `scope: "usda"` in `search_foods`.
4. Instructions text, tests, `npm run check`.
5. Owner test, then turn the flag on for everyone.

Later, optional: send the app's USDA pick (`foodFromUsda`) through the same duplicate check.

## Added 2026-10-06: barcodes no database has

An agent (Muse) asked for fairlife strawberry milk 14 fl oz (`00811620020435`): neither USDA nor Open Food Facts has it,
so the tool said `unknown`, and the agent looked the digits up on UPCitemdb itself to find food 4356, which had no
barcode. Now, when both databases miss, `add_catalogue_food` names the barcode with `nameBarcode` (UPCitemdb, Brave
listings), searches the catalogue by that name, and tries `attachBarcode` on the three closest shared foods (Jev ≥ 0.9
that the named package is exactly that food; a food with another barcode gets it as another package size). Mistyped
digits name another product, which no food is, so nothing is attached. A new food is still never created from the web
for an agent. Recorded as `sourceKind` `BarcodeName` (20261014110000).
