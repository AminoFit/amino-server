# Phase 3 latency and model comparison — 23 September 2026

New: [648-trial resolver benchmark, including the standard pipeline, Jev filtering and Gemini fallback](FOOD_AGENT_BENCHMARK.md). This provides a broader comparison than the earlier four-case smoke runs.

The 11.66-second brand-override run is too slow for the intended live resolver. These are shadow-resolver timings, not additional blocking time added to the current app save. The synthetic brand fixture used in-memory food evidence, so its delay was in the model/request path rather than hosted database reads. Per-turn/provider timing is needed to separate queueing, prompt processing, reasoning and output generation.

## Small Amino comparison

Ran DeepSeek V4.1 Flash with the same resolver, low reasoning setting, default OpenRouter routing, four test cases and 12-second deadline. Gemini values are from the preceding test run, not interleaved simultaneous trials. Shared catalogue reads and synthetic history only; no application configuration or production records changed.

| Case | Gemini 3.8 Flash | DeepSeek V4.1 Flash |
| --- | ---: | ---: |
| 100 g cooked white rice → 130 kcal | 5.41 s, pass | 4.64 s, pass |
| Vague large bowl → unmatched | 4.61 s, pass | 7.53 s, pass |
| Synthetic history powder preference | 5.50 s, pass | 1.58 s, pass |
| Explicit brand overrides history | 11.66 s, pass | 12.01 s, timeout |

DeepSeek completed three cases correctly; the fourth produced no validated result before the deadline. This tiny sample cannot establish accuracy, p95 latency or that either model is consistently faster. The current smoke script stops at a failure and writes its aggregate JSON only on success; the DeepSeek timeout is therefore recorded here from command output.

## Published comparison

DeepSeek's latest Flash is V4.1, released September 10. [Official announcement](https://www.deepseek.com/en/news/deepseek-v4-1-flash/).

Artificial Analysis's paired page, read today, reports:

| Metric | Gemini 3.8 Flash, high reasoning | DeepSeek V4.1 Flash, max reasoning |
| --- | ---: | ---: |
| Intelligence Index | 41 | 39 |
| AutomationBench-AA | 60% | 69% |
| Output throughput | 283 tokens/s | 232 tokens/s |

These are benchmark settings and first-party API measurements, not Amino's low-reasoning OpenRouter workload. Output throughput excludes the time spent waiting for generation to start. [Paired evaluation and methodology](https://artificialanalysis.ai/models/comparisons/deepseek-v4-1-flash-vs-gemini-3-8-flash).

## Recommended next experiment

1. Fetch a small set of candidate foods with servings and relevant history concurrently, then supply that evidence in the first model request. Let the agent make extra tool calls only when the supplied evidence is insufficient. Preserve code-owned arithmetic and validation. Current evidence validation will need to recognize evidence supplied in the initial prompt.
2. Compare OpenRouter latency-prioritized routing with the current default. The adapter currently sets `require_parameters` but no routing preference. OpenRouter defaults to price-weighted load balancing and supports `provider.sort = "latency"`. Record upstream provider and per-turn timings. [Routing documentation](https://openrouter.ai/docs/guides/routing/provider-selection).
3. Evaluate Gemini low versus DeepSeek low and non-thinking on a larger labelled food suite, especially brands, preparation state, grams, vague portions and personal history. Gemini 3.8 already uses its lowest supported thinking level in this adapter; `minimal` is unsupported. [Google model guidance](https://ai.google.dev/gemini-api/docs/latest-model), [DeepSeek thinking controls](https://api-docs.deepseek.com/guides/thinking_mode/).

A useful initial target is a typical common-path resolver time below 2–3 seconds, with p95 below 5 seconds; these are proposed targets, not demonstrated performance. Choose on validated food/quantity accuracy, timeout rate, total latency and cost. Do not change the production model based on this four-case sample.
