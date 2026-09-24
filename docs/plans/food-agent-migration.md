# Food matching upgrade: simple phased plan

**Updated:** 23 September 2026  
**Status:** Phases 1–2 implemented. The supported Phase 3A/3B text route is deployed with Jev selection and Gemini fallback enabled for 100% of traffic, as requested for the single-user app. The dressing omission fix is also deployed across text/image extraction and matching. Typed nutrition claims, deterministic calculations and a separately gated read-only classifier are implemented; authoritative nutrient-target saves and transactional meal groups remain the next milestone. See [live verification](../../FOOD_LIVE.md), [the dressing fix](../../FOOD_COMPOSITION.md), [nutrition constraints](../../FOOD_CONSTRAINTS.md) and [the historical benchmark](../../FOOD_AGENT_BENCHMARK.md).

## Scope

Keep the current food database, queues and app API. Improve the server in small, independently switchable steps.

Use the user's existing food history as personal context. No preference-management UI, saved aliases, recipe system or separate memory service is required. Recipes, clarification conversations and richer progress UI are later product features.

Use the existing Vercel AI SDK for the fallback, with configurable models through OpenRouter. The application owns its tools, validation and writes so a model/provider can be swapped after evaluation. Once the selected route passes shadow evaluation, hold its model versions and policy fixed during rollout; evaluate later model substitutions separately.

## Selected architecture

**Decision:** use filtered Jev for fast selection and a Gemini agent for fallback. This route is live for supported text items, with catalogue revalidation before saving and legacy fallback when unresolved. Its separate ten-case integration check and three follow-up search-recovery trials passed after fixing an observed search/read turn-budget failure. Hosted synthetic requests verified actual saved Gemini/Jev provenance; they do not establish production accuracy. The earlier one-call cascade benchmark does not validate tool-enabled fallback accuracy or production latency.

| Responsibility | Selected implementation |
|---|---|
| Fast structured selection | `typesafe/jev-1.13` through OpenRouter's Decisions API, behind a small dedicated adapter |
| Interpretation and agentic fallback | `google/gemini-3.8-flash`, low reasoning, through OpenRouter and the existing Vercel AI SDK |
| Evidence | Existing catalogue, stored servings and user-scoped food history; structured providers and web grounding enabled separately |
| Quantities, nutrient targets and meal totals | Deterministic server code with typed constraints and provenance |
| Persistence | Server-owned, validated and idempotent; the models propose results |

The target route is: **extract food and nutrition constraints → validated exact/history shortcuts → prefetch and filter → Jev → Gemini when unresolved → validate/reconcile → save**. Gemini's first fallback turn can answer from the supplied evidence or choose tools; later turns continue that same session within the shared budget. Missing evidence can route directly to Gemini without paying for a Jev call over an empty candidate set.

The initial Jev confidence gate is 0.9 for evaluation, subject to a fresh holdout. Its score alone cannot establish correctness. Keep model IDs, routing and confidence policy configurable independently of application tools and validation.

**Implementation order:** shared worker validation and the live text route are deployed. Scoped nutrition extraction and meal-total calculations now have isolated tests and real-provider checks under their own default-off shadow flag. Next connect validated constraints to candidate selection and safe group persistence; then add structured-provider evidence and grounded online tools/imports in Phase 4. Local agent tools, nutrition constraints and online grounding each need their own evaluation and rollout gate. Retain current app-compatible statuses; clarification UI remains later work.

## Phase 1 — Establish a reliable baseline

**Change:** Measure and protect the existing behaviour before replacing matching logic.

- Record matching outcome, serving accuracy, latency and cost for representative text, image and barcode inputs.
- Maintain regression cases for rice, banana/eggs, explicit weights, branded products and failed matches.
- Verify duplicate requests and queue retries cannot save a meal twice, and a failure after saving cannot hide the saved result.
- Add a server switch for each subsequent phase. Keep current response fields and status values compatible with the app.
- Put model calls behind one small adapter, preserving the current model and prompts initially.

**Test:** Existing regression cases, duplicate/concurrent requests, provider timeout and response failure after commit. Compare adapter output with the current implementation.

**Enable when:** Existing behaviour is preserved, known regressions pass and baseline latency/cost are recorded. This phase does not require new app UI.

## Phase 2 — Search the user's history

**Change:** Add one read-only tool: `searchUserFoodHistory`.

It searches the authenticated user's previous messages and successfully logged foods, returning the original text, date, food IDs, quantities, available nutrition and grouping evidence. Use existing records rather than creating a new preference or recipe database.

Start with date, text and food-name lookup, ranking relevant results by recency and frequency. Add semantic retrieval only if these searches miss real examples. Bind user identity on the server; the model cannot choose another user's history.

| Input | Behaviour |
|---|---|
| “Same smoothie as yesterday” | Find the matching logged event in the user's timezone and reuse its recorded ingredients and amounts |
| “Same breakfast as usual” | Look for a strong repeated pattern of comparable breakfasts; reuse only when evidence is sufficiently clear |
| “A scoop of protein” | Bias towards the relevant powder and serving previously logged by this user |
| “Yesterday's smoothie without banana” | Reuse that event and remove banana if the recorded ingredient breakdown supports it |
| “My regular recipe” | Search for a corresponding previously logged meal; no recipe object or hidden ingredient list is assumed |

The current message always overrides history: an explicitly different brand or quantity wins. Repetition is a ranking signal, not proof that an earlier automatic match was correct. Prefer available user edits/manual selections as stronger evidence.

Exclude deleted and failed items. Do not combine unrelated foods into a meal just because they were logged near each other. If history contains only an aggregate smoothie, the agent cannot invent its ingredients or subtract a banana accurately.

**No clarification flow yet:** When a reference is genuinely ambiguous or unsupported, leave that item unmatched through the existing failure handling. Do not ask a question the app cannot answer, or silently replace “my usual” with a generic meal. Other successfully resolved foods can still save, with truthful existing counters/status handling.

**Test:** Yesterday across timezone boundaries, multiple smoothies, repeated breakfast patterns, explicit brand overrides, deleted history, aggregate-only entries and cross-user isolation.

**Enable when:** Reviewed history-based matches improve on the baseline without increasing unsupported selections. No app changes required.

## Phase 3 — Fast selection, with an agentic fallback

**Change:** Resolve common entries quickly and spend extra model/tool calls only when the evidence needs work. Keep exact matches and arithmetic in code. The benchmark supports trying filtered Jev selection with Gemini fallback; its 72/72 result is a small synthetic regression check, not a live rollout gate.

### 3A — Filter and select from available evidence

**Deployed for supported text inputs.** The worker now also rejects missing/impossible calories before saving, including exact matches, and preserves unknown macros as null. This correctness check applies outside the shadow cohort; manual-edit endpoints are not comprehensively migrated by this change.

1. Keep reliable exact-food, exact-history and barcode routes. Apply shared nutrition/serving validation to these routes too; the benchmark exposed missing/impossible nutrition being accepted by the standard path.
2. Prefetch a bounded set of relevant catalogue foods, servings and history. Parallelize independent reads and reuse this evidence throughout the request.
3. Filter food/serving options deterministically. Missing calories, invalid serving weights, impossible nutrition and explicit brand/preparation conflicts must not become selectable answers. A single remaining option still needs semantic matching unless an existing exact route already establishes identity.
4. Ask Jev for a joint food/serving choice. Accept only a validated match that meets a confidence policy established on a fresh holdout; 0.9 is the benchmark's experimental threshold, not a calibrated correctness probability.
5. Escalate uncertain decisions with adequate evidence to Gemini. It can finish in one call; unnecessary retrieval must not become a prerequisite for answering.

An empty filtered candidate set means **no usable evidence retrieved so far**, not necessarily “this food cannot be logged.” Retain typed reasons for exclusion so the next step can distinguish missing food/serving data from a quantity that cannot be inferred safely. Never turn unknown nutrition into zero to create an eligible option.

### 3B — Let the fallback retrieve missing evidence

Give the Gemini fallback the existing evidence and a small set of read-only tools. Its first turn may finish or retrieve; it can continue within the same session when further evidence is needed. Do not always pay for a separate one-call Gemini answer and then start a new agent from scratch. Catalogue/history tools and the shared budget support `FOOD_AGENT_FALLBACK=shadow` or `on`, requiring the same fast-selector mode. Both are enabled live at 100%. Structured providers and authoritative resolution of the nutrition examples below remain planned; the live cascade still declines detected nutrition constraints while the typed contract is evaluated independently. This tool-enabled fallback is separate from the measured one-call cascade.

| Unresolved case | Fallback action |
|---|---|
| Low-confidence choice, sufficient candidates and servings | Interpret the wording and select from the existing evidence |
| Typo, colloquial food name or poor initial retrieval | Reformulate the catalogue query and read the resulting food/serving evidence |
| “Chocolate protein bar with 25 g of protein” | Treat 25 g protein per bar as identifying evidence; compare the correct serving basis, then retrieve more candidates if needed |
| “250 cals of kefire” | Normalize to kefir, match the food and derive its portion from 250 kcal using the food's documented energy basis |
| “700 cal Sweetgreen salad” | Preserve 700 kcal as a salad-group constraint; identify the dish/composition where possible and reconcile the entire group before saving |
| “Same smoothie as yesterday” or a repeated personal food | Search the user's scoped history; reuse only supported identities, grouping and quantities |
| Explicit product or serving missing from local evidence | Search structured providers; online grounding becomes available in Phase 4 |
| “A big bowl” with no authoritative quantity, equally plausible meal references, or an aggregate smoothie without ingredients | Return unresolved if the evidence cannot settle it; no invented portions or ingredients |
| Provider timeout or exhausted request budget | Return a distinct failure; do not reinterpret a transport error as missing food or restart a fresh research budget |

Initial fallback tools:

| Tool | Purpose |
|---|---|
| `searchUserFoodHistory` | Retrieve relevant previous foods and meals |
| `searchFoodCandidates` | Retry the existing food DB with a more useful query |
| `getFoodAndServings` | Read the selected food's nutrients and available servings |
| Structured-provider lookup | Read authoritative food/serving candidates; evaluate this adapter before enabling it |

The normal barcode path stays separate initially. The resolver returns a proposed food and serving with supporting evidence; server code computes quantity, validates and saves. The model does not write to the database directly, and neither Jev confidence nor a second model can override deterministic validation. Extend supported wording/servings through labelled cases and code changes, not a prompt that bypasses a failed check.

Use the current limits as a starting budget: at most three Gemini fallback turns, six evidence retrievals including prefetch, two concurrent retrievals and a shared 12-second resolver deadline. Jev, prefetch and fallback all consume that deadline; no tier restarts the clock. Batch candidate/serving reads, cache evidence within the request and search history/catalogue in parallel when both are useful. Resolve independent foods concurrently within provider limits. These are caps to evaluate, not a promise of full app latency.

Mandatory checks:

- The food and serving IDs agree, including brand and raw/cooked state.
- Explicit grams and unit conversions are handled deterministically.
- Calories and nutrients derive from the selected serving and quantity.
- Missing nutrition stays unknown rather than becoming zero.
- Invalid quantities and unsupported assumptions cannot become successful matches.
- Retries reuse the same logical item; icons/enrichment cannot fail an already saved meal.

### Nutrition statements and meal totals

These examples need a richer extraction/resolution contract, not just a different model. Preserve each nutrition statement's original text, source, unit, scope and meaning: **product-identification hint**, **consumed-portion target**, or **whole-meal total**. “25 g of protein” must not become 25 g of food, and one salad's calorie total must not be copied onto every extracted ingredient. Distinguish an exact stated value from “about,” “at least,” per-100-g labels and per-serving labels.

- **Protein bar:** use the 25 g protein claim to rank/filter matching chocolate bars at the stated one-bar serving. History can help identify the product but cannot override that explicit clue. Do not scale a different 20 g-protein bar to 1.25 bars just to force a match. If the user instead says “enough of this bar to get 25 g protein,” that is a portion target and scaling may be appropriate.
- **Kefir:** once the product and energy basis are supported, code calculates `quantity = requested_kcal / source_kcal × source_quantity`. For a hypothetical 60 kcal per 100 g kefir, 250 kcal corresponds to 416.666… g. Scale known macros with the same factor, keep missing macros unknown, and do not infer millilitres from grams without a supported conversion. Conflicting explicit weights/calories require reconciliation, not silent overrides. This inverse arithmetic can take the fast path when the evidence is already available.
- **Sweetgreen salad:** treat the stated 700 kcal as the consumed salad's total, distinct from a menu's full-portion value or an approximate estimate. Search for the correct dish, customizations and included dressing; calories alone do not identify its ingredients. Prefer a supported complete-dish record. If the salad is split into independently logged components, server code must verify their sum equals the stated total at the agreed logging precision, without also counting a parent salad row. Preserve source rounding and handle only rounding-sized residuals deterministically.

A substantial mismatch triggers a check for missing dressing/toppings, duplicates, wrong serving basis or wrong dish. Never invent ingredients, a balancing oil entry, or independently scale component weights solely to make the sum 700. Uniform portion scaling is allowed only when the evidence supports consuming that proportion of a known composition. If the composition cannot be established, preserve the user-provided 700 kcal as **one aggregate meal with unknown unprovided macros**, rather than fabricate an ingredient breakdown. This needs an explicit per-log calorie-only representation and client compatibility checks before enabling it; it must not overwrite a global food's nutrition or masquerade as a verified menu item.

Resolve and reconcile all members of a constrained meal group before committing it. Independent candidate searches can run in parallel, but saves for that group require an idempotent all-or-nothing boundary. Other unrelated foods in the message can continue independently. Store whether a value was user-stated, source-reported, calculated or estimated; retain disagreements for review instead of losing them in a model prompt.

**Current milestone:** strict typed claims, source-quote checks, product-identity checks, inverse portion arithmetic and meal-total reconciliation are implemented. A read-only model classifier can run under `FOOD_NUTRITION_CONSTRAINTS=shadow`; it does not change the existing `FoodItemToLog.nutritional_information` or save calculated values. Eight synthetic real-provider cases passed after resolving a structured-output transport failure. Next connect claims to candidate filtering and authoritative serving validation, then add idempotent all-or-nothing group persistence and client-compatible aggregate fallback. None of those live behaviours is established by the earlier 72-trial cascade result.

**Additional acceptance cases:** one bar with 25 g protein versus a 25 g-weight bar; 25 g protein per 100 g versus per bar; typo “kefire”; 250 kcal of a matched kefir; zero/missing energy basis; conflicting explicit weight and calories; exact versus approximate calorie totals; a salad with dressing included versus dressing added separately; a 700 kcal salad plus a separate 100 kcal drink (800 kcal overall); half of a menu item labelled 700 kcal (350 kcal consumed); split-item rounding; contradictory component totals; calorie-only aggregate fallback; concurrent retries with no parent/child double count. Measure extraction of constraint meaning/scope as well as final nutrient totals.

Apply the shared resolver to text first. Then migrate image-derived items and barcode fallbacks separately. Manual food selection shares serving validation but should not trigger unnecessary agent reconsideration.

**Test:** Use a fresh larger holdout, not only the benchmark's 24 cases. Compare the standard path, filtered Gemini, Jev/Gemini selection and the tool-enabled fallback. Include correct matches rejected by the first candidate search, semantic near-misses with valid nutrition, unfamiliar wording, conflicting history, missing servings, preparation/brand conflicts, genuine ambiguity, provider errors, exhausted budgets and duplicate retries. Verify low-confidence selection does not automatically trigger online search and all tiers share one deadline. Measure ordinary and escalated cases separately, including retrieval latency, escalation frequency and accepted incorrect matches. Evaluate image/barcode cases before enabling those paths.

**Enable when:** Reviewed matching quality improves, validation gaps are closed, and common-path latency remains within the agreed baseline budget. Introduce 3A in shadow first, then enable 3B separately for unresolved cases. Online tools remain unavailable until Phase 4. No new app interaction is required; unresolved items use existing truthful partial-failure handling.

## Phase 4 — Ground missing foods and safely extend the global DB

**Change:** Add `searchGroundedFood` to the agentic fallback for foods missing from the catalogue and structured providers. An explicit local-evidence gap enables this tool; low Jev confidence alone does not. Online search can resolve public product/nutrition facts, not what an individual meant by an ambiguous portion or which personal meal they ate.

**Yes, a food discovered this way can be added to the global database.** The search tool itself only returns a candidate and its source evidence. A separate server-controlled validation/save step decides whether to reuse an existing record or create a new one.

The current online fallback already calls `addFoodItemToDatabase` after retrieving food information in `findAndAddFoodFromExternalDb.ts`. This phase improves that boundary rather than inventing a second food catalogue. Wrap only read-only retrieval as agent tools; never expose the legacy combined search/import function as a tool. Web page text is evidence, never instructions for tool execution or writes.

Proposed flow:

1. Search for the product or food, favouring manufacturer/restaurant nutrition sources.
2. Extract identity, brand, preparation state, nutrients and the exact serving basis, with source URL and retrieval time.
3. Validate units, supported numeric values and product identity. A search snippet or model assertion alone is insufficient.
4. Check again for an existing equivalent food; use a concurrency-safe deduplication strategy before inserting.
5. Reuse or save the validated food, servings and available nutrients, then log the user's quantity.

Start with one focused web search and at most two source-page reads, all inside the remaining shared retrieval/deadline budget. Do not send private history text, user identifiers or personal meal descriptions to a public search provider; form a query from the necessary public food/product attributes. If time or evidence runs out, return unresolved through the current worker status handling rather than publish provisional nutrition as a saved result.

Do not mark an automatically extracted food as manually verified. Preserve provenance and distinguish sourced values from calculations. If existing fields cannot retain that evidence, add minimal supporting storage before enabling imports.

Private history, “Seb's usual smoothie” and personal meal combinations must not become shared global foods. Reuse their component IDs for the user's log. Uncertain web candidates remain unmatched; they are not saved globally just to make logging succeed.

Keep the current search provider as the baseline. Compare Exa and Brave behind the same interface on missing-food examples; choose based on correct-source retrieval, usable serving data, latency and cost. Adding either is optional, not a prerequisite for Phases 1–3.

**Test:** Duplicate products, concurrent imports, wrong market/brand, per-package versus per-serving values, conflicting pages, missing nutrients, tool-instruction text in sources and unsupported model claims. Verify public search queries exclude personal history and that online work cannot bypass request limits or duplicate a save. Shadow tests must never insert global foods.

**Enable when:** New records have attributable nutrition and serving data, deduplication works, and false imports do not increase. Use separate switches for grounded lookup and global insertion so insertion can be disabled independently.

## Phase 5 — Later app features

These are deliberately outside the initial server rollout:

- **Clarification UI:** Ask which smoothie, brand or portion the user meant; resume the same pending item after their answer without duplicating saved items.
- **Richer progress and optimistic previews:** Show real stages and clearly provisional results, then reconcile with committed food IDs. Existing status/counter updates remain the initial feedback mechanism.
- **Saved recipes and explicit defaults:** Add creation/editing UI and storage only when the product supports them; then introduce recipe/default tools.

Each needs a separate mobile/server contract and app capability check. Do not enable new questions, statuses or draft nutrition for clients that cannot handle them.

## How each server phase rolls out

Use independent flags such as `food_history_search`, `food_fast_selector`, `food_agent_fallback`, `food_nutrition_constraints`, `food_agent_image`, `food_grounded_search` and `food_grounded_import`. History, text shadow, fast selector, agent fallback and nutrition shadow switches are implemented. Image-agent and grounding/import switches remain future capabilities; unsupported live modes fail closed. The older `food_agent_text` comparison does not run alongside the live selector route. Keep selector, local agent fallback, nutrition constraints, online lookup and global insertion independently disableable. Record the selected configuration for each request/job so retries remain consistent.

1. **Offline tests:** Compare against reviewed food examples, including expected unmatched outcomes.
2. **Shadow:** Run the new logic alongside the current path on a limited sample, without changing logs, global foods or user data. Review disagreements.
3. **Internal accounts:** Verify actual saved results and existing app behaviour.
4. **Activation:** For the current single-user app, enable a verified feature at 100% as requested; a cohort is unnecessary. Keep its own switch and rollback path. Reintroduce staged cohorts if the app gains more users.
5. **Rollback:** Disable new admissions to the failing feature. Finish or safely recover in-flight work; never blindly rerun committed items through the old pipeline.

Measure correct food/quantity, unsupported selections, completion rate, duplicate saves, p50/p95 latency and cost per successful meal. Record the route and escalation reason separately: exact/history reuse, Jev, one-call Gemini, local agent or grounded lookup. Measure agent recovery of initially unresolved cases alongside its extra latency and cost. Require all critical regression tests to pass and no known cross-user exposure or duplicate-write failures. As an initial guardrail, pause if common-path p95 latency worsens by more than 10%; review any cost increase against the measured accuracy gain.

Review enough relevant examples to judge each feature. At the current low traffic, production percentiles and accuracy cannot be inferred from a few successful synthetic requests. Keep image, model and search-provider changes separate so failures are attributable.

**Current implementation:** Phases 1–2, separately gated exact-history reuse, live filtered Jev/Gemini text matching, dressing preservation and the first nutrition-constraint shadow milestone. Next: use verified constraints in resolution and persistence, then reconcile grouped writes safely. Phase 4 adds online grounding and separately gated imports. No recipes, preference UI, clarification UI or new memory platform is required.
