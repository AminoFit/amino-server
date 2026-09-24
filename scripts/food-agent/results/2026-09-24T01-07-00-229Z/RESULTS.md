# Food resolver benchmark — 2026-09-24T01-07-00-229Z

24 synthetic cases × 3 repetitions × 1 variants = 72 attempts. This is an exploratory fixture evaluation, not measured production accuracy or app end-to-end latency.

| Path | Contract passes | Ordinary | Personal | Abstention | Median | Sample p95 | Calls | Reported cost |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| jev-gemini-cascade | 72/72 | 36/36 | 18/18 | 18/18 | 0.21 s | 2.51 s | 66 | $0.0120 |

## Failures and policy differences

A rejected proposal is a failed decision, not a correct abstention. The standard pipeline is assessed against the new conservative contract: it intentionally estimates vague servings and does not consume general history ranking. An external-search handoff counts as no local match; the external search itself is not run.

| Path | Case | Nonpassing runs | Observed outcome |
| --- | --- | ---: | --- |

## Jev confidence

Confidence is distribution concentration, not a calibrated correctness probability. Thresholds below are descriptive on this same small test set, not tuned/validated rollout gates.

| Path | Confidence ≥ | Proposed matches | Correct | Rejected by validator | Accepted incorrect |
| --- | ---: | ---: | ---: | ---: | ---: |

## Runtime details

| Path | Zero-call runs | Timeouts | Incomplete cost runs | Providers |
| --- | ---: | ---: | ---: | --- |
| jev-gemini-cascade | 18 | 0 | 0 | TypeSafe, Google AI Studio |

Recorded API cost: $0.0120. Timeout/incomplete requests may incur unreported charges. No subscription/infra/database cost included.

All-attempt latency includes failures and capped timeouts. p95 uses nearest rank over this small sample; repetitions of the same 24 cases are not 72 independent food examples. Calls measure full request-to-response time, not streaming decode tokens/second.

## Scope and reproduction

- Inputs already have one extracted food item and a small retrieved catalogue. Retrieval, embeddings, extraction, queueing, writes, icons and app/network rendering are excluded for all paths.
- Standard replays current application exact lookup, semantic matching, serving and nutrition code against in-memory data, preserving prompts, 4096 token minimum, retry behavior and default OpenRouter routing. Non-exact candidates are assigned 0.85 similarity to exercise semantic matching; the ≥0.975 shortcut is not measured. The harness records an external handoff without importing foods or trying another provider.
- Phase 3 replays the real three-turn resolver with in-memory tools. Searches return the full tiny fixture catalogue/history; retrieval relevance, truncation and database latency are not evaluated. Exact matches are included counterfactually here; production currently bypasses the shadow resolver for them. General history ranking is available to the new paths only, reflecting the proposed capability.
- One-call paths get the same prefetched evidence and decision policy. Joint food/serving choices are shuffled and require a typed selection or none. Existing server validation owns grams and calories.
- Filtered paths apply that same server validator before the model call, removing impossible food/serving options and associated evidence. The filter checks explicit brand, preparation, supported quantity and nutrition, but does not infer semantic identity. Empty options return unmatched without a model; one remaining option still requires semantic selection. Post-selection validation remains in place. Negative fixtures in this set can all be handled by these existing deterministic rules.
- This follow-up reuses the first run's case seeds and labels. Filtering was added after observing the first run, so this is a targeted regression check on the same cases, not an independent holdout.
- Cascade is measured sequentially: filter, Jev, then Gemini for a non-match, rejected proposal or confidence below 0.9. It used Gemini on 12 runs. The entire cascade shares the 12-second limit. This threshold is illustrative, not calibrated on a held-out dataset. Transport errors are reported as failures, not hidden by this experimental cascade.
- A common 12-second whole-resolution benchmark deadline is applied. The standard production provider normally has a longer per-call timeout. No harness retries; existing standard-parser retries remain part of its code.
- Default OpenRouter routing is preserved, so providers may differ across API schemas and over time. This measures concrete model+prompt+API configurations, not isolated model intelligence.
- All fixtures and histories are synthetic, no hosted records or credentials are stored. Labels are handwritten and excluded from requests. Shared code hashes, seed, options and fixtures are in manifest.json; per-attempt sanitized evidence is in results.jsonl.

```bash
node --test tests/food-benchmark.test.cjs
node scripts/food-agent/benchmark.cjs --live --smoke
BENCHMARK_VARIANT=jev-gemini-cascade node scripts/food-agent/benchmark.cjs --live --compare-to scripts/food-agent/results/2026-09-24T00-59-18-702Z
node scripts/food-agent/benchmark-report.cjs scripts/food-agent/results/2026-09-24T01-07-00-229Z
```
