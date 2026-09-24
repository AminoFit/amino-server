# Food resolver benchmark — 2026-09-24T00-59-18-702Z

24 synthetic cases × 3 repetitions × 5 variants = 360 attempts. This is an exploratory fixture evaluation, not measured production accuracy or app end-to-end latency.

| Path | Contract passes | Ordinary | Personal | Abstention | Median | Sample p95 | Calls | Reported cost |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| standard | 60/72 | 36/36 | 15/18 | 9/18 | 1.06 s | 2.46 s | 87 | $0.1685 |
| phase3-loop | 65/72 | 35/36 | 18/18 | 12/18 | 4.21 s | 8.11 s | 156 | ≥ $0.1061 |
| gemini-one-call | 71/72 | 35/36 | 18/18 | 18/18 | 1.12 s | 2.75 s | 72 | ≥ $0.0590 |
| deepseek-one-call | 64/72 | 33/36 | 14/18 | 17/18 | 4.31 s | 12.00 s | 72 | ≥ $0.0093 |
| jev-one-call | 69/72 | 36/36 | 18/18 | 15/18 | 0.22 s | 0.42 s | 72 | $0.0031 |

## Failures and policy differences

A rejected proposal is a failed decision, not a correct abstention. The standard pipeline is assessed against the new conservative contract: it intentionally estimates vague servings and does not consume general history ranking. An external-search handoff counts as no local match; the external search itself is not run.

| Path | Case | Nonpassing runs | Observed outcome |
| --- | --- | ---: | --- |
| standard | history_powder | 1/3 | matched 61, 30 g, 120 kcal |
| standard | quantity_override | 2/3 | matched 61, 60 g, 240 kcal |
| standard | vague_bowl | 3/3 | matched 11, 316 g, 410.8 kcal |
| standard | missing_nutrition | 3/3 | matched 103, 100 g, 0 kcal |
| standard | impossible_nutrition | 3/3 | matched 104, 100 g, 1800 kcal |
| phase3-loop | rice_mass | 1/3 | deadline |
| phase3-loop | missing_nutrition | 3/3 | invalid_proposal |
| phase3-loop | impossible_nutrition | 3/3 | invalid_proposal |
| gemini-one-call | tablespoon | 1/3 | deadline |
| deepseek-one-call | rice_cup | 1/3 | deadline |
| deepseek-one-call | apple_count | 1/3 | deadline |
| deepseek-one-call | bread_slices | 1/3 | deadline |
| deepseek-one-call | explicit_brand | 1/3 | deadline |
| deepseek-one-call | unrelated_history | 1/3 | deadline |
| deepseek-one-call | quantity_override | 2/3 | deadline |
| deepseek-one-call | missing_nutrition | 1/3 | deadline |
| jev-one-call | missing_nutrition | 3/3 | invalid_proposal |

## Jev confidence

Confidence is distribution concentration, not a calibrated correctness probability. Thresholds below are descriptive on this same small test set, not tuned/validated rollout gates.

| Confidence ≥ | Proposed matches | Correct | Rejected by validator | Accepted incorrect |
| ---: | ---: | ---: | ---: | ---: |
| 0.8 | 43 | 42 | 1 | 0 |
| 0.9 | 41 | 41 | 0 | 0 |
| 0.95 | 31 | 31 | 0 | 0 |

## Runtime details

| Path | Zero-call runs | Timeouts | Incomplete cost runs | Providers |
| --- | ---: | ---: | ---: | --- |
| standard | 9 | 0 | 0 | Google AI Studio |
| phase3-loop | 0 | 1 | 1 | Google, Google AI Studio |
| gemini-one-call | 0 | 1 | 1 | Google AI Studio |
| deepseek-one-call | 0 | 8 | 8 | DeepInfra, Wafer, Fireworks, CoreWeave, Morph, Parasail, DekaLLM, AtlasCloud |
| jev-one-call | 0 | 0 | 0 | TypeSafe |

Recorded API cost: $0.3459. Timeout/incomplete requests may incur unreported charges. No subscription/infra/database cost included.

All-attempt latency includes failures and capped timeouts. p95 uses nearest rank over this small sample; repetitions of the same 24 cases are not 72 independent food examples. Calls measure full request-to-response time, not streaming decode tokens/second.

## Scope and reproduction

- Inputs already have one extracted food item and a small retrieved catalogue. Retrieval, embeddings, extraction, queueing, writes, icons and app/network rendering are excluded for all paths.
- Standard replays current application exact lookup, semantic matching, serving and nutrition code against in-memory data, preserving prompts, 4096 token minimum, retry behavior and default OpenRouter routing. Non-exact candidates are assigned 0.85 similarity to exercise semantic matching; the ≥0.975 shortcut is not measured. The harness records an external handoff without importing foods or trying another provider.
- Phase 3 replays the real three-turn resolver with in-memory tools. Searches return the full tiny fixture catalogue/history; retrieval relevance, truncation and database latency are not evaluated. Exact matches are included counterfactually here; production currently bypasses the shadow resolver for them. General history ranking is available to the new paths only, reflecting the proposed capability.
- One-call paths get the same prefetched evidence and decision policy. Joint food/serving choices are shuffled and require a typed selection or none. Existing server validation owns grams and calories.
- A common 12-second whole-resolution benchmark deadline is applied. The standard production provider normally has a longer per-call timeout. No harness retries; existing standard-parser retries remain part of its code.
- Default OpenRouter routing is preserved, so providers may differ across API schemas and over time. This measures concrete model+prompt+API configurations, not isolated model intelligence.
- All fixtures and histories are synthetic, no hosted records or credentials are stored. Labels are handwritten and excluded from requests. Shared code hashes, seed, options and fixtures are in manifest.json; per-attempt sanitized evidence is in results.jsonl.

```bash
node --test tests/food-benchmark.test.cjs
node scripts/food-agent/benchmark.cjs --live --smoke
node scripts/food-agent/benchmark.cjs --live
node scripts/food-agent/benchmark-report.cjs scripts/food-agent/results/2026-09-24T00-59-18-702Z
```
