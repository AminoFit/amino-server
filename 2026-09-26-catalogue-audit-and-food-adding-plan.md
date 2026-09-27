# Catalogue data audit and food-adding pipeline plan

**Date:** 2026-09-26
**Status:** Part A (data audit) is scheduled for later. Part B (food-adding pipeline) is in progress.
**Scope:** the shared `FoodItem` catalogue (15,060 foods, 27,686 servings) and the path that adds new foods to it.

Every logged item ends up as a catalogue `FoodItem`. The catalogue is the lookup cache, so its quality decides meal accuracy. Web search is the last resort, and each web result becomes a food or enriches one.

The counts below come from a read-only pass over production on 2026-09-26. Re-run the same queries at the start of the audit, since the numbers will drift.

---

## Part A: data problems to fix in the audit

### A1. Servings that weigh about a gram per unit (done 2026-09-26: 1,039 repaired)

**Done:** migration `20260926050000_audit_a1_serving_amounts`. Each repaired serving is now one unit of its named portion (amount 1, weight unchanged): "240 ml" = 240 g, "1 cup" = 240 g, "8 OZA" = 240 g. None remain.

- Old rows are in `CatalogueAuditBackup` (audit `A1_serving_amounts`), so the step can be reversed.
- 970 past logs reference these servings. They keep their stored grams: the app shows a log's own fields and re-matches servings by grams when editing.
- The earlier count of 1,328 included 283 legitimate small single units (a tsp of spice at 0.8 g, one berry, one cashew). The guard no longer hides these.

Original finding:

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

### A2. Legacy GPT-estimated foods (done 2026-09-26)

**Decision:** overriding nutrients is allowed. Past logs stay as logged.

**Finding:** the GPT-4 estimates are mostly right. Across the 400 most-logged ones, where a trustworthy USDA record matched, 37 agreed within 10% and only a handful were really wrong.

**Automatic replacement from USDA name matches is unsafe.** It proposed:
- "Apples" at 375 kcal/100 g (dried apple) for Apple, logged 284 times. The current 55 is correct.
- Powder mixes for smoothies.
- A broken record at 110 kcal/100 g for Sour Patch Kids.

A two-signal rule (the food is an outlier against trusted neighbours *and* USDA agrees with them) was safe but found almost nothing, because embedding neighbours are noisy (dry vs cooked rice).

**Fixed individually** with `scripts/audit-supersede.ts` (backup `A2_supersede`, plus a `FoodItemConflict` row):
- Tuna Ceviche (15293): 317 → 101 kcal/100 g, from Allrecipes.
- Baklava (2029): 856 → 430, from USDA 2343527.

**Espresso with crema (1917)** is a duplicate of the USDA food Coffee, Espresso (8713). It goes to the A5 merge.

**Review list:** `scripts/audit-gpt4-foods.ts` (dry run) lists outliers for review. Sour Patch Kids at 220 is wrong (real is about 360) and needs a cited source.

Original finding (1,305 foods with `foodInfoSource = GPT4`):

These were created by the retired gpt-4o pipeline from model estimates, with no citation.

- **Example:** food 15293 "Tuna Ceviche". It has 120 kcal per 37.8 g (317 kcal/100 g, about 2.5× typical ceviche), and its description says "canned tuna". Its one serving, "1/4 cup" = 37.8 g, made a half bowl log as about 556 kcal.
- **Fix:** re-verify each food against USDA, then cited web sources, starting with the most-logged foods (count `LoggedFoodItem` references).
  - Where a verified source agrees, mark the food verified.
  - Where it disagrees on energy density by more than 10%, the food needs replacing. The enrich function records the disagreement and never overwrites macros, so replacing needs a new supersede function (see B5 and decision 1).
- **Check:** every GPT4 food in the top 500 by usage is verified, superseded or retired.

### A3. Implausible nutrition (done 2026-09-26: 36 corrected, 4 merged)

**Done:** `scripts/audit-implausible.ts` (backup `A3_implausible`, plus a `FoodItemConflict` row).
- **Scope:** "impossible" means more than 950 kcal/100 g, or macros more than 15% heavier than the food. That tolerance allows for label rounding on pure fats, and zero-calorie foods count as valid. 83 foods qualified.
- **Pattern:** most had the right nutrients on a wrong serving weight. A McDouble "serving" was 45 g with 400 kcal, and crinkle-cut fries were 10 g.
- **Fix:** each was corrected from a matched source (USDA first, then cited web; Jev 0.8 or higher, names only), including the source's serving weight. Servings that repeated the wrong weight moved with it.
- **Examples:**
  - Ensure Max Protein: 4,500 → 150 kcal.
  - Starbucks Frappuccino: 6,000 → 290.
  - Chicken Quesadilla: 31 g → 310 g.
- **Merged:** 4 whose source was already a catalogue food. Past logs stay as logged.
- **Left for review:** 43 foods with no plausible source, mostly GPT-era dishes with a 1 g "serving" (for example "Brownie Batter Blizzard – Large", 1 g / 1,390 kcal).
- **Not done:** the 256 calorie-vs-macro mismatches (mostly USDA; often alcohol, fibre or sugar alcohols) were not changed.

Original finding (256 energy mismatches, 145 impossible densities):

- **Energy mismatch:** stated kcal differs by more than 25% (and more than 25 kcal) from protein×4 + carbs×4 + fat×9. By source: USDA 150, GPT4 42, Nutritionix 39, FatSecret 25.
- **Impossible density:** more than 902 kcal/100 g, or macros heavier than the food itself.
- **Fix:** alcohol, fibre and sugar alcohols explain some of these legitimately. Classify each with Jev or Flash using the food's facts, re-fetch the source for the rest, and supersede or retire.

### A4. Barcodes (done 2026-09-26: 266 merged)

**Done:** migration `20260926070000_audit_a4_a5_merge_duplicates` added the reusable `merge_catalogue_food(keep, drop, audit)`.
- **What a merge does:** repoints logs, favourites, bug reports, conflict records and icon requests. Servings move, or join the kept food's identical serving (logs and favourites follow, so no favourite cascades away). Detailed nutrients are backed up and dropped. The barcode and name carry over as an alias.
- **Indexes added:** `LoggedFoodItem(foodItemId)`, `LoggedFoodItem(servingId)`, `Nutrient(foodItemId)` and `UserFavoriteFoodItem(foodItemId)`.
- **Result:** 266 foods sharing a barcode were merged into the most-logged one, only where calories per 100 g were within 15%.
- **Left:** 19 barcodes are still shared by foods whose calories disagree. The barcode is on the wrong product and needs a source check before clearing.
- **Still to do:** a unique index on `gtin`. The 161 invalid UPCs are unchanged.

Original finding (280 GTINs shared by 2+ foods, 161 invalid UPCs):

- 575 foods share a UPC with another food. Sometimes it's the same product imported twice, sometimes the wrong size or variant.
- 161 `UPC` values aren't valid GTINs (bad check digit or length), so `gtin` stayed empty.
- **Fix:**
  - Same product: merge. Keep the most-logged food and repoint `LoggedFoodItem`, `Serving` and `FoodItemImages`.
  - Different products: clear the wrong barcode.
  - Then add a unique index on `FoodItem.gtin`. Barcodes should identify exactly one food; that was the earlier note about enforcing this at the food level.
- An existing spawned task covers the duplicate-UPC merge.

### A5. Duplicate foods by identity (done 2026-09-26: 260 merged)

**Done:** in the same migration, 260 foods with the same name and brand (ignoring accents, case and punctuation) were merged into the most-logged one, only within 15% on calories. Examples: "Sugar"/"sugar", "Lo Carb"/"Lo-Carb Energy Drink", "tuna" ×2.

**Exceptions to "most used":** five duplicates whose own values were wrong merged into the correct food. Espresso with crema went into Coffee, Espresso, and the four from A3. The catalogue went from 15,060 to 14,529 foods; favourites are intact and no log points at a missing food.

Original finding (195 groups, 505 foods):

- These foods have the same name and brand after ignoring accents, case and punctuation. That's the same identity key `create_catalogue_food` now enforces for new foods.
- **Fix:** use the same merge process as A4. A Jev check with facts (serving sizes and density) confirms each group is really one food before merging.

### A6. Serving hygiene (done 2026-09-26)

**Done:** migration `20260926060000_audit_a6_serving_hygiene`. Servings went from 27,686 to 22,208. Every changed or deleted row is in `CatalogueAuditBackup` (audits `A6_*`).

- **Deleted, only where no log or favourite references the serving:**
  - 4,110 "g"/"oz" servings that duplicate the app's built-in units.
  - 1,343 servings with no weight or amount.
  - 26 servings with the same name and weight as another on the same food.
- **Unit multiples (355):** "oz" = 85 g became 3 × oz, and "g" = 100 g became 100 × g. One unit is an ounce or a gram again, so "2 oz" no longer logs 170 g.
- **Names (278):** a "(N g)" that matches the weight was removed ("serving (61 g)" → "serving").
- **Why deletes skip referenced servings:** deleting a serving cascades to `UserFavoriteFoodItem`, so referenced servings are never deleted. 69 unusable servings are referenced by logs, and many "g"/"oz" servings are logged; these remain, and the app and agent hide the unusable ones.
- **Placeholders (2026-09-27):** 56 10 g servings beside the real same-name serving ("Burrito" 10 g next to 185 g) were removed. Their logs and favourites moved to the real serving (`A6_placeholder`). Measurement units were excluded, because there the light serving can be the right one ("fl oz" 25 g beside a whole bottle mislabelled "fl oz").
- **Qualifier variants are valid:** 162 same-name groups differ only by a qualifier in parentheses ("container (4 oz)" / "(6 oz)", "cup (1/2" pieces)" / "(slices)"). But the app's `filterServings` strips the qualifier and keeps the lighter serving, which hides the real sizes. An app fix is pending, and it needs an iOS build.
- **Left for a source check:** foods that have the same serving name with different weights (for example "cup" 150 g and 240 g). The app keeps the smaller one.

Original finding:

| Problem | Count | Fix |
|---|---|---|
| Null or zero serving weight (unusable) | 1,307 | Delete those no log references. Otherwise fill the weight from the source. |
| Named as a basis unit (`g`, `ml`, `oz`) | 6,431 | Mostly redundant with the gram basis. Keep `oz` and `fl oz` only where the weight is right. |
| Same name twice on one food | 687 | Dedupe, keeping the referenced serving. |
| Amount doubled in the name (`1 Cup (37g)`) | 286 | Clean the name (same class of bug as the "1 1 Cup (37g) (37g)" portion label). |

### A7. Icons (done 2026-09-26: 1,270 foods in the new style, about $14)

**Final:** 989 icons generated (598 through OpenAI directly, 391 through OpenRouter after the switch) and 281 foods reused one. That's 1,270 recent and popular foods in the new style for about $14 including tests and the vision check. 5 foods hit rate limits and keep their old icons.

**Decision:** redo icons with the owner's prompt, on OpenAI's best model, at most $15, recent and popular foods first.

**Model:** gpt-image-2.5-sunburst at medium quality ($0.0135 per icon; high costs $0.053 and looks the same at app size).

**Prompt:** transparent, square, isometric, simple 3D, vibrant, with an outline for light and dark mode. Show the food alone: no sides, sauces, dips, garnishes, drinks or utensils, and a plate or bowl only when the food is eaten from one. One small ingredient cue is allowed for a plain drink, oil, spread or powder (almonds for almond milk). No text, logos or brand packaging. The queue uses the same prompt for new foods, without the brand in the subject.

**Done:** `scripts/regenerate-icons.ts` ranks foods by recency-weighted logs.
- 598 icons generated (about $8.10) and 250 foods reused a near-duplicate new icon (similarity 0.9 or higher).
- A Flash vision check of the first 263 found 28 with extras. All were helpful identity cues, so all were kept.
- Old links are backed up (`A7_icon_link`).

**Moved to OpenRouter (2026-09-26):** icons now use OpenRouter's `/api/v1/images` endpoint with `openai/gpt-image-2.5-sunburst`. It's the same model, the same transparent PNG, and the same price ($0.0139), so no OpenAI account is needed any more.

**Earlier block:** the OpenAI account ran out of credits (`credit_balance_exhausted`, returned as 429). 352 ranked foods kept their old icons, and the icon queue for new foods fails until credits are added. The generator now fails fast on exhausted credits and backs off on real rate limits.

**Resume:** `scripts/regenerate-icons.ts 1200 1010 progress.jsonl 3` retries the failed foods. About $5.60 of the $15 remains.

Original finding (10,731 weak links):

- The old icon queue linked the nearest existing icon whatever the similarity, for example milk → lasagna (0.70).
- 10,731 links score below 0.8, and 5,760 below 0.75. 11 foods have no icon.
- The queue now reuses an icon only at similarity ≥ 0.8.
- **Fix:** re-check low-scoring links, most-logged foods first, with a cheap Flash vision check ("does this icon show <food>?"). Regenerate icons where it says no. The generation cost per icon needs estimating first (decision 3).

### A8. Foods that can't be logged by mass (done 2026-09-26: 291 fixed)

**Done:** migration `20260926080000_audit_a8_serving_weights` (backup `A8_weight`).
- **Why it mattered:** the meal agent computes no nutrition for `weightUnknown` foods, which blocked popular items.
- **Flag cleared:** `weightUnknown` was removed where the serving weight gives plausible nutrition. Examples: Protein Shake (24 logs), Hot Dog, Coffee.
- **Weight filled:** foods with no default weight but exactly one weighed single-unit serving took that weight. Examples: Big Mac 200 g, 10-piece McNuggets 163 g, Farmers Wrap 275 g.
- **Left:** 17 still flagged and 12 with no weight at all (for example Spicy McCrispy, "The Box Combo"). They need a source, as in A3.

Original finding (319 weight unknown, 26 with no serving weight):

- **Fix:** fill from the source, or retire the food if nothing references it.

### A9. Brand repeated in icon descriptions (done 2026-09-26)

Only one description was affected (the Lala icon), and it was fixed (backup `A9_icon_description`). The icon queue no longer adds the brand to the subject.

Original finding:

- Example: "Lala Lala 100 +Proteína …". The icon queue prepends the brand even when the name already contains it.
- **Fix:** a one-line code change, plus a data update to the affected descriptions.

### A10. Foods named with a portion (done 2026-09-26: 24 merged, 31 renamed)

**Problem:** the retired pipeline created foods like "1/2 Cheeseburger", "Two Hard Boiled Eggs", "Three slices of pizza" and "big bowl of Vector cereal", keeping the amount eaten in the name. They also got their own icons: a second cheeseburger icon for "1/2 Cheeseburger".

**Done:** `scripts/audit-portion-names.ts`.
- A broad pattern preselected 470 names. Flash decided which really carry a portion, because a rule can't tell them apart: "Half & Half", "Three Berry Blend", "Half Chicken" and "2% milk" are products.
- **Merged (24):** when Jev was at least 90% sure a catalogue food is the food itself, the portion food merged into it (`A10_portion_merge`). Examples: "1/2 Cheeseburger" → cheeseburger, "Half Avocado" → Avocado, "12 oz steak" → steak.
- **Renamed (31):** otherwise the food was renamed to the food itself (`A10_portion_rename`). Examples: "big bowl of Vector cereal" → Vector cereal, "4.62oz Fritos Honey Bbq" → Fritos Honey Bbq.
- "large half" was excluded on review.
- Logs keep their grams.

**Prevented:** the meal agent's prompt and the food tools' name fields now say to name a new food as the food itself; the portion is the quantity.

### A11. Best-guess estimates where no source exists (done 2026-09-27: 55 foods)

**Decision (owner, 2026-09-27):** when no source can be confirmed, use a clearly marked best guess, with an icon, instead of leaving a food broken or saving a wrong variant as if it were verified.

**Done:** `scripts/audit-estimate.ts` (backup `A11_estimate`, plus a `FoodItemConflict` row).
- **Scope:** the foods A3 and A8 couldn't fix: impossible facts or no usable weight, plus Sour Patch Kids.
- **Method:** Sonnet estimates one typical serving from the name, keeping the stored calories when they're a plausible portion total (usually only the weight was wrong). It retries once when an answer is empty or physically impossible.
- **Examples:**
  - Brownie Batter Blizzard (Large): "1 g" → 742 g, 1,390 kcal.
  - Spicy McCrispy: 209 g, 530 kcal.
  - Oatmeal: 45 g / 710 kcal → 40 g / 150 kcal.
  - Sour Patch Kids: 29 g / 110 kcal (379 kcal/100 g).
- **Marking:** estimates are stored as `AgentEstimate` with their basis, so a real source can supersede them later.
- **Review flags:** the similar-foods check flagged 6 correct estimates (soda, ramen, tea, scallops, two spices). They were accepted on review; the neighbour signal is noisy, as seen in A2.
- **Icons:** all 55 got new-style icons (41 generated, 9 reused, 5 already done).
- **Result:** no food lacks a usable weight any more. The only impossible food left is a junk placeholder row named "food_name", which was left untouched.

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

**Decision (2026-09-27):** when the exact variant can't be confirmed, the agent makes a marked estimate instead of saving a sibling variant as verified (see A11).

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

### B9. Private foods (server done 2026-09-27; app screen later)

**Decision (owner):** personal dishes and hand-made foods are private to their creator. Label, USDA and cited web foods stay shared. The app screen for creating a food by hand is deferred until the UI is designed.

**Done:** migration `20260927010000_private_foods`.
- **Data model:** `FoodItem.privateToUserId` (empty means shared). It's deliberately not a foreign key, so deleting a user can't cascade into foods that servings reference; an orphaned private food is visible to nobody.
- **Names:** the name-and-brand uniqueness is now per owner, so two users can each have "Grandma's lasagna".
- **Read rules:** `FoodItem` reads are limited to shared foods plus your own, and `Serving` reads follow their food.
- **Database functions:** `search_meal_food_catalogue`, `get_cosine_results` and `create_catalogue_food` take the requesting user. A shared creation never returns or enriches someone's private food; a private one reuses an existing shared food that is the same.
- **Server code:** it uses the admin key, which bypasses the read rules, so every catalogue read filters by user explicitly. That covers meal-agent evidence, barcode lookups, hydration, the duplicate check, the app's `/api/search-food`, and barcode attach (shared foods only).
- **Meal agent:** `proposeEstimatedFood` has a `personal` flag. A personal dish is created privately.
- **Unnamed labels (owner, 2026-09-27):** a nutrition panel that no one can name is private to the user: the photo shows no product name, the user didn't name it, and no barcode was decoded. A generic name like "Protein shake" must not carry one product's exact numbers into everyone's catalogue. `proposeLabelFood` requires an `identified` flag, so the agent always decides. Named or barcoded labels stay shared.
- **Tested:** label-only photos without captions (Fairlife back panel, potsticker bag) are matched to the right catalogue product. New products get the name from the packaging and an icon after the meal is saved.
- **Bug fixed:** `update-logged-food-item-serving` treated a food's *creator* as its owner; it now checks `privateToUserId`.

**Tests:** unit tests, plus SQL tests on a disposable database covering per-owner names, no cross-user reuse, and read rules for foods and servings.

**Still to do:** the app's create-food screen, and editing and deleting your own private foods.

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
