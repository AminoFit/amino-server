# Catalogue data audit and food-adding pipeline plan

**Date:** 2026-09-26
**Status:** Part A (data audit) is scheduled for later. Part B (food-adding pipeline) is in progress.
**Scope:** the shared `FoodItem` catalogue (15,060 foods, 27,686 servings) and the path that adds new foods to it.

Every logged item ends up as a catalogue `FoodItem`. The catalogue is the lookup cache, so its quality decides meal accuracy. Web search is the last resort, and each web result becomes a food or enriches one.

The counts below come from a read-only pass over production on 2026-09-26. Re-run the same queries at the start of the audit, since the numbers will drift.

---

## Part A: data problems to fix in the audit

### A1. Servings that weigh about a gram per unit (1,328 servings)

Legacy imports stored a serving's size as its amount, in two forms:

- **Name restates the amount:** `355 ml` with `defaultServingAmount = 355` and `servingWeightGram = 355`, so one unit is 1 ml. 508 servings have this form.
- **Household unit with the size as the amount:** `1 cup` stored as 240 g for 240 units, so one cup is 1 g. Examples are Lifeway Peach Kefir (foods 15284 and 15285).

- **Impact:** the agent picks "1 × 355 ml" or "1 cup" and logs 1 g. Spindrift Orange Mango (food 13963) and Lifeway Peach Kefir failed the photo eval this way, on both Gemini and DeepSeek.
- **Guard in place since 2026-09-26:** `usableServing` (in `evidence.ts`) never offers these to the agent, so it logs by mass or by a sound serving. It also hides 1,412 servings with no weight or amount. That's 2,740 hidden servings in total. The guard only hides servings; the audit still has to repair the rows the app shows.
- **Cause:** legacy imports stored the USDA serving size (for example `servingSize 355, unit ml`) as both the name and the amount.
- **Fix:** keep the weights and change only how a serving is described.
  - Basis units (`ml`, `g`, `oz`): set `defaultServingAmount = 1`. "1 × 355 ml" is then 355 g.
  - Household units (`2 tbsp.`): strip the restated number from the name (`tbsp.`, amount 2).
  - First confirm how the app computes grams per unit (`servingWeightGram / defaultServingAmount`), so the displayed portion stays identical.
- **Check:** after the fix, none of these 508 servings yield under 5 g per unit when the name has no number.

### A2. Legacy GPT-estimated foods (1,305 foods, `foodInfoSource = GPT4`)

These were created by the retired gpt-4o pipeline from model estimates, with no citation.

- **Example:** food 15293 "Tuna Ceviche". It has 120 kcal per 37.8 g (317 kcal/100 g, about 2.5× typical ceviche), and its description says "canned tuna". Its one serving, "1/4 cup" = 37.8 g, made a half bowl log as about 556 kcal.
- **Fix:** re-verify each food against USDA, then cited web sources, starting with the most-logged foods (count `LoggedFoodItem` references).
  - Where a verified source agrees, mark the food verified.
  - Where it disagrees on energy density by more than 10%, the food needs replacing. The enrich function records the disagreement and never overwrites macros, so replacing needs a new supersede function (see B5 and decision 1).
- **Check:** every GPT4 food in the top 500 by usage is verified, superseded or retired.

### A3. Implausible nutrition (256 energy mismatches, 145 impossible densities)

- **Energy mismatch:** stated kcal differs by more than 25% (and more than 25 kcal) from protein×4 + carbs×4 + fat×9. By source: USDA 150, GPT4 42, Nutritionix 39, FatSecret 25.
- **Impossible density:** more than 902 kcal/100 g, or macros heavier than the food itself.
- **Fix:** alcohol, fibre and sugar alcohols explain some of these legitimately. Classify each with Jev or Flash using the food's facts, re-fetch the source for the rest, and supersede or retire.

### A4. Barcodes (280 GTINs shared by 2+ foods, 161 invalid UPCs)

- 575 foods share a UPC with another food. Sometimes it's the same product imported twice, sometimes the wrong size or variant.
- 161 `UPC` values aren't valid GTINs (bad check digit or length), so `gtin` stayed empty.
- **Fix:**
  - Same product: merge. Keep the most-logged food and repoint `LoggedFoodItem`, `Serving` and `FoodItemImages`.
  - Different products: clear the wrong barcode.
  - Then add a unique index on `FoodItem.gtin`. Barcodes should identify exactly one food; that was the earlier note about enforcing this at the food level.
- An existing spawned task covers the duplicate-UPC merge.

### A5. Duplicate foods by identity (195 groups, 505 foods)

- These foods have the same name and brand after ignoring accents, case and punctuation. That's the same identity key `create_catalogue_food` now enforces for new foods.
- **Fix:** use the same merge process as A4. A Jev check with facts (serving sizes and density) confirms each group is really one food before merging.

### A6. Serving hygiene

| Problem | Count | Fix |
|---|---|---|
| Null or zero serving weight (unusable) | 1,307 | Delete those no log references. Otherwise fill the weight from the source. |
| Named as a basis unit (`g`, `ml`, `oz`) | 6,431 | Mostly redundant with the gram basis. Keep `oz` and `fl oz` only where the weight is right. |
| Same name twice on one food | 687 | Dedupe, keeping the referenced serving. |
| Amount doubled in the name (`1 Cup (37g)`) | 286 | Clean the name (same class of bug as the "1 1 Cup (37g) (37g)" portion label). |

### A7. Icons (10,731 weak links)

- The old icon queue linked the nearest existing icon whatever the similarity, for example milk → lasagna (0.70).
- 10,731 links score below 0.8, and 5,760 below 0.75. 11 foods have no icon.
- The queue now reuses an icon only at similarity ≥ 0.8.
- **Fix:** re-check low-scoring links, most-logged foods first, with a cheap Flash vision check ("does this icon show <food>?"). Regenerate icons where it says no. The generation cost per icon needs estimating first (decision 3).

### A8. Foods that can't be logged by mass (319 weight unknown, 26 with no serving weight)

- **Fix:** fill from the source, or retire the food if nothing references it.

### A9. Brand repeated in icon descriptions

- Example: "Lala Lala 100 +Proteína …". The icon queue prepends the brand even when the name already contains it.
- **Fix:** a one-line code change, plus a data update to the affected descriptions.

### Audit method

1. **Report first:** a read-only report script repeats this pass and lists examples for each problem.
2. **One migration per problem:** each records before and after counts and copies changed rows to a backup table so it can be reversed.
3. **Never overwrite macros without a cited source.** Repoint logs only through a function that writes an audit row.
4. **Order:** A1 (wrong portions in the app; the agent is already guarded) → A6 → A2 (by usage) → A3 → A4 and A5 → A7 → A8 and A9.
5. **After each step:** re-run the photo, text and history evals.

---

## Part B: improving the food-adding pipeline

### Current flow

1. **findFood:** searches the catalogue by name (trigram and semantic search, any language) and by decoded barcode.
2. **Sources:** searched only when the catalogue has nothing, or when the agent asks again for the same food.
   - With a barcode: the USDA record with that exact barcode first.
   - Without one: USDA by name.
   - Cited web search only as the last resort.
   - A label in the photo is already a complete source and never triggers the web.
3. **addFood:** runs the duplicate check.
   - It compares the source with the 8 nearest catalogue foods by embedding, using hydrated facts.
   - A matching barcode means the same product. A different barcode means a different product.
   - Otherwise it needs a Jev decision at 90% confidence or higher, and it fails closed when unsure.
   - The result is either `create_catalogue_food` (identity key under an advisory lock) or `enrich_catalogue_food` (fills a missing barcode, servings and empty nutrients; records conflicts; never overwrites macros).
4. **attachBarcode:** when a scanned barcode isn't in the catalogue but an existing food is that product, the barcode is written onto that food. The barcode must come from the decoding library, the food must have no barcode, and Jev must confirm the product description at 90% confidence or higher. The next scan is then a catalogue hit.
5. **After publish:** category classification and icon generation are queued for new foods.

### B0. Done on 2026-09-26 (pending the eval gate)

- Catalogue first: USDA, then the web, per food.
- A label never triggers a web search.
- The `attachBarcode` tool.
- The icon reuse threshold (0.8) and ASCII-safe icon filenames.
- The read-side serving guard (see A1).
- A photo eval with 16 real cases.

### B1. Normalise servings when a food is created (prevents new A1 and A6 cases)

- Strip a leading number that equals the amount (`355 ml` × 355 becomes `ml` × 355, or `355 ml` × 1).
- The basis-unit filter currently misses names that include a number.
- Reject implausible grams per unit, for example 1 tbsp outside 5–25 g or 1 cup outside 30–400 g.
- Tests: the Spindrift and "1 Cup (37g)" shapes.

### B2. Check energy against macros when creating (deprioritised)

The ceviche that motivated this has consistent macros (122 vs 120 kcal), so this check wouldn't have caught it. A hard rule would also reject alcoholic drinks. B4 covers the real failure. Keep this only as a warning in the audit report (A3).

- Add a check to `validNutrition` that stated kcal roughly matches protein×4 + carbs×4 + fat×9, with a tolerance for alcohol, fibre and sugar alcohols.
- Reject the source, or mark the food as needing review.
- Tests: the calorie-density guards (dry vs cooked rice, tuna in oil vs water).

### B3. Web extraction accuracy (tried 2026-09-26, not shipped)

**Model choice:** Sonnet 5 stays. On the 17-product creation eval, after dropping two USDA references that list 0 kcal:

| Model | Calories right (per 100 g) | Exact | Declined | Median time | Cost per run |
|---|---|---|---|---|---|
| Sonnet 5 | 16/17 | 13 | 0 | 7.0s | $0.37 |
| Opus 5.5 | 14/17 | 11 | 1 | 10.0s | $0.76 |
| Opus 5 | — | 11 | 1 | 10.2s | $1.37 |

The Opus models made the same two sibling-variant mistakes: DiGiorno Rising Crust instead of Classic Crust, and Light+Fit Greek Crunch.

**What B3 tried:**
- Rules against sibling variants and a preference for the manufacturer's page, in the prompt.
- A check that the page's per-100 g calories agree with its per-serving values.
- A Jev check that the page is exactly the requested variant, with one more search naming the rejected products.

**Result over three runs each:**

| | Calories right | Exact | Declined | Median time |
|---|---|---|---|---|
| Current code | 16, 15, 16 | 13, 11, 13 | 0 | ~7.3s |
| B3 | 14, 14, 16 | 11, 10, 13 | 1, 2, 0 | ~8.7s |

- B3 fixed the one repeated sibling error: Special K High Protein Chocolate Almond picked instead of plain Chocolate Almond, fixed in 3 of 3 runs.
- It declined vague requests ("Protein Bar" with no flavour).
- It disagreed with a doubtful reference: Light+Fit "with cookie pieces & dark chocolate" listed at 70 kcal and 0 g fat.

**Next step:** a better creation eval before tuning further. About 40 products with verified references (the owner's label-sourced foods and barcoded USDA records), queried the way the agent writes them, with the variant words it reads from the photo. Then decide whether a wrong-variant food, which is saved and reused, is worse than a decline, which leads the agent to use the label or an estimate. The B3 code is recoverable from this session.

### B4. Sanity-check estimated foods (implemented 2026-09-26)

- Compare an `AgentEstimate` source's energy density with the median of its nearest catalogue neighbours.
- Flag outliers before creating. For example, 317 kcal/100 g ceviche against about 120 would have been caught.
- As built: `addFood` returns `recheck_estimate` once when the density is more than 1.8× (+20 kcal) away from the median of at least 3 similar foods. Resubmitting the same source accepts it.
- Keep the `AgentEstimate` source label so the audit can upgrade these foods later.

### B5. Supersede estimate-grade foods

- When a verified source (USDA, label or cited web) matches a `GPT4` or `AgentEstimate` food with Jev at 90% or higher but disagrees on density, replace that food's nutrients through a supersede function.
- Log the old values to `FoodItemConflict`.
- Needs decision 1.

### B6. Stronger duplicate candidates (implemented 2026-09-26)

- `duplicateOf` only looks at the 8 nearest foods by embedding.
- Add the trigram name search, `knownAs` aliases and a barcode lookup to the candidate set, the same search the agent uses. A Spanish or misspelt name then finds the existing food before a duplicate is created.

### B7. Retry an unparseable model response (implemented 2026-09-26)

- Retry once on `NoObjectGeneratedError`. One ceviche run failed this way in the model comparison.

### B8. Metrics and evals

- Track web calls per meal. The target is 0 when the catalogue has every food; `findFood` already records its stage timings.
- Add eval cases for:
  - a label-only product
  - a barcode attach
  - an existing product named in another language
  - a GPT4 food being upgraded
- **Release gates:** text 16/16, history 12/12, photos 15/16 or better, and the creation eval target from B3.

### Model decision (2026-09-26)

Stay on Gemini 3.8 Flash for the meal agent. On the 16-photo eval:

| Model | Passed | Agent cost per photo | Notes |
|---|---|---|---|
| Gemini 3.8 Flash | 14/16 | ~$0.02 | |
| Muse Spark 1.3 (paid tier) | 11/16 | ~$0.03 | Timeouts, photo download failures, under-served portions |
| DeepSeek V4.1 Flash | 3/16 | ~$0.001 | Its answers didn't match the required output format |

Muse Spark's contributor tier (it trains on inputs) is blocked by the OpenRouter workspace guardrail. Gemini's flex tier on OpenRouter is half price if cost matters.

---

## Open decisions

1. **Supersede and past logs:** may the audit overwrite nutrients of estimate-grade foods (GPT4 or AgentEstimate) when a cited source disagrees? `LoggedFoodItem` rows keep their own nutrients, so should past logs of a corrected food be recomputed or left as logged?
2. **Merge policy:** for duplicate barcodes and identities, keep the most-logged food and repoint logs, servings and icons?
3. **Icon budget:** a spending cap for regenerating wrong icons (A7).
