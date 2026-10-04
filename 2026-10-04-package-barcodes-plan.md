# Package barcodes: one food, several barcodes, each a package size

**Date:** 2026-10-04 · **Status:** server live 2026-10-04 (app part next) · **Scope:** amino-server (catalogue, meal agent, barcode lookup, MCP), amino-mobile (camera scan opens the package's serving)

## Why

Meal 30492 (owner, 2026-10-04): a scanned fairlife chocolate 2% milk, **14 fl oz bottle**, barcode `00811620020398`. Open Food Facts had it (250 kcal, 23 g protein per 414 g). The meal agent's duplicate check rightly found it is the same product as food 15321, which already carries the **8 fl oz** bottle's barcode `00856312002795`. A food holds one barcode, so `attachBarcode` refused (`food_has_another_barcode`), the plan check needs a scanned barcode on a logged food (`barcode_not_covered`), and the agent looped three times (~$0.41) until the meal failed (`missing_catalogue_food`).

Nothing was wrong with the data: one product sold in two sizes needs two barcodes. A barcode identifies a **package**, so it should point at a food and the serving that package is.

## Owner decisions (2026-10-04)

- A barcode points at a food and, when known, the package's serving ("bottle, 14 fl oz = 414 g"). Several barcodes per food (sizes, multipacks). The serving is optional: a barcode with no known size opens the food at its default serving.
- Generic (unbranded) shared foods carry no barcodes, as decided in `20261004090000_clear_generic_barcodes.sql`: a scan must find the branded product, not "dried mango".
- Fix the fairlife scan as part of this: re-run meal 30492 once deployed.

## Design

### Data

New table `FoodBarcode`:

| column | |
|---|---|
| `gtin` text PK | GTIN-14, as `FoodItem.gtin` today (one barcode, one product) |
| `foodItemId` int | the food (shared branded, or the user's own) |
| `servingId` int null | the package's serving; null when the size isn't known |
| `source` text | `catalogue` (moved from FoodItem.gtin), `off`, `usda`, `label`, `user`, `agent` |
| `createdAt` | |

- RLS: read like `FoodItem` (shared foods' barcodes, and the user's own foods'); writes server-only (agent tokens are read-only already).
- **No backfill (changed while building):** the table holds only the *other* barcodes; lookups read `FoodItem.gtin` and the table. Guessing existing barcodes' package servings from serving names would need a word list, so existing barcodes keep opening the default serving.
- `FoodItem.gtin` stays for now and keeps meaning "the main barcode", kept in sync by the server, so nothing that reads it breaks (the phone's mirror, admin pages, the 7 SQL functions). Retiring it is a later step.
- Uniqueness: a GTIN has one row, so one barcode can't point at two foods. The existing rule that a user's own food answers its barcode ahead of the catalogue's stays: user foods' barcodes live in the same table (keyed per owner via a partial unique index: one shared row per GTIN, one per user).

### Adding a size (the yup fix)

When the agent adds a source that carries a barcode and the duplicate check says it is an existing food that already has a different barcode:
1. **Same product?** The existing `sameProduct` / duplicate decision (unchanged) **and** energy per gram within 15% (here 60.4 vs 58.3 kcal/100 g). Otherwise it is a different product or recipe, and a separate food as today.
2. If yes: the package becomes a serving of the food (it already does: "bottle, 414 g") and a `FoodBarcode` row points the new barcode at it. No refusal, no loop.
3. `attachBarcode` (photo barcodes) follows the same rule instead of refusing every food that already has a barcode: Jev's "same product" check as today, plus the energy check when the barcode has a source record.

### Every lookup reads the table

| Where | Today | After |
|---|---|---|
| `catalogueFoodForGtin` (app camera via `/foods/barcode`, meal agent) | `FoodItem.gtin` | `FoodBarcode` (user's own first), returns food **and serving** |
| meal agent `findFood` with a gtin (`nearbyFacts` byGtin) | `FoodItem.gtin` | `FoodBarcode` |
| plan check `barcode_not_covered` (compile.ts) | item food's `gtin` equals the barcode | the barcode's food is an item (any of its barcodes) |
| `attachBarcode` | refuses if the food has a barcode | adds a size (above) |
| MCP `search_foods` with `barcode` | `catalogueFoodForGtin` | same, and the card's `usual`-style hint: `barcodeServing` (servingId, unit, grams) |
| `create_food` / Foods tab barcode (`saveCustomFood`) | sets `FoodItem.gtin` | also writes the user's `FoodBarcode` row |
| label draft (`labelDraft.ts`) | `FoodItem.gtin` | `FoodBarcode` |
| Open Food Facts brand check (`offBrandFits`, prefix neighbours) | `FoodItem.gtin` prefix | unchanged (main barcodes are enough for a company prefix) |

### App

- `/foods/barcode` returns `servingId` with the food; the camera result opens the food with that serving selected, amount 1 ("1 bottle (414 g)").
- The phone's mirror keeps `food_items.gtin` (main barcode) for instant offline scans; an extra barcode misses locally and is answered by the server, as any unknown barcode is today. Mirroring `FoodBarcode` is a later step if offline scans of second sizes matter.

## Fixing meal 30492

After deploy: run the agent's food step for `00811620020398` (it becomes a barcode of 15321 at the 414 g bottle serving), then re-run the meal (a new `create` operation for message 30492, or the app's retry). Expected: 1 bottle (414 g) of 15321, ~242 kcal at 15321's corrected values (58.3 kcal/100 g).

## Tests

- DB: `FoodBarcode` RLS (agent and other users can't write; a user sees shared and own rows), backfill picks package servings, unique GTIN.
- Unit: same-size check (fairlife 14 oz accepted at 60 vs 58; a 2x-density "same name" refused), lookup returns serving.
- Meal agent: a replay of meal 30492's tool calls with the new behaviour reaches a plan (no `barcode_not_covered`); the existing barcode tests (`meal-barcode.test.cjs`, `barcode-identity.test.cjs`) still pass.
- Live: scan `00811620020398` in the app (opens "1 bottle (414 g)"), and `search_foods(barcode)` for both fairlife codes return 15321 with their bottle serving.

## Order

1. Migration: table, RLS, backfill (backed up), server-only write function `add_food_barcode(food, gtin, serving, source)`.
2. Server: lookups read the table; adding a size in `createFoodFromSource` and `attachBarcode`; plan check; MCP and Foods tab writes.
3. Re-run meal 30492.
4. App: open the scanned package's serving (needs a phone build).
