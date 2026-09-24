# Preserve explicit dressings and other additions

The reported image extraction kept “with olive oil and vinegar dressing” in a chicken item's description, but searched for only “Whole Chicken Breast.” The existing exact/legacy matcher accepted plain chicken. Valid calorie arithmetic on the wrong food therefore silently omitted the dressing.

Both text and image extraction now explicitly instruct the model to preserve oils, dressings, sauces and toppings exactly once, and to remove a separated side from the base item's description. A shared post-extraction backstop handles unambiguous explicit additions to common unbranded meal components before publishing the final item count and queueing work. It preserves explicit side amounts and does not copy a base food's weight or nutrients onto the addition. An oil-and-vinegar dressing stays one item. Matching already extracted sides are reused; ambiguous overlaps, branded products, component totals and ambiguous weights are not mechanically split.

Shared coverage validation also blocks a plain food when its item description still requires an explicit energy-bearing addition. It runs at exact lookup, agent proposal validation and the final worker boundary, including images and legacy fallback. This prevents a failed or bypassed decomposition from becoming a successful incomplete match. It is a conservative backstop for named additions, not a universal ingredient/recipe parser.

Unspecified side portions still use the existing serving estimator. The added component retains its source text and whether a portion was specified, rather than fabricating a precise portion in the decomposition code. Generic compound foods requiring more semantic interpretation may fail matching instead of losing calories silently. No new global foods or retroactive user-record changes are made by this fix.

Validation: 162 tests pass, including the reported extraction shape, text/image worker coverage, exact-path behaviour, explicit quantities, duplicate-side prevention, exclusions, packaged products, calorie-total preservation and agent proposals with valid numbers but missing oil. The complete queue regression verifies the corrected two-item count is published before dispatch. Production verification is appended after deployment.

## Production verification — 23 September 2026

Release `273ca89` was built successfully on Vercel and promoted as `dpl_C5Jr4bUDS2VSvj3R1C39qwStBSut` (https://amino-gtz52jck1-hedge.vercel.app).

A synthetic hosted API request for “200 g chicken breast with 1 tbsp olive oil” returned HTTP 200 and finished RESOLVED 2/2. Chicken food 55 saved 200 g / 291.0053 kcal through Gemini. Olive oil food 87 saved 13.5 g / 119.34 kcal / 13.5 g fat through Jev. The oil calories were therefore preserved as a separate item. Test message 30287 and both food rows were soft-deleted after the check. Existing user meals were not modified.

This HTTP smoke covers the text route. The image regression is exercised locally using the exact erroneous extracted shape and the image worker path; no user's photo was resubmitted to a model.

## Branded additions — 24 September 2026

A later reported coffee failure exposed an overly broad exclusion: the composition backstop skipped every branded item. When extraction returned one “coffee with Fairlife milk” row with brand Fairlife, the brand incorrectly applied to coffee and the entire combined item failed.

The shared text/image instructions now distinguish independently named additions from established packaged or café products. The deterministic backstop can split a common base plus an explicit addition when the supplied brand occurs only in the addition. It transfers that brand to the addition, clears it from the base, and preserves component quantities—including postfix “milk cup.” The search name omits quantity units while the source description retains them. It also handles shortened extraction queries and reuses an already extracted matching branded side. Packaged/barcoded products, complete named drinks, unresolved brand attribution and nutrition totals retain their conservative exclusions.

This is a general brand-location rule, not a Fairlife lookup or a new web-search step. It adds no model call to the current pipeline. Unspecified milk fat percentage is not invented during extraction; resolving that ambiguity and asking clarification questions remain separate work. Unknown portions still use the existing downstream estimator.

Regression cases cover Fairlife, Oatly, Kerrygold and Skippy additions; independent coffee/milk queueing; quantity placement; packaged drinks; and a milk failure preserving the successful coffee with truthful 1/2 counters. Four synthetic requests to the actual extraction model verified the reported wording, explicit separate quantities, another branded addition and an intact Starbucks latte. The first prompt-only trial still copied the cup onto coffee; an explicit example corrected this in the final trial, which also checked for that duplication. These smoke cases do not establish general extraction accuracy.

Validation for this update: 184 tests, TypeScript and the production build pass. Re-run the optional real-provider extraction check with `node scripts/food-agent/composition-smoke.cjs --live`; the final observed responses are stored in `scripts/food-agent/results/2026-09-24-coffee-composition.json`.
