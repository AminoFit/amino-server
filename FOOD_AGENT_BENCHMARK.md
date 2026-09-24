# Food matching benchmark — 23 September 2026

Historical experiment: the subsequent tool-enabled Jev/Gemini route is now implemented in text shadow mode. See [current implementation and integration checks](FOOD_AGENT.md); the measurements below still describe the earlier benchmark configurations, including the standard worker before its shared nutrition guard.

The promising replacement is **existing exact-match shortcuts → deterministic candidate filtering → Jev selection → one-call Gemini fallback**. The measured filtered Jev/Gemini stage passed 72/72 trials, with a 0.21-second median and 2.51-second sample p95. The deterministic exact-match shortcut remains valuable; there is no reason to send every food through an agent loop.

These are **24 unique synthetic cases, repeated three times**, not 72 independent examples or measured production accuracy. The follow-up filter and cascade reuse these cases after seeing the initial results. A fresh, larger holdout is required before a live rollout. All new implementation in this work is benchmark-only; no production model, flag, credentials or records were changed.

## Results

648 scored trials across three experiments, plus five connectivity smoke trials. All model calls used the existing OpenRouter key. Server code, input labels, seeds, provider identity, request usage, failures and timing were recorded without credentials or hosted user data.

| Resolver | Passes under the new contract | Median | Sample p95 | Timeouts | Reported cost / 72 trials |
| --- | ---: | ---: | ---: | ---: | ---: |
| Standard matching pipeline, Gemini 3.8 Flash | 60/72 | 1.06 s | 2.46 s | 0 | $0.1685 |
| Current Phase 3 agent loop, Gemini 3.8 Flash | 65/72 | 4.21 s | 8.11 s | 1 | ≥ $0.1061 |
| One-call Gemini 3.8 Flash | 71/72 | 1.12 s | 2.75 s | 1 | ≥ $0.0590 |
| One-call DeepSeek V4.1 Flash | 64/72 | 4.31 s | 12.00 s | 8 | ≥ $0.0093 |
| One-call Jev 1.13 | 69/72 | 0.22 s | 0.42 s | 0 | $0.0031 |
| Filtered Jev | 71/72 | 0.21 s | 0.37 s | 0 | $0.0020 |
| Filtered one-call Gemini | 72/72 | 0.99 s | 2.00 s | 0 | $0.0400 |
| **Filtered Jev → Gemini** | **72/72** | **0.21 s** | **2.51 s** | **0** | **$0.0120** |

Rows before filtering were interleaved in the first experiment. Filtered Jev/Gemini were interleaved in the second with a fresh unfiltered Jev control (69/72 again, 0.23-second median). The cascade was measured in a third experiment, sequentially calling its two providers when necessary. These later rows are not simultaneous comparisons with the first run.

A pass means the correct food, grams and calories, or a correct abstention where safe resolution is unsupported. Timeouts and validator-rejected proposals fail the decision test. A rejection is nevertheless safer than accepting bad data. All paths except the standard pipeline had **zero accepted incorrect matches** in these trials.

The standard pipeline scored **36/36 on ordinary food cases**, 15/18 on history-preference cases and 9/18 on abstention cases. Its lower combined score partly reflects a different contract: it intentionally estimates vague servings and does not use general history preferences. Do not interpret 60/72 as its production accuracy.

## What the tests found

- **Standard pipeline:** three history preference mismatches; three estimates for a vague rice bowl; three missing-calorie foods accepted as zero calories; three impossible-nutrition foods accepted at 1,800 kcal per 100 g. The last two are concrete validation gaps in the replayed production code. Nine trials used zero LLM calls, including six correct ordinary entries and three invalid-nutrition exact matches. Validation must apply to shortcuts as well as model decisions.
- **Phase 3 loop:** six invalid-nutrition proposals safely rejected, plus one timeout. It made 156 model requests versus the standard pipeline's 87. Extra tool/model round trips are expensive for this small selection task.
- **One-call Gemini:** all completed decisions were correct; one request timed out. Filtered Gemini completed all 72 follow-up trials correctly.
- **DeepSeek:** all completed decisions were correct, but eight timed out. Default OpenRouter routing used eight providers, and many slow completed requests came through DeepInfra. This is a result for that routing/configuration, not proof that DeepSeek is intrinsically slower on every provider. Latency-optimized or pinned-provider routing remains a separate experiment.
- **Unfiltered Jev:** selected the missing-calorie food three times; post-validation rejected every one. Filtering eliminated that failure. In the follow-up, filtered Jev incorrectly abstained once on “half a cup dry oats,” with confidence 0.01. No incorrect food was accepted.

## Filtering and fallback

The user's suggestion to remove invalid evidence before calling Jev is supported by this test. The benchmark reuses the existing deterministic validator to eliminate invalid food/serving combinations before building the request. It checks known calories, serving weight, nutrient plausibility, explicit brand and preparation, and supported quantity. It removes associated food/serving/history evidence that can no longer be selected. Labels and expected answers never participate in filtering.

This is broader than a calorie-only filter. All six abstention fixtures can be resolved by these existing rules, so **18/72 filtered trials require no model**. That is a property of this fixture set, not an expected production rejection rate. On larger cases, distinguish “no valid retrieved candidate” from “food does not exist”: a bounded retrieval retry or unmatched result may still be appropriate.

A sole remaining candidate still requires semantic matching: nutritionally valid apple pie is not necessarily a valid match for an apple. Post-selection validation remains in place, and code computes grams/calories.

The measured cascade:

1. Return unmatched if no valid options remain.
2. Ask Jev to select a joint food/serving option or none.
3. Accept a match only if confidence is at least 0.9 and the server validator accepts it.
4. Otherwise ask Gemini once using the same filtered evidence and schema.
5. Validate the final result; enforce a shared 12-second overall deadline.

The cascade resolved **18 trials in code, 42 with Jev alone and 12 with Gemini fallback**. It made 66 provider calls. The slowest trial still took **7.71 seconds**, so the median improvement is not a tail-latency guarantee. Filtered Gemini alone had a better sample p95, 2.00 versus 2.51 seconds.

The 0.9 threshold is an experimental policy, not a calibrated confidence bound. Filtering changes the alternatives and therefore the confidence distribution. Calibration must use a separate held-out set. Transport failures are exposed as failures in this experimental harness; the measured fallback covers completed but uncertain/rejected decisions.

## Scope and fairness

All paths start with an extracted single food and a small in-memory candidate catalogue. Timings include resolver work and complete model responses. They **exclude** extraction, embeddings, catalogue/history network reads, queueing, database writes, icons and app rendering. This is not app request-to-visible-result timing or a decode tokens/second benchmark.

The standard arm executes current application exact lookup, semantic matching, serving resolution and nutrient arithmetic with original prompts and provider payload defaults. Storage and usage logging are replaced with in-memory/no-op adapters. Non-exact candidates get a fixed 0.85 similarity to exercise the semantic matcher; the ≥0.975 shortcut is not assessed. An external-search handoff is recorded as no local match; external lookup/imports are not run. Provider fallback to a separate API is blocked so the benchmark cannot silently change models.

The Phase 3 arm executes the real bounded resolver. Its tools read only the same synthetic catalogue/history. Exact cases are included counterfactually: the actual worker currently skips shadow evaluation for its exact matches. Search tools return the complete tiny fixture set, so retrieval quality, history truncation and large candidate pools are untested.

One-call variants receive the same state and semantic instructions, adapting only the API format. All Gemini/DeepSeek requests use low reasoning and default OpenRouter routing, without a latency preference. Standard requests preserve their 4,096-token minimum; the new selectors and Phase 3 use 1,400. Candidate order and option labels are deterministically shuffled; requests are interleaved with concurrency three. A common 12-second resolution budget is imposed, shorter than the standard provider's native per-call timeout. This compares actual configurations, not isolated model intelligence.

Latency includes capped timeouts. p95 uses nearest rank on 72 attempts; repeated cases are correlated. The overall observed charge, including smoke and controls, was **$0.4071**, plus any unreported charges from timed-out requests.

## Recommended next step

**Architecture selected after this evaluation:** filtered Jev with a Gemini agent fallback. See the [recorded decision](docs/plans/food-agent-migration.md#selected-architecture). The fallback can answer immediately or retrieve evidence in the same session. The recorded benchmark covers the one-call cascade only; the tool-enabled fallback and nutrition/meal-total constraints require separate integration and evaluation.

Keep Phase 3 in shadow. Introduce the prefetch/filter/one-call selection strategy behind its own server-side flag, retaining exact/history reuse routes and code-owned arithmetic. Evaluate the Jev/Gemini cascade and filtered Gemini on a **fresh larger holdout** before choosing a live policy.

That holdout should cover real catalogue shapes (up to 20 candidates), conflicting/weak history, semantic near-misses with plausible nutrition, duplicates, missing units, unsupported package sizes, meals and misspellings. Measure retrieval + decision latency, fallback rate, incorrect accepted matches and per-category coverage. UI progress should be driven by actual stages and committed results; fast model decisions alone do not establish full app responsiveness.

Also close the standard pipeline's missing/impossible nutrition gaps, including exact matches, before reusing it as a fallback for rejected proposals.

## Artifacts and reproduction

- [Initial five-path results](scripts/food-agent/results/2026-09-24T00-59-18-702Z/RESULTS.md)
- [Filtering comparison with Jev control](scripts/food-agent/results/2026-09-24T01-04-59-303Z/RESULTS.md)
- [Measured sequential cascade](scripts/food-agent/results/2026-09-24T01-07-00-229Z/RESULTS.md)
- [Harness](scripts/food-agent/benchmark.cjs), [isolated application adapters](scripts/food-agent/benchmark-runtime.cjs), [synthetic fixtures](scripts/food-agent/benchmark-fixtures.cjs), [tests](tests/food-benchmark.test.cjs)

Each result directory contains a manifest with fixtures, model configuration and source hashes, plus sanitized per-trial JSONL and summary JSON. All 119 tests passed, including 13 benchmark tests covering labels, scoring, isolated standard code, filtering and cascade routing. Production resolver files were not modified by this benchmark work.

```bash
node --test tests/food-benchmark.test.cjs
node scripts/food-agent/benchmark.cjs --live --smoke
node scripts/food-agent/benchmark.cjs --live
BENCHMARK_VARIANT=jev-one-call,jev-filtered,gemini-filtered node scripts/food-agent/benchmark.cjs --live --compare-to scripts/food-agent/results/2026-09-24T00-59-18-702Z
BENCHMARK_VARIANT=jev-gemini-cascade node scripts/food-agent/benchmark.cjs --live --compare-to scripts/food-agent/results/2026-09-24T00-59-18-702Z
node scripts/food-agent/benchmark-report.cjs scripts/food-agent/results/2026-09-24T01-07-00-229Z
```

API references: [OpenRouter Jev tutorial](https://openrouter.ai/docs/guides/community/jev-tutorial), [structured outputs](https://openrouter.ai/docs/guides/features/structured-outputs). Jev uses the Decisions API and a pinned `typesafe/jev-1.13` model, not the chat-completions API. Its returned snapshot was `typesafe/jev-1.13-20260917`.
