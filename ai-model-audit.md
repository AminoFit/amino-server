# Amino AI models and pipeline audit

**Date:** 24 September 2026
**Scope:** Historical audit of the pre-cleanup application. Subsequent code changes and rollout gates are tracked in [the implementation status](./ai-model-implementation-status.md).
**Source baseline:** `f3bfc67` (`Record live coffee and milk verification`). Concurrent serving-update work belongs to a separate task.
**Implementation handoff:** [AI consolidation and cleanup plan](./ai-model-cleanup-plan.md).

**Decisions confirmed after the audit:** Flash is the only general model for now; keep current vectors; category/icon enrichment may finish after food logging; use Jev for categorization; use Exa through OpenRouter as the planned search integration. These decisions are recorded in the handoff. Subsequent implementation and synthetic Jev evaluation are documented separately.

## Decision

Consolidate normal AI work around **Gemini 3.8 Flash plus Jev 1.13**, with one image generator and the current embedding model/vectors preserved as an explicit exception. Flash should handle extraction, image understanding, interpretation, and evidence-grounded completion. Jev is the approved direction for taxonomy classification as well as the food/serving choices it already makes, with quality validation before rollout. Deterministic code should own arithmetic, validation, and writes.

Do not introduce Luna as the routine extraction model. Throughput is a stated product priority, and the small measurement below favors Flash. The user confirmed Flash only: bounded retries, then an explicit unresolved result. A second general model is outside this cleanup scope.

Exa through OpenRouter is the planned replacement for **Google results → custom scraping → HTML conversion**, subject to nutrition-source and latency validation. The plan now evaluates this integrated route rather than requiring a standalone Exa adapter or credential.

## Evidence and limits

The audit examined server source, maintenance and experiment scripts, model environment-variable names and nonsecret values, SDK versions, vector migrations, previous food-agent reports, and official provider documentation. It also made a read-only, paginated query of `OpenAiUsage` and six synthetic streaming requests outside the application.

The usage query selected only `modelName`, `provider`, `createdAt`, `promptTokens`, and `completionTokens`; no message text or user IDs were retrieved. The hosted application configuration was not freshly exported. Local `.env.prod` selects `FOOD_REASONING_MODEL=google/gemini-3.8-flash`; prior deployment evidence in [FOOD_LIVE.md](./FOOD_LIVE.md) documents the enabled Jev/Gemini route. Historical deployment notes are not proof that every current hosted variable still matches them.

The server issues temporary Deepgram credentials but does not select the transcription model. Mobile transcription selection therefore remains outside this server-only audit. The email and Anthropic failed-request logs were not available, so the exact invocation responsible for the Haiku warning is not proven.

## Actual recorded model usage

The query covered **2026-08-25 19:53:04 UTC through 2026-09-24 19:53:04 UTC**. It returned all **195 rows**, below the 50,000-row audit cap.

| Recorded provider/model | Calls | Input tokens | Output tokens | Latest recorded call, UTC |
|---|---:|---:|---:|---|
| OpenRouter / `google/gemini-3.8-flash` | 133 | 296,007 | 14,502 | Sep 24, 14:47:16 |
| OpenAI / `gpt-4o` | 33 | 203,851 | 12,327 | Sep 24, 14:47:14 |
| OpenAI / `gpt-4o-mini` | 24 | 58,898 | 2,597 | Sep 24, 14:46:46 |
| OpenAI / `gpt-3.5-turbo-instruct-0914` | 3 | 437 | 96 | Sep 24, 14:11:41 |
| Vertex / `gemini-2.5-flash` | 2 | 5,643 | 0 | Sep 23, 19:46:56 |

[Raw aggregate evidence](./ai-model-audit-evidence/2026-09-24-model-usage.json).

These are application usage records, not a complete provider billing export. The table may include synthetic and maintenance work. Failed requests are generally absent; cached responses produce no new provider call; Jev and agent usage also appear in separate telemetry. Images and embeddings are not comprehensively represented. No Haiku row in this window does **not** contradict an email about an attempted request.

## Model inventory and reachability

“Active” below means a callable path from a current application operation was traced. “Recorded” means the model appears in the usage query, which cannot identify its function because `OpenAiUsage` does not store a stage.

| Operation | Current selection | Reachability and disposition |
|---|---|---|
| Text food extraction | Hardcoded `gpt-4o-mini` | Active: `logFoodItemExtract/logFoodItemStreamChat.ts:281`. Move to shared Flash extraction after composition/schema checks. |
| Food photos and labels | Hardcoded `gpt-4o` | Active: `logFoodItemWithImageExtract/logFoodItemWithImageStreamChat.ts:263`. Flash supports image input; compare actual images before replacement. Preserve barcode and image-preprocessing paths. |
| Time inference | Shared `FOOD_REASONING_MODEL` | Active: `messageTime/extractMessageTime.ts:225`. Local production env selects Flash; source default is GPT-4o mini. It runs concurrently with extraction. |
| Local food semantic matching | Shared `FOOD_REASONING_MODEL` | Active despite name `matchFoodItemToLocalDbLlama.ts:234`. This is already a shared adapter, not a live Llama call. Rename and consolidate; do not delete its live behavior based on the filename. |
| Serving interpretation | `VERTEX_SERVING_MATCH_MODEL` or shared model | Active: `getServingSizeFromFoodItem.ts:162`. Explicit gram parsing already avoids a model. Other serving requests still use an independent model call and retries. |
| Food/serving selector | `typesafe/jev-1.13` | Active when configured: `foodResolution/agent/jev.ts:7`. Typed Decisions API, not chat completions. Keep and make reusable across decision tasks. |
| Agent and uncertain-selection fallback | `FOOD_FALLBACK_MODEL`, default `google/gemini-3.8-flash` | Active cohort path; shared read-only tools, evidence checks and deterministic validation already exist. Preserve the recent work. |
| Nutrition-claim extraction | `FOOD_CONSTRAINT_MODEL`, default Flash | Separately gated shadow classifier. It must not silently become authoritative merely because models are centralized. |
| External database candidate choice | `gpt-3.5-turbo-instruct-0914`, retry `gpt-4-0613` | **Still active** through `findBestFoodMatchExternalDb` when the top embedding result is insufficient. Three old-instruct requests were recorded in the audit window. This is not removable until its caller has a replacement. |
| Missing serving/food metadata | Hardcoded `gpt-4o` | Active: `completeMissingFoodInfo.ts:154`, with a Serper search. Consolidate with evidence-grounded import; retain behavior until replacement covers missing fields. |
| Online food import | Hardcoded `gpt-4o` | Active: `getFullFoodInformationOnline.ts:98`, with Serper and scraped text. Requires source/provenance improvements as well as a model swap. |
| New-food categorization | Hardcoded `gpt-4o` | The normal import path calls `classifyFoodItemToCategoryGPT`, not the Haiku-named default. Move to a single classifier; evaluate Jev. |
| Bulk categorization | `claude-3-haiku` | `scripts/classifyFoodItem/classifyFoodItem.ts` calls `classifyFoodItemToCategory`, which requests Bedrock first and may fall through to Anthropic/Vertex. This is a plausible origin of the warning. |
| Food icon generation | `dall-e-3` plus ClipDrop | Active queue, independent of whether an icon is needed on every meal. Replace with a current native-alpha image model. |
| Catalogue, food-search and icon embeddings | BGE base English v1.5 | Active via Cloudflare, with a DeepInfra fallback. Same semantic model, different hosts. Existing 768-dimensional vectors require compatibility. |
| ADA embeddings | `text-embedding-ada-002` | Helper/cache branch and a test route remain. Determine real ADA consumers before deleting; do not replace vectors in place. |
| Speech | Deepgram, model selected elsewhere | Server creates temporary credentials; inspect the mobile repository before selecting or retiring a speech model. |

### Dormant or historical model surfaces

These should disappear as executable production code where their callers are obsolete; retain historical benchmark results as historical evidence.

- Three GPT-3.5 fine-tunes: serving match `ft:gpt-3.5-turbo-1106:hedge-labs::8oaRSJIo`, local matching `...::8nXQZjeQ`, and old time extraction `...::8utlaQAo`.
- Old OpenAI defaults/variants: `gpt-3.5-turbo-0613`, `gpt-3.5-turbo-1106`, `gpt-3.5-turbo-instruct`, `gpt-4-0613`, `gpt-4-0125-preview`, `gpt-4-1106-preview`, and `gpt-4-vision-preview`.
- Claude 3 Haiku/Sonnet/Opus and Claude 3.5 Sonnet aliases, with direct API, Bedrock and Vertex snapshot mappings. The same wrapper has duplicated mapping tables and diagnostic functions.
- Fireworks Llama 3 70B and Mixtral 8x7B; Groq `llama3-70b-8192`; old Gemini 1.5 streaming variants; Vertex Gemini 2.5 diagnostics.
- Perplexity `sonar-medium-online`, referenced through an old helper rather than the current Serper import flow.
- Offline/model-comparison scripts: Mixtral via Anyscale/DeepInfra/OpenRouter, `mistral-small`, old GPT-4 fine-tuning generation, BGE large, and `thenlper/gte-base`. These are not evidence that every model is used in production.
- Recent `scripts/food-agent` experiments include Flash, Jev, and DeepSeek V4.1 Flash. Preserve the measured results and clearly separate opt-in comparisons from runtime defaults.

Prompt dictionaries also contain old model IDs as **template keys**. They are not necessarily requests. Replace the dictionaries with task-named prompts; do not count each key as another running model.

## Important findings

### 1. The Haiku incident exposes a maintenance-path gap

The default categorization export requests `claude-3-haiku` with provider `bedrock`. The wrapper tries other mapped providers after failures; its direct mapping is `claude-3-haiku-20240307`. The bulk categorization script invokes that export and runs `main()` when executed. Normal food insertion calls the separate GPT classifier.

Anthropic lists Haiku 3 as retired on **20 April 2026**. Its published current Haiku API entry is Haiku 4.5; this audit does not assume an announced/future Haiku 5.5 API identifier exists. There is no reason to keep an Anthropic integration solely for this closed-label task. [Anthropic deprecations](https://platform.claude.com/docs/en/about-claude/model-deprecations), [current models](https://platform.claude.com/docs/en/models/overview).

The durable fix is one classifier for runtime and maintenance, plus an enforced model registry. Merely replacing the literal in one Haiku call would leave the duplicated machinery in place.

### 2. “Legacy” code still contains a live external matching stage

`findAndAddFoodFromExternalDb.ts:197` calls `legacy/matchFoodItemtoExternalDb.ts`. That helper uses the old Completions endpoint, relies on `stop: "}"`, appends a closing brace, and repairs model-written JSON. Its retry changes both model and output protocol to deprecated function calling. The function schema's required-field spelling does not match its similarity property.

Replace the behavior with a finite candidate choice (Jev where justified, Flash when necessary) and validate membership in the supplied candidates. Do not change only the model name: a modern chat model on the old `/completions` request is not a migration.

### 3. The pipeline repeats interpretation and evidence work

The supported modern text path already does exact/history shortcuts, filtered joint food/serving selection, a bounded Gemini tool loop, and server validation. If it declines, the older path can still do local matching, external matching, serving interpretation, online search, missing-field completion, classification and icons.

This gives two potential optimizations:

1. Share evidence and a request deadline across recovery, so the fallback does not start another independent investigation.
2. Merge compatible interpretation outputs into one Flash extraction contract: food/component identity, relevant time wording and typed nutrition claims. Compute dates, units and nutrient totals in code.

Time inference currently runs **in parallel** with extraction. Combining it may reduce calls but is not automatically faster. Measure the resulting schema size and completion time before committing to one merged request.

### 4. Categorization fits Jev; the taxonomy needs repair first

The caller consumes `ID` and `subcategoryName`. It does not use the generated reasoning, top-three candidates or explanation. Jev is specifically intended for classification/routing and returns typed decisions. [Jev model documentation](https://openrouter.ai/typesafe/jev-1.13).

At the audited baseline, the taxonomy had **403 named leaf entries, 402 unique IDs**. `F-8-3` meant both **Celery** and **Tomatoes** at `foodItemCategories.ts:236–237`. An object keyed by ID would silently erase one category. Existing examples also taught “Hazelnut Butter” → “Almond butter” despite an “Other Nut Butters” category. A newer model cannot correct an inconsistent data contract reliably. The implementation assigned Tomatoes `F-8-11`; the guarded data migration is still pending.

Proposed contract: validated choice key → canonical category ID → server-derived name, with `none` available. Preserve family/subcategory context. Compare one flat taxonomy decision with a staged family/leaf decision only if size/accuracy requires it; an extra mandatory stage adds latency and can lock out the correct family.

At audit time, a live full-taxonomy probe had **not run** because automatic approval review initially rejected the payload. The user later explicitly authorized sending the nonconfidential category labels and synthetic food names through OpenRouter. The implementation ran four synthetic sets, recorded in [the implementation status](./ai-model-implementation-status.md), and chose a 0.9 category cutoff from the observed accuracy/coverage tradeoff. The existing 0.9 food-selector threshold was not assumed to transfer automatically.

### 5. Serper is not intrinsically obsolete; its surrounding scraper is fragile

The current `getFoodInfoOnline.ts`:

- Throws for a missing Serper key at module import, even when the current operation needs no web search.
- Sends a fixed nutrition keyword query and assumes an `organic` array exists, without checking HTTP status.
- Does not set a deadline for the search request; separate HTML fetches have a two-second timeout.
- Attempts domain diversity by comparing against the first result, rather than tracking all selected domains.
- Excludes PDFs, which can contain authoritative restaurant nutrition tables.
- Scrapes only selected HTML elements, losing sites whose useful data lives elsewhere, including scripts/tables/structured data.
- Combines text while discarding title, URL, date and per-source identity.
- Calls `trimToToken(combinedText, 1000)` but discards its return value, so the intended bound is ineffective.

Exa can return search results with page contents, eliminating much of the scrape-and-convert layer. Its published standard search price is **$7 per 1,000 requests** including up to ten results; standalone contents are separately priced. [Exa Search](https://exa.ai/docs/reference/search), [Exa pricing](https://exa.ai/docs/admin/pricing).

Serper's starter package is **$50 for 50,000 credits**, or **$1 per 1,000 queries**, before tax; its own description gives typical query latency of 1–2 seconds. This excludes Amino's fetching, extraction and LLM costs. [Serper pricing and behavior](https://serper.dev/).

**Updated direction:** evaluate Exa through OpenRouter against the Serper baseline. Preserve structured nutrition databases as the first evidence tier. Compare complete, correctly sourced food outcomes; remove Serper and the scraper after the gate passes. No direct Exa or third search integration is required by this plan. The direct-API pricing above is background context; use the selected integration's actual usage for cost comparison.

The user supplied [OpenRouter's Exa server-tool documentation](https://openrouter.ai/docs/guides/features/server-tools/web-search#exa). The handoff now specifies this route and its source-coverage checks.

### 6. Icons can lose an entire external service

The queue calls DALL·E 3, downloads its URL, then uploads the bytes to ClipDrop for background removal. OpenAI documents DALL·E 3's shutdown as **12 May 2026**. [OpenAI deprecations](https://developers.openai.com/api/docs/deprecations).

Evaluate `gpt-image-2.5-flare` for new icons. Current image guidance supports transparent PNG/WebP output and base64 image responses, which can go directly into the existing upload path. This could remove both the intermediate download and ClipDrop. Verify alpha output, visual consistency, account access and cost before rollout. Existing icons should be reused. [Image generation guidance](https://developers.openai.com/api/docs/guides/image-generation).

### 7. Embeddings are a data migration, not a string replacement

BGE base v1.5 appears in catalogue matching, USDA retrieval, food search, icon similarity and offline indexing. The database has BGE 768-dimensional and ADA 1,536-dimensional columns, with index/RPC queries comparing vectors in the same space.

Even a replacement with the same dimensions cannot be mixed into those caches or columns. The user explicitly chose to preserve the current embedding model and vectors. Centralize the existing identity and remove only provably unused code; keep active preprocessing, caches, columns and indexes intact. A future model change would require a separately requested, versioned reindexing migration. Retire an ADA helper branch only after establishing no necessary consumers; do not delete stored vectors in this cleanup.

### 8. Caching and telemetry still encode old assumptions

`chatCompletion.ts` caches using the first system and first user messages, not the full conversational input. Its callers often encode only response-format **type**, not the schema. The Redis cache keeps outputs for 30 days. A new model/template/schema should not reuse an incompatible result.

Streaming wrappers estimate usage with a GPT tokenizer and fixed image-token heuristics, and do not comprehensively reject non-success terminal reasons before caching. These estimates cannot serve as reliable Flash TPS or cost measurements. Consolidate telemetry with actual provider usage, finish reason, stage, time to first content, output duration, model and fallback reason; label estimates explicitly.

`getFullFoodInformationOnline` writes a fixed `foodInfoSource: "GPT4"`; an older mapper returns `"User"` for unrecognized models. Plan provenance independently from the model ID, or changing the model can produce misleading source attribution.

## Flash versus Luna: measured probe

Three interleaved synthetic text-extraction requests per model, from the local machine. Flash used OpenRouter, low reasoning, temperature 1. Luna used direct OpenAI, reasoning none, temperature 0. Both requested JSON and disabled client retries. The short prompt was identical; it was **not the full production extraction prompt/schema**.

| Model | First-content latency, three runs | Total request time, three runs | Median total |
|---|---|---|---:|
| Flash 3.8 | 902 / 790 / 760 ms | 1,472 / 969 / 866 ms | **969 ms** |
| Luna | 2,037 / 880 / 797 ms | 3,277 / 1,983 / 1,824 ms | **1,983 ms** |

[Probe evidence](./ai-model-audit-evidence/2026-09-24-flash-luna-probe.json).

Approximate common-tokenizer output rates were 468/775/1,435 tokens/s for Flash and 149/151/165 for Luna. **Do not treat those as stable model throughput numbers.** Responses were only 138–261 common-tokenizer tokens, first-to-last-content timing is sensitive to chunk batching, outputs had different lengths, providers/routes differed, and first-request connection setup was not isolated. No reasoning tokens were reported in these six responses. All six were parseable JSON; differing food counts mean this is not a correctness comparison.

The evidence is sufficient to reject an unmeasured assumption that Luna should replace Flash on the latency-sensitive path. It is insufficient to establish production p95, long-output TPS, vision quality or a universal speed ratio. The implementation plan specifies the real benchmark before model substitution.

## Target footprint and work priority

| Responsibility | Target |
|---|---|
| General text, vision and evidence reasoning | One Flash model, stage-appropriate schema and output budget |
| Finite choices: catalogue/serving, then taxonomy | Jev, with accuracy/abstention gates; Flash on justified uncertainty |
| Arithmetic, nutrient reconciliation, IDs, dates and writes | Deterministic server code |
| Icons | One native-transparent image model |
| Retrieval vectors | Current embedding model and vectors retained; no migration in this cleanup |
| General-model recovery | Flash only; bounded retries then unresolved |
| Search | Exa through OpenRouter after validation; remove Serper and obsolete scraping code |

Prioritize: eliminate the retired maintenance and icon routes; replace the live instruct matcher; establish the registry; simplify taxonomy/classification with Jev; consolidate shared interpretation and evidence; migrate search to OpenRouter Exa after validation. Keep current vectors and move category/icon enrichment after logging.

The six old provider-wrapper files alone total **2,129 lines**. That is a concrete deletion opportunity, not a promise that every line is dead today. Thousands more lines reside in old pipelines, diagnostic functions and repeated prompts. The plan lists removal dependencies so a large deletion does not accidentally remove live external-food coverage.
