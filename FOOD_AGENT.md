# Phase 3: Jev selection with a Gemini agent fallback

Implemented locally on 23 September 2026. **Shadow-only, default off, not deployed.** The text worker can now compare its saved result with the selected Jev → Gemini route. Models cannot save or import foods. Existing exact matches, Phase 2 history reuse, images and barcodes keep their current routing.

The [648-trial benchmark](FOOD_AGENT_BENCHMARK.md) informed this choice, but measured a one-call Gemini fallback. The tool-enabled implementation below has separate verification; those earlier latency figures are not its production performance.

## Resolution

1. Read candidate nutrition/servings and user-scoped history in parallel. Batch-read newly discovered history foods and reuse the evidence throughout the run.
2. Filter food/serving options with server validation. Jev receives only eligible choices plus an explicit `none` choice. A single eligible option still needs semantic matching.
3. Call `typesafe/jev-1.13` through OpenRouter's Decisions API. A validated choice at or above the experimental 0.9 confidence threshold can finish immediately.
4. If evidence is empty/incomplete, skip Jev. If Jev is uncertain, declines or fails, invoke the separately enabled Gemini fallback. It can finish from prefetched evidence in one turn or search and read more evidence in the same session.
5. Validate the proposal again. Compare it with the baseline after the worker has saved food and refreshed progress. Awaiting the shadow comparison keeps serverless workers alive, but cannot change the saved result.

Gemini uses `google/gemini-3.8-flash`, low reasoning, through the existing Vercel AI SDK/OpenRouter adapter. `FOOD_FALLBACK_MODEL` is independent of the legacy matcher's `FOOD_REASONING_MODEL`. The old agent loop remains available through `FOOD_AGENT_TEXT`; the new route takes precedence when both cohorts admit a food, so only one comparison runs.

History is a ranking signal, not a confirmed preference. Current explicit brand, preparation and amount override it. The history tool is bound to the authenticated server-side user and reference time; model results omit user identifiers and original conversation text.

## Tools and budgets

| Tool | Evidence |
| --- | --- |
| `searchFoodCandidates` | Up to 12 existing catalogue food IDs/names/brands, using bounded name-term intersection. In the new fallback, also batch-reads validated details for up to four results; this counts as a second retrieval but saves a model turn. No imports. |
| `searchUserFoodHistory` | Up to five relevant history candidates, with up to ten foods each, dates, grams and frequency. Truncation is disclosed. |
| `getFoodAndServings` | Authoritative nutrition and up to 30 servings for a previously discovered ID. |
| `proposeResolution` | One food/serving proposal or explicit unmatched result. No write. |

Prefetch batches at most 20 food IDs. A 31st serving detects truncation without loading the whole serving collection. Incomplete evidence bypasses Jev and is disclosed to Gemini. Jev receives at most 60 validated joint choices.

There is **one 12-second resolver deadline**, including prefetch, Jev and Gemini. Jev has a two-second local timeout. Gemini gets only the remaining time and retrieval budget: at most three turns, six retrieval calls including prefetch, two concurrent reads, and 1,400 output tokens per turn. Its final turn can only finish. Providers have no automatic retries. The deadline does not include earlier embedding/extraction work or measure end-to-end app latency.

At most two shadow runs are admitted per process, shared with the older loop. Saturated workers skip comparison rather than queueing model work. This is not a fleet-wide quota. Database/provider calls receive cancellation, and the resolver returns on deadline even if an underlying call ignores cancellation.

## Validation and current limits

Models select IDs; server code computes quantities and nutrition. Foods must have a known positive gram basis, usable calories and plausible nutrient weights/energy density. Missing macros stay null. Brands, raw/cooked/dry state, serving ownership and supported quantities are checked. Only food evidence actually supplied to the model may support a proposal; a same-turn speculative read/proposal is rejected.

Supported quantities remain conservative: leading grams/kilograms and simple explicit household units backed by stored servings. Vague portions, modifications and unsupported meal references remain unresolved. The separate Phase 2 exact-reference reuse path remains available.

The same nutrition checks now protect the **existing food worker**, including exact-match saves. Missing calories can no longer become zero; impossible calories/macros and unknown weight bases fail matching. Complete pre-existing nutrient values are checked too. This guard is a worker correctness change outside the shadow flag; stricter rejection and null preservation are intentional. It does not audit every manual-edit endpoint or retroactively change saved foods.

This stage does not add structured-provider or web tools, global imports, image migration, recipes, memory, clarification UI or optimistic UI. The cascade explicitly reports `unsupported_input` for extracted nutrition facts and detected calorie/protein targets, including “250 cals of kefire,” “700 cal Sweetgreen salad” and “a bar with 25 g of protein.” Typed scopes, inverse portion arithmetic and grouped meal reconciliation are the next phase; the current flat extraction contract is insufficient. This shadow status does not replace the baseline's app response.

## Rollout controls

Example configuration for a small comparison cohort after deployment:

```bash
FOOD_BASELINE_TELEMETRY=true
FOOD_AGENT_TEXT=off
FOOD_FAST_SELECTOR=shadow
FOOD_FAST_SELECTOR_PERCENT=5
FOOD_AGENT_FALLBACK=shadow
FOOD_AGENT_FALLBACK_PERCENT=100
FOOD_SELECTOR_MODEL=typesafe/jev-1.13
FOOD_FALLBACK_MODEL=google/gemini-3.8-flash
FOOD_SELECTOR_MIN_CONFIDENCE=0.9
```

Fallback 100% applies within the admitted fast-selector cohort; it does not send all users to the agent. Both new modes support only `shadow`: `on`, malformed settings and missing percentages fail closed. Fallback requires fast selection to be admitted. Set either mode/percentage to off/0 as appropriate, or use `FOOD_KILL_SWITCH=true` to stop new admissions. Environment changes require refresh/redeployment. Existing `OPENROUTER_API_KEY` and `OPEN_ROUTER_API_KEY` aliases work; no credentials were changed.

The 0.9 threshold is experimental, not a calibrated correctness probability. Hold model IDs and policy fixed during a cohort evaluation.

`food_baseline` / `agent_shadow` telemetry records route, fallback reason, selector confidence/duration, prefetch duration, eligible candidate/option counts, tool calls/errors, comparisons, tokens and known cost. Prompts, food text, tool results, credentials and provider error bodies are excluded. Interrupted or unreported cost stays unknown. The report groups routes and fallback reasons as well as comparisons:

```bash
node scripts/food-baseline/report.cjs telemetry.jsonl
```

## Verification

```bash
node --test tests/*.test.cjs
./node_modules/.bin/tsc --noEmit
npm run build
# Explicit paid-provider test, with synthetic model evidence/history:
node scripts/food-agent/cascade-smoke.cjs --live --catalogue-read
```

All 144 local tests pass. Coverage includes Jev request/response validation, empty retrieval recovery, search detail hydration, immediate Gemini completion, invalid nutrition filtering, history failures, evidence visibility, serving truncation, shared deadlines/cancellation, total tool budgets, independent rollout gates, telemetry and save-before-comparison ordering. Worker regressions cover missing/impossible calories and preservation of unknown macros. An abstention following failed evidence reads is reported as unavailable, not proof that no match exists. TypeScript and production build are also checked; existing React lint and Redis build-time DNS warnings remain.

The live integration check uses real Jev/Gemini calls with entirely synthetic food/history fixtures. A separate shared-catalogue batch read verifies hosted Supabase food 387 and its four servings. It does not query hosted user/history records or save meals. Results and observed resolver times are recorded in the [integration output](scripts/food-agent/results/2026-09-24T01-50-11-835Z-cascade-smoke/summary.json):

| Case | Result | Route | Time |
| --- | --- | --- | ---: |
| 150 g cooked couscous, with dry decoy | Correct cooked food, 168 kcal | Gemini from prefetched evidence | 1.81 s |
| 200 g tomato soup, with sauce decoy | Correct soup, 70 kcal | Jev | 0.26 s |
| 100 g plain kefir, misspelled | Correct kefir, 60 kcal | Jev | 0.18 s |
| One tablespoon peanut butter, synthetic Beta history | Beta, 17 g, 100.3 kcal | Gemini from prefetched evidence | 2.28 s |
| Explicit Alpha peanut butter despite Beta history | Alpha, 16 g, 96 kcal | Jev | 0.21 s |
| 100 g cooked garbanzo beans, initially no candidates | Searched for chickpeas, read food, returned 164 kcal | Gemini with tools | 4.94 s |
| Kefir with missing calorie basis | Unmatched; no invented zero-calorie match | Gemini with tools | 6.45 s |
| Three future nutrition-target examples | Explicitly unsupported; no model calls | None | Immediate |

All ten checks passed. These fixtures are a connectivity/contract smoke check, not an accuracy or p95 benchmark. They exclude real database retrieval latency from model-run timing. The missing-nutrition search was relatively slow; review fallback frequency, accepted wrong matches and escalated latency on a fresh, larger labelled holdout before live replacement. Do not transfer the earlier benchmark's 0.21-second median to this new route.

Earlier runs are retained: the [first run](scripts/food-agent/results/2026-09-24T01-40-33-683Z-cascade-smoke/summary.json) passed 10/10, but a [repeat](scripts/food-agent/results/2026-09-24T01-47-46-106Z-cascade-smoke/summary.json) passed 9/10. In the failure, Gemini searched twice and reached its final turn without having read nutrition; validation blocked the proposal. The fix batch-hydrates up to four search results within the existing read budget, avoiding a mandatory separate read turn. The table above records the full rerun after that fix; it does not erase the earlier failed trial.

The previously inconsistent search case then passed [three additional consecutive trials](scripts/food-agent/results/2026-09-24T01-51-07-396Z-cascade-smoke/summary.json), taking 3.46–6.07 seconds. Repeat it with `node scripts/food-agent/cascade-smoke.cjs --live --case canonical_search_needed --repeat 3`. These repeats verify the fix on that fixture, not generalization to new foods.

## Next gates

Add typed calorie/protein/meal constraints behind their own flag, with per-item and grouped reconciliation tests. Evaluate read-only structured-provider tools before replacing legacy provider fallback. Online grounding/imports remain Phase 4. Review catalogue substring-query plans before expanding cohorts; the current name/brand B-tree index does not establish efficient substring lookup.

Live replacement needs an explicit supported mode, reviewed shadow disagreements, representative holdout accuracy, latency/cost gates and production smoke testing. Image/barcode changes require their own evaluation. No production rollout, environment changes or user-history model calls were performed here.
