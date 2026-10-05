# Meal agent: Gemini 3.8 Flash vs Claude Sonnet 5.5 — 5 October 2026

Decision: keep Gemini 3.8 Flash (low reasoning) as the meal agent for now. Revisit when Google ships a newer Flash, or if
a model appears between Flash and Sonnet (see the market check below). Total spend on this investigation: about $1.40.

## Why it came up

Meal 30505, "Espresso with oat milk" plus a scanned Oatly chip, took 4 minutes. The first attempt was killed at Vercel's
120 s limit (the resolver's 95 s budget doesn't cover the checks after it), the outbox retried a minute later, and the
retry took 65 s: one Gemini step stalled 26 s and the agent read four old meals that the text never referred to. Over the
last 5 days, 41 of 58 meals without photos went to the agent (45 s on average) and only 5 took the text fast route (7 s).

## Replays

Four slow text meals that created no foods (30505, 30449, 30473, 30451), replayed read-only (catalogue writes throw) with
the fast routes off so both models ran the agent; two runs each, same prompt and tools, reasoning effort low, via OpenRouter.

| | Gemini 3.8 Flash | Sonnet 5.5, no cache | Sonnet 5.5, warm prompt cache |
| --- | ---: | ---: | ---: |
| Time per meal (mean) | 35 s | 12 s | 7–22 s |
| Agent steps (mean) | 8.6 | 2.3 | 2–3 |
| Cost per meal | $0.050 | $0.095 | $0.041 |

- Flash's steps are fast (2–3 s, with 20–27 s stalls) but it takes about 4× as many: it reads past meals and re-fetches
  foods it already has. Tokens per second is the wrong measure for this workload; steps per meal decide the time.
- Same foods and amounts on 3 of 4 meals. 30451 ("Same fairlife latte I had yesterday", when the day before had only a
  skim-milk latte) had no clean answer: Sonnet copied the skim-milk latte both times, ignoring "fairlife". In 2 of 6 runs
  of 30505 Sonnet answered in one step and logged only the Oatly, dropping the espresso, and the plan check didn't catch
  it. Four meals is too few to judge quality; the meal eval decides.
- Sonnet needs two changes to run here: Claude's structured output rejects `oneOf` (the plan schema's unions; `anyOf` is
  equivalent), and OpenRouter must be pinned to Anthropic (it sent Sonnet to Google Vertex, which rejects the same
  schema).

## Prompt caching (Sonnet)

The system prompt and tool list (about 17k tokens) are the same for every meal. With a cache marker at the end of the
system prompt (`providerOptions.openrouter.cacheControl` on the system message) and OpenRouter's top-level
`cache_control` for each meal's growing conversation, a warm meal read 16.9k tokens at $0.20 per million instead of $2.

- The cache lives 5 minutes and every hit resets it; a 1-hour cache costs 2× normal input to write instead of 1.25×.
- A cold meal (first after 5 idle minutes) pays the 17k write once: about $0.080 instead of $0.041.
- Traffic, last 14 days: 65 agent runs (4.6 a day); 51% started within 5 minutes of the previous one, 77% within an hour.
  Expected cost about $0.060 per meal with the 5-minute cache, about $0.056 with a 1-hour cache on the system prompt.
  More users keep it warmer, towards $0.04.
- With caching, half the remaining cost is Sonnet's output (1.5–2k tokens at $10 per million) and most of the rest is
  writing each meal's tool results to the cache.

## Market check (Artificial Analysis, 5 October 2026)

Intelligence Index (higher is better), price per million input/output tokens, output speed:

| Model | Index | Price in/out | Tokens/s | Note |
| --- | ---: | ---: | ---: | --- |
| Gemini 3.8 Flash (low), ours | 33 | $0.75 / $3.75 | ~240 | medium scores 40, high 41 (19 s to first token) |
| Claude Sonnet 5.5 (low / medium) | 36 / 41 | $2 / $10 | ~95 | cache reads $0.20 |
| GPT-6.1 Sol (low) | 42 | $2 / $10 | ~56 | Sonnet's price, slower; 95% cache discount |
| GLM-5.3-Flash | 42 | $0.15 / $0.50 | ~51 | cheap, slow output |
| DeepSeek V4.1 Flash (max) | 39 | $0.30 / $1.20 | ~213 | timed out on 1 of 4 cases on 23 September |
| GPT-6 Luna (high / max) | 33 / 38 | $0.10 / $0.50 | ~140 | Flash-level index at about a seventh of the price |
| MiMo-V2.6-Flash | 38 | $0.14 / $0.28 | ~56 | |

Nothing is clearly between Flash and Sonnet: the models scoring above Flash-low are either Sonnet-priced (Sol) or slow
(GLM, MiMo). The cheapest thing to try first is Flash itself at medium reasoning (index 40 against 33 at low): if it makes
fewer wasted steps, it may close most of the gap without a new provider. Benchmark scores don't measure our tool loop;
any candidate needs the meal eval.

## To switch later

1. Plan schema: `oneOf` to `anyOf`; OpenRouter routing pinned to the model's own provider.
2. Prompt caching: marker on the system prompt plus top-level `cache_control`.
3. Meal eval on the candidate (Flash's full run is about $1.30; Sonnet about $2.50), then a FeatureFlag rollout.
4. Independent of the model: count the checks after the resolver in its time budget, so a slow meal fails and retries
   after 30 s instead of being killed at 120 s and waiting for its lease.

---

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
