# Barcode photos: investigation and fix plan

Production runs `main`, which lives in `/Users/seb/Documents/GitHub/amino-server-main` (the meal-operation pipeline in `src/mealResolution` and `src/mealOperations`). It does not run this checkout's `codex/model-cleanup` branch. All code paths below are in `amino-server-main`. The evidence was gathered from production with read-only queries, plus the stored photo.

## What happened: message 30389, 30 Sep 2026, 8:51pm ET

The photo shows only the back of a pink bag with barcode `850241008835`. There is no text and no other food.

| | Attempt 1 (95 s, failed) | Attempt 2 (51 s, "succeeded") |
|---|---|---|
| Barcode decode + lookup | Not in the catalogue. Found in the barcode database and created food **15312, trü frü raspberries in white & milk chocolate, 28 g / 90 kcal**. Correct. (13.9 s) | Catalogue hit, food 15312 (1.3 s). Correct. |
| First look at the photo (vision) | Named the bag "**Siete Grain Free Mexican Wedding Cookies**", detail: "unopened bag with barcode 850241008835" | Named it "**LesserEvil Himalayan Pink Salt Popcorn**", detail: "identified by barcode (850241008835)" |
| Barcode route | Accepted, because 1 visible item ≤ 1 barcode | Same |
| Coverage check | "trü frü" doesn't cover "Siete cookies", so `missing_visible_food` | "trü frü" doesn't cover "LesserEvil popcorn", so `missing_visible_food` |
| Repair agent | Told to "find and log" the cookies. Created food 15313, then ran out of time (`Delay was aborted`), so the whole operation was retried | Told to "find and log" the popcorn. Created food 15314 and published **2 items** |

The result was 15312 (correct, 90 kcal) plus 15314 (a phantom 120 kcal of popcorn). It took 3 min 13 s, 19 model calls and about $0.07. The right answer was ready 14 s into attempt 1 and 1.3 s into attempt 2.

The vision model gave a different invented product on each look (Siete cookies, Siete tortilla chips, LesserEvil popcorn, and Hu in a repair look). It even claimed to have identified the product "by barcode". Gemini cannot look up a GTIN. It guessed from the pink packaging and the printed digits.

This is the **only barcode-route meal recorded in `MealRun` so far, and it failed**. Message 30390, two minutes later (3 photos of the same product: front, label, barcode), never took the barcode route at all. The route needs every photo to decode a barcode. So it went to the agent instead: 68 s and 10 model calls for one packaged product.

## Root causes

1. **The barcode result is overruled by vision.** `barcodeProposal` returns `checked:false` (`src/mealResolution/resolve.ts:312-320`). The worker then runs `compileCheckedMealPlan(..., {secondLook:true})` (`src/mealOperations/worker.ts:249`), which compares the plan with the first look's names (`missingFromVisibleList`, `src/mealResolution/historyCheck.ts`). A deterministic GTIN match is treated as a guess and checked against a model's guess.
2. **The first look invents product identities.** The `LIST` prompt (`src/mealResolution/coverageCheck.ts`) asks for "its product name if readable", but it never tells the model to stop guessing, and it runs with minimal reasoning. It knows nothing about the decoded barcodes, so it names packages from their colour and design.
3. **The repair prompt treats the hallucination as fact.** For `missing_visible_food: <foods>`, the prompt says "find and log each (search, create if needed) … unless a logged food truly covers it" (`resolve.ts:122`). Nothing tells the agent that the barcode product **is** the package in the photo.
4. **Barcode context only reaches the agent if the product is already in the catalogue.** `barcodeMatches` contains catalogue hits only (`resolve.ts:310`). A new GTIN reaches the agent as bare digits.
5. **The decoder reads only one barcode per photo.** `decodeBarcode` returns its first hit (`src/mealResolution/barcode.ts:89-125`). `locateBarcodesWithFlash` already returns every barcode box, but decoding stops at the first one that reads. A photo with two products logs one, or falls to the agent.
6. **The routing gates are crude counts.** The barcode route needs `reads.length === photos.length` (every photo decoded, one each) and `visible.length <= barcodes.length`. Photos of the same product from several angles, two barcodes in one photo, or a barcode next to a plate of food all fall through to the slow agent, or worse, pass the gate with the wrong picture of the meal.
7. **A repair that runs out of time restarts the whole operation.** Attempt 1's repair hit the 90 s deadline and became `resolution_failed`. The retry 30 s later ran the hallucination path again.

## Design: barcode products are locked; only the rest of the meal is resolved

The principle: **a decoded and resolved barcode is a fact, not evidence for a model to weigh.** Vision and the agent never identify a package that has a decoded barcode. They only:

- find what else is in the photos, and
- read portions from the user's text.

```
photos ─┬─► [1] decode ALL barcodes in every photo ──► distinct GTINs ──► [2] resolve each GTIN
        │       (multi-read + located boxes;               (catalogue → USDA → OFF;
        │        report boxes that didn't decode)           unresolved = flagged, not guessed)
        │
        └─► [3] scene check, in parallel (one vision call). It never names a package unless the name is legible:
                 • packages with a visible barcode, per photo (count only)
                 • packages with no visible/decodable barcode (legible text only, else "unlabelled package")
                 • other food being eaten (plates, fruit, drinks the text mentions…)
                 • whether several photos show the same package (front / label / barcode)

[4] reconcile:  locked items = one per distinct resolved GTIN (dedupe across photos)
                leftovers    = other food + unidentified packages + undecoded barcode boxes
                               + unresolved GTINs + whatever the user's text adds

[5] route:
   A. no text, no leftovers              → publish locked items now (labelled serving). No agent.
   B. text only changes the amount        → locked items with the amount from the text
      ("half of this", "2 of these")        (Jev or a small parse; agent if Jev isn't confident)
   C. leftovers exist                     → locked items + resolve ONLY the leftovers
                                            (photo fast route / Jev first, agent if not confident).
                                            The agent sees lockedProducts as facts and cannot rename,
                                            replace or duplicate them.
   D. GTIN decoded but in no database     → agent: "barcode X on photo N is not in any database;
                                            identify it ONLY from legible label text, create the food
                                            with gtin X, or ask." Never from appearance.

[6] final check: the coverage check compares the plan with the scene check's leftovers only;
                 the backend enforces that every locked GTIN is in the plan, unchanged.
```

### Cases this has to handle

| Photo(s) / text | Expected result | Route |
|---|---|---|
| One barcode, nothing else (30389) | 1 item: the barcode's product | A |
| Front, nutrition label and barcode of one product (30390) | 1 item (same GTIN or same-package views, deduped) | A |
| Two different products, both barcodes visible in one photo | 2 items | A |
| Barcodes of 2 products across 2 photos | 2 items | A |
| The same barcode in 2 photos | 1 item, unless the text says 2 | A |
| Barcode + "half of this" / "2 of these" | 1 item, amount from the text | B |
| Barcode + "and a banana" | locked product + banana | C |
| Barcode of a yogurt + a plate of food in the same photo | locked yogurt + the plate's foods | C |
| A decoded barcode + a second package with its barcode facing away | locked product + the second package from legible label text, else a question or an estimate | C |
| A located barcode box that won't decode (blurry) | not dropped: counted as a leftover package; read the label or ask | C |
| A barcode that's in no database | food created from legible label text with that GTIN, or a question | D |
| A non-food barcode (book, shipping label) | no database hit + nothing edible in the scene check → "no food found", not a guess | D |
| Text that explicitly excludes the scanned product ("ate the other one") | the agent may mark the locked item omitted, but only by quoting the user's words | C |

The default amount is **one labelled serving per distinct product**. A visible count of two identical packages is only a hint, because people photograph a multipack and eat one. The user's text wins.

## Changes, in priority order

### P0: stop vision overruling a barcode (fixes 30389 directly; small)

1. **Barcode items skip the vision coverage check.** Barcode proposals are returned with `checked:true` when there's no text and the scene check found no leftovers. Until the scene check exists, use this interim rule: when every first-look item is a package and the photo count matches. `compileMealPlan`'s structural checks (portions, and barcode → GTIN coverage at `compile.ts:152`) still run.
2. **The coverage check never contradicts barcode evidence.** In `compileCheckedMealPlan`, packaged-product entries from the first look for a photo with a resolved barcode count as covered. Send the locked products to `missingFromVisibleList` labelled "identified by barcode; covers the package in photo N".
3. **Softer repair wording** (`resolve.ts:122`): `missing_visible_food` is a second opinion. *"Log each unless a logged food covers it, or it is a packaged product already identified by barcode; then return the same plan."*
4. **Don't restart after a repair timeout.** When a repair runs out of budget and the original plan passed `compileMealPlan`, publish the original plan (it was only flagged by the soft coverage check) rather than throwing `resolution_failed`.

### P0: locked barcode products (the design above)

5. **Decode every barcode in a photo.** Change `decodeBarcode` to `decodeBarcodes(photo) → {reads: BarcodeRead[], undecodedBoxes: Box[]}`:
   - a whole-image multi-read (ZXing's multiple-barcode reader, or zxing-wasm `readBarcodes`, which returns all);
   - always call `locateBarcodesWithFlash` in parallel (about 1–2 s), then decode a crop of each box that the whole-image read didn't cover;
   - boxes that won't decode are returned, not dropped. Dedupe GTINs per photo, then across photos.
6. **Resolve every GTIN up front, on every route.** As soon as a GTIN decodes, run the catalogue → USDA → OFF lookup (`foodSources.barcodeSources` + `createFoodFromSource`). Do it for every meal with a barcode (text, repairs, multiple photos), not just barcode-only. Run the lookups in parallel. A GTIN that resolves nowhere is marked `unresolved`; nothing guesses it.
7. **Replace the first look with a scene check on photos that contain barcodes.** It's one vision call that runs in parallel with decoding, so it adds no wall time. It returns `{barcodePackages:[{photo,count}], otherPackages:[{photo,legibleText|null}], otherFoods:[…same shape as VisibleFood…], samePackageViews:boolean}`. It needs no product names to exclude the barcoded packages, so it can start before resolution finishes. Prompt rule: *"Never name a packaged product unless its name is printed and legible in the photo; otherwise call it 'unlabelled package'. Never infer a product from a barcode's digits or from packaging colour."* Photos without a barcode keep the current first look.
8. **Reconcile and route** (step 4–5 above) in `resolveMeal`. This replaces the `barcodeOnly` / `reads.length===list.length` / `visible.length<=barcodes.length` gates. A mismatch tells us something was missed: more barcode packages counted by the scene check than GTINs decoded on that photo becomes an unidentified-package leftover.
9. **The agent gets `lockedProducts` as facts.** The prompt carries `lockedProducts:[{photoIds, gtin, foodId, name, brand, servingLabel, kcalPerServing}]` and `leftovers`, plus this rule: *"lockedProducts are verified from decoded barcodes and are already in the plan. Do not rename, replace or add another item for them. You may change only their amount, and only from the user's words. Resolve only the leftovers."* Pre-fill the locked items in the proposal, so the agent's job is just the leftovers.
10. **The backend enforces the lock** in `compileMealPlan`:
    - every locked GTIN appears exactly once, with its own food ID (extending today's `barcode_not_covered` at `compile.ts:152`);
    - an item may not be another packaged food for the same photo unless that photo had an `otherPackages` entry;
    - omitting a locked item needs an omission component that quotes the user's text.
11. **Mixed photos use the photo fast route for the leftovers.** For C with no text, run `photoFastProposal` (Jev) on just `otherFoods` and merge the result with the locked items. The agent runs only if Jev isn't confident, or a leftover is an unlabelled package or an unresolved GTIN.

### P1: barcode source coverage

12. External barcode lookup is now USDA, then Open Food Facts, then web (`foodSources.ts:231-236, 366-369`). The old pipeline also tried Nutritionix and FatSecret by UPC (`FoodDbThirdPty/fatsecret/getFatSecretFoodByUPC.ts` still exists). Add FatSecret before the web fallback. It's cheaper and more reliable than a cited web search for US packaged foods. Check that its keys are still valid first.
13. When one photo is a nutrition label of a locked product (30390-style), check the label against the database record using the existing `label_identity` claim path, and prefer the label when they disagree.

### P2: tests, evals, telemetry

14. **Eval fixtures, one per row of the cases table.** Start with the real photos from 30389 (1 item, food 15312, no agent turn) and 30390 (1 item). Add constructed photos for two barcodes in one frame, a barcode plus a plate, and a barcode facing away.
15. **Unit tests:**
    - barcode-only with an invented first look/scene name gives 1 item and no coverage call;
    - two GTINs in one photo give 2 items;
    - the same GTIN in two photos gives 1 item;
    - an undecoded box becomes a leftover;
    - barcode + "half of this" gives half a labelled serving;
    - an agent plan that renames or duplicates a locked product is rejected;
    - a repair timeout after a structurally valid plan publishes the original.
16. **Admin dashboard:** record route A/B/C/D per run, locked count, leftover count and undecoded boxes. Flag any run where a locked product was followed by a repair.

### Latency targets

| Route | Today | Target |
|---|---|---|
| A, catalogue hit | 51–95 s (30389); 68 s (30390) | about 3–5 s (decode + scene check in parallel; resolution is about 0.1–1 s) |
| A, new GTIN | — | about 5–14 s (USDA/OFF lookup and food creation) |
| B | agent, 50 s+ | about 4–6 s with Jev; agent only if it isn't confident |
| C | agent, 50 s+ | photo fast route time for the leftovers only; the agent's job is smaller when it runs |

**Option to consider later:** publish route A immediately, before the scene check returns. If the check then finds leftovers, append them as a new meal revision (`MealRevision` already exists). That gives about 1–2 s for pure barcode scans at the cost of a meal that can change after it first appears. It isn't needed for the first version.

### Data cleanup (needs your go-ahead; nothing has been changed)

- **LoggedFoodItem 52494** (message 30389, LesserEvil popcorn, 120 kcal) is a phantom. Soft-delete it. **52493** (trü frü, 90 kcal) is correct.
- **Message 30390** (8:53pm, 3 photos) also logged trü frü (52492, food 15312). If that was a re-log because 30389 was slow, one of 52492/52493 is a duplicate.
- Foods **15313** (Siete cookies) and **15314** (LesserEvil popcorn) are real USDA foods that the repair agent created. They're harmless in the catalogue and can stay.

## Suggested order of work

1. P0 items 1–4: a small diff that stops this exact failure today.
2. Items 5–6 (multi-decode, resolve on every route) and 9 (`lockedProducts` in the agent prompt). This alone means the agent can't invent a product for a barcode.
3. Items 7–8, 10–11 (scene check, reconcile and route, backend lock, fast route for leftovers), together with the eval fixtures in 14.
4. P1 sources and label check, then dashboard telemetry.
