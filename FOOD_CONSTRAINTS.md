# Nutrition constraints: first shadow milestone

The server now has a typed contract for explicit nutrition statements and deterministic calculations for the three requested meanings. This milestone evaluates interpretation without changing saved foods. The live Jev/Gemini matcher and dressing fix are documented in [FOOD_LIVE.md](FOOD_LIVE.md) and [FOOD_COMPOSITION.md](FOOD_COMPOSITION.md).

| Statement | Meaning | Calculation or check |
|---|---|---|
| “Chocolate protein bar with 25g of protein” | Product identity, per bar | Compare the source bar's protein at one bar; never scale a different 20g-protein bar to force a match |
| “250cals of kefire” | Consumed portion target | For a supported 60 kcal/100g food, calculate 416.666…g; preserve unknown macros as null |
| “700 cal Sweetgreen salad” | Consumed dish/group total | Check precisely the salad's members, excluding independent drinks and avoiding parent/ingredient double counting |

## Implemented

`src/foodResolution/constraints/contract.ts` validates strict claim shapes, quoted source values, units, meaning, relation, serving basis and item indices. Recognised nutrition facts cannot silently disappear. Repeated ambiguous quotes, unknown indices, duplicate claims, overlapping groups, unsupported ranges and cropped qualifiers fail validation. The classifier's semantic assignment of meaning and group members remains a model judgment; source validation alone cannot prove it correct.

`extract.ts` uses Gemini through the existing OpenRouter AI SDK adapter, with one JSON response, no retries and an eight-second deadline. JSON transport supplies syntax; local Zod and source validation enforce the contract. The request is bounded to 8,000 characters and 20 extracted items. Only statements containing recognised nutrition numbers invoke the classifier. Model, duration, status, counts and available usage are measured; raw source quotes and meal text are not emitted by this telemetry.

`evaluate.ts` provides independently tested, pure functions for product-identity checks, calorie/protein-derived portions and group reconciliation. A conflicting explicit weight is refused when supplied by the caller. Per-serving identity checks require a matching catalogue serving. A large group discrepancy is a conflict: code does not invent balancing oil, change ingredient weights or manufacture a global food. Only actual source-rounding residuals can be reconciled at cent-calorie precision.

The shadow classifier starts after extraction and composition normalization, while the existing pipeline continues queueing food work. It cannot write food values, change the queue count or change success/failure handling. The HTTP handler awaits shadow completion to keep the serverless request alive; this can add up to eight seconds after extraction even though food workers proceed independently. This is separate from the live resolver's deadline.

## Configuration

The feature defaults off and is not enabled in production by this milestone. To evaluate it in a later deployment:

```sh
FOOD_NUTRITION_CONSTRAINTS=shadow
FOOD_NUTRITION_CONSTRAINTS_PERCENT=100
```

`on` is unsupported and fails closed. `FOOD_KILL_SWITCH=true` also disables it. `FOOD_CONSTRAINT_MODEL` can override the default `google/gemini-3.8-flash`; any substitution requires evaluation. Environment changes need redeployment. For the single-user app, no cohort expansion is required.

## Verification

All 175 local tests pass, including source fabrication, qualifiers, serving bases, explicit-weight conflicts, missing energy, unknown macros, impossible portions, per-bar identity, separate drinks, group overlap, parent/child duplication, rounding and the actual SDK JSON response path. TypeScript and the production build pass. The build emits existing React and Redis connection warnings; those do not establish runtime queue availability. The eight stored real-provider responses also pass the final source validator.

The opt-in `node scripts/food-agent/constraints-smoke.cjs --live` sends only synthetic examples to the configured model and makes no database requests. Eight of eight cases passed in [the final run](scripts/food-agent/results/2026-09-24T02-34-42-381Z-constraints/summary.json), taking approximately 0.97–3.91 seconds per call. The cases include half of a salad labelled 700 kcal, a separate drink and per-100g protein. These are smoke checks, not a held-out accuracy or production latency estimate.

Earlier forced-tool-schema requests failed with provider HTTP 400; those failed trials remain under `scripts/food-agent/results/*-constraints`. Switching to JSON transport fixed the observed integration failure while retaining strict local validation. No nutrition-constraint feature was enabled during those failures.

## Remaining before authoritative saves

The classifier and calculators are not yet connected to live candidate filtering, serving proposals or writes. Current legacy per-item nutrient hints still behave as before. This release therefore does not promise that a newly logged 700-kcal salad saves a validated 700-kcal group.

Next, carry the validated claims and explicit quantity evidence through resolution, filter product candidates on the correct basis, derive supported target portions and revalidate against freshly read catalogue data. Then resolve all members of a constrained group before an idempotent, all-or-nothing save. Unrelated foods may continue independently. A calorie-only aggregate representation also needs client compatibility checks; it is not implemented by fabricating a global catalogue item. Live activation requires end-to-end tests of those saves, conflicting claims, retries and partial failure.
