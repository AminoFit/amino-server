# Food matching upgrade: simple phased plan

**Updated:** 23 September 2026  
**Status:** Plan only. No production changes. This replaces the earlier, broader proposal.

## Scope

Keep the current food database, queues and app API. Improve the server in small, independently switchable steps.

Use the user's existing food history as personal context. No preference-management UI, saved aliases, recipe system or separate memory service is required. Recipes, clarification conversations and richer progress UI are later product features.

Keep the proposed Vercel AI SDK adapter, with configurable models through OpenRouter. The application owns its tools, validation and writes so a model/provider can be swapped after evaluation. Do not change the model and matching behaviour in the same rollout.

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

## Phase 3 — Introduce the bounded food agent

**Change:** Replace rigid ambiguous-match steps with one resolver that can choose which evidence to retrieve. Keep exact matches and arithmetic in code.

Initial tools:

| Tool | Purpose |
|---|---|
| `searchUserFoodHistory` | Retrieve relevant previous foods and meals |
| `searchFoodCandidates` | Search the existing food DB and structured nutrition providers |
| `getFoodAndServings` | Read the selected food's nutrients and available servings |
| `lookupBarcode` | Find an exact product when a barcode is available |

The resolver returns a proposed food and quantity. Server code validates and saves it. The model does not write to the database directly.

Start with at most three model steps, a shared deadline and bounded tool concurrency. Search history and the food catalogue in parallel when both are useful. Resolve independent foods concurrently within provider limits. Skip agent calls for reliable exact matches.

Mandatory checks:

- The food and serving IDs agree, including brand and raw/cooked state.
- Explicit grams and unit conversions are handled deterministically.
- Calories and nutrients derive from the selected serving and quantity.
- Missing nutrition stays unknown rather than becoming zero.
- Invalid quantities and unsupported assumptions cannot become successful matches.
- Retries reuse the same logical item; icons/enrichment cannot fail an already saved meal.

Apply the shared resolver to text first. Then migrate image-derived items and barcode fallbacks separately. Manual food selection shares serving validation but should not trigger unnecessary agent reconsideration.

**Test:** Replay the same labelled inputs against old and new matching. Include raw/cooked rice, serving ambiguity, explicit brands, tool errors, exhausted budgets, mixed successes and retries. Evaluate image/barcode cases before enabling those paths.

**Enable when:** Matching accuracy improves, deterministic regressions pass, and common-path latency remains within the agreed baseline budget. No new app interaction required. Jev is deferred unless later evaluation demonstrates a specific benefit.

## Phase 4 — Ground missing foods and safely extend the global DB

**Change:** Add `searchGroundedFood` for foods missing from the catalogue and structured providers.

**Yes, a food discovered this way can be added to the global database.** The search tool itself only returns a candidate and its source evidence. A separate server-controlled validation/save step decides whether to reuse an existing record or create a new one.

The current online fallback already calls `addFoodItemToDatabase` after retrieving food information in `findAndAddFoodFromExternalDb.ts`. This phase improves that boundary rather than inventing a second food catalogue.

Proposed flow:

1. Search for the product or food, favouring manufacturer/restaurant nutrition sources.
2. Extract identity, brand, preparation state, nutrients and the exact serving basis, with source URL and retrieval time.
3. Validate units, supported numeric values and product identity. A search snippet or model assertion alone is insufficient.
4. Check again for an existing equivalent food; use a concurrency-safe deduplication strategy before inserting.
5. Reuse or save the validated food, servings and available nutrients, then log the user's quantity.

Do not mark an automatically extracted food as manually verified. Preserve provenance and distinguish sourced values from calculations. If existing fields cannot retain that evidence, add minimal supporting storage before enabling imports.

Private history, “Seb's usual smoothie” and personal meal combinations must not become shared global foods. Reuse their component IDs for the user's log. Uncertain web candidates remain unmatched; they are not saved globally just to make logging succeed.

Keep the current search provider as the baseline. Compare Exa and Brave behind the same interface on missing-food examples; choose based on correct-source retrieval, usable serving data, latency and cost. Adding either is optional, not a prerequisite for Phases 1–3.

**Test:** Duplicate products, concurrent imports, wrong market/brand, per-package versus per-serving values, conflicting pages, missing nutrients and unsupported model claims. Shadow tests must never insert global foods.

**Enable when:** New records have attributable nutrition and serving data, deduplication works, and false imports do not increase. Use separate switches for grounded lookup and global insertion so insertion can be disabled independently.

## Phase 5 — Later app features

These are deliberately outside the initial server rollout:

- **Clarification UI:** Ask which smoothie, brand or portion the user meant; resume the same pending item after their answer without duplicating saved items.
- **Richer progress and optimistic previews:** Show real stages and clearly provisional results, then reconcile with committed food IDs. Existing status/counter updates remain the initial feedback mechanism.
- **Saved recipes and explicit defaults:** Add creation/editing UI and storage only when the product supports them; then introduce recipe/default tools.

Each needs a separate mobile/server contract and app capability check. Do not enable new questions, statuses or draft nutrition for clients that cannot handle them.

## How each server phase rolls out

Use independent flags such as `food_history_search`, `food_agent_text`, `food_agent_image`, `food_grounded_search` and `food_grounded_import`. Record the selected configuration for each request/job so retries remain consistent.

1. **Offline tests:** Compare against reviewed food examples, including expected unmatched outcomes.
2. **Shadow:** Run the new logic alongside the current path on a limited sample, without changing logs, global foods or user data. Review disagreements.
3. **Internal accounts:** Verify actual saved results and existing app behaviour.
4. **Gradual cohorts:** Enable for stable user groups at 5%, 25%, then 100%, reviewing each step before expanding.
5. **Rollback:** Disable new admissions to the failing feature. Finish or safely recover in-flight work; never blindly rerun committed items through the old pipeline.

Measure correct food/quantity, unsupported selections, completion rate, duplicate saves, p50/p95 latency and cost per successful meal. Require all critical regression tests to pass and no known cross-user exposure or duplicate-write failures. As an initial guardrail, pause if common-path p95 latency worsens by more than 10%; review any cost increase against the measured accuracy gain.

Observe at least a full day and enough relevant examples at each cohort step to judge the feature. Low traffic requires more time and reviewed test cases, not an automatic rollout. Keep image, model and search-provider changes separate so failures are attributable.

**First implementation:** Phase 1, then history search in shadow mode. No recipes, preference UI, clarification UI or new memory platform is needed to begin.
