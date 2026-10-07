# Meal agent: Haiku 5.5, Sonnet 5.5 and a prompt fix — 7 October 2026

Decision: Flash stays for now, Sonnet is the direction (owner, 7 October). A prompt fix helped every model, Flash included; Haiku 5.5 works at medium thinking or above
and costs about a ninth of Flash per meal, but it isn't faster than Flash with the fix. Spend: about $1.06.

## Replays

Same four slow text meals as 5 October (30505, 30449, 30473, 30451), read-only, fast routes off, `scripts/meal-model-replay.ts`
(model, effort and prompt variant switches in `scripts/mealAgentOverride.ts`). Two runs per meal (Flash one), three arms
at a time, so times are comparable within this table only. "coverage" is the prompt variant below.

| Arm | Failed runs | Time per meal | Steps | Cost per meal | Espresso kept (30505) |
| --- | ---: | ---: | ---: | ---: | --- |
| Flash low | 0/4 | 36 s | 5.8 | $0.044 | 1/1 |
| Flash low + coverage | 0/4 | 20 s | 4.5 | $0.030 | 1/1 |
| Haiku low | 3/8 | 17 s | 2.6 | $0.004 | dropped in 1 of the 2 that answered |
| Haiku medium | 1/8 | 21 s | 2.6 | $0.004 | 2/2 |
| Haiku low + coverage | 0/8 | 21 s | 3.6 | $0.005 | 1/2 (the other logged the oat milk twice) |
| Haiku medium + coverage | 0/8 | 21 s | 3.1 | $0.005 | 2/2 |
| Haiku high + coverage | 0/8 | 26 s | 2.9 | $0.005 | 2/2 |
| Sonnet low + coverage | 0/8 | 13 s | 2.3 | $0.051 (cached) | 2/2 |

Multilingual sanity eval (`scripts/meal-sanity-eval.ts`, 17 cases, EVAL_MODEL/EVAL_EFFORT/EVAL_VARIANT): Flash low +
coverage 17/17 ($0.148), Haiku medium + coverage 17/17 ($0.018), Haiku high + coverage 16/17 (asked whether the 200 g
chicken in es_meal was raw or cooked).

- The dropped espresso was a prompt problem. "[barcode:] chip … the words around it give the amount" reads as if
  "Espresso with oat milk" describes the scanned Oatly. Haiku marked "Espresso" omitted and Sonnet (5 October) logged
  only the Oatly. The variant says the words around a chip either describe the product or name other foods.
- Flash's extra steps were partly the prompt too. Telling it not to read history unless the words refer to a past meal,
  and not to fetch a food twice, took 36 s to 20 s and $0.044 to $0.030 (one run per meal: confirm with the meal eval).
- Haiku at low thinking fails the plan's validation (a "0" gram item for the food it decided to omit, a clarification
  when clarificationAllowed is false) in 3 of 8 runs; medium is the floor. Its steps are slower than Flash's, so at
  about 3 steps it takes as long as Flash at 4.5.
- 30451 ("Same fairlife latte I had yesterday", when yesterday had a skim-milk latte) still has no clean answer: most
  runs copy the skim-milk latte; Flash + coverage built espresso plus fairlife milk, arguably the best reading.
- Claude needs two more things than on 5 October: its structured output ignores string lengths (an over-long evidence
  string or clarification fails validation, so the limits go in the prompt), and the plan schema's oneOf as anyOf.

The coverage variant (appended to the system prompt):

> The words around a [barcode:] chip either describe that scanned product (its amount, or a generic name for it such as
> "oat milk") or name other foods eaten with it; those other foods are their own items, never omitted because of the chip.
> Before you answer, go through originalText mention by mention: every food named (including drinks such as an espresso
> or coffee, and each [barcode:] chip) needs its own component with an item, or an explicit omission. lockedProducts and
> prefetchedFoods are evidence for some of the meal, never the whole meal: a mention with no matching food still needs a
> findFood call. Do not answer while a mention is unaccounted for.
> Spend turns only on evidence you lack. Do not call listMealEvents or getMealEvent unless the words refer to a past meal
> ("same as", "again", "yesterday's", "my usual"); recentMeals already shows what was eaten lately. Never fetch a food
> again that a tool already returned in this conversation: reuse it.

## Full suite on Sonnet 5.5 + coverage (low thinking)

Text 17/17 ($0.234, 3.8 s a case), history 15/15 (2.0 steps), photos 21/22 ($0.545, 20.2 s and 1.3 steps a case; 30318
"Half of this large tuna ceviche bowl" dropped the mango). No first plan was rejected by the backend check. About $0.99 in
all (OpenRouter's usage counter, which also counts production traffic during the run). There is no same-day Flash run
to compare with; the 26 September Flash photo eval (16 cases) had a 20 s median at $0.021 a case, about what Sonnet
costs here with the prompt cache.

### Why Sonnet missed the mango (30318)

Flash's first look listed "mango and cucumber mix 40 g" as one visible food; its catalogue candidate was Cucumber Combo
(10372, an old GPT4 food: cucumber only, 15 kcal/100 g). Sonnet answered in one step with no tool calls, taking that
candidate, and Flash's second look passed the plan. The coverage variant only covers mentions in the user's words, not
visibleFoods. Fixes, none made yet: in the agent prompt, a visibleFoods entry naming two foods is one food only when a
catalogue food's name includes both (the rule text mentions already have); have the first look list foods separately;
clean up 10372. Unknown: whether Flash passes 30318 on today's code.

## Open decisions (7 October, paused here)

- Owner likes the Sonnet direction but wonders whether Flash is the better vision model. Next cheap test: Flash low +
  coverage on the 22 photo cases only (about $0.45), same code, to compare with Sonnet's 21/22.
- Or: re-run just 30318 on both models with the visibleFoods split rule (a few cents).
- Switching (whenever decided): oneOf to anyOf, provider pinned to Anthropic, cache marker, string limits in the prompt,
  the coverage text, FeatureFlag rollout. The vision helpers (first look, second look, barcode locator) stay on Flash.
- Uncommitted: these notes, scripts/meal-model-replay.ts, scripts/mealAgentOverride.ts, and EVAL_MODEL/EVAL_EFFORT/
  EVAL_VARIANT in meal-sanity-eval, meal-resolution-smoke and meal-photo-eval.

## Next

1. The coverage text into the production prompt for Flash: the full meal eval first (about $1.30), then a FeatureFlag.
2. Haiku medium + coverage as a candidate if cost matters more than time; it needs the meal eval too (about $0.15).
3. Idea, not built: a meal that fails the backend check and is re-run goes to Sonnet at medium or high, so the
   hard minority gets the strongest model while the first try stays cheap.

---

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
