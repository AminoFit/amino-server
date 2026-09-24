# Phase 1: food baseline and rollout controls

## What ships

- `src/foodResolution/model.ts` is the application entry point for the existing food reasoning transport. Time inference, candidate ranking and serving reasoning use it. Existing extraction/vision and external-provider transports remain unchanged and are instrumented through their existing usage logger where available. No model, prompt, timeout or fallback was changed; AI SDK installation is a later transport change.
- Opt-in structured events measure request, extraction, reasoning and worker duration; item outcomes and available model usage are recorded separately. The new event schema excludes meal text, user objects, images and secrets. Existing legacy application logs are not made private by this change.
- Atomic message claims prevent simultaneous initial requests from enqueueing the meal twice. An active processing message cannot be edited through this endpoint. Completed edits compare the observed completion timestamp as well as status/content. This is not a durable edit-revision or crash-recovery system.
- The HTTP route can return an authenticated user's already committed, fully resolved result after a processing response failure. Queue redelivery of a committed item refreshes progress instead of processing it again.

## Configuration

`FOOD_BASELINE_TELEMETRY=true` enables events; it is off by default. Export the JSON event messages from server logs into a JSONL file and run:

```sh
node scripts/food-baseline/report.cjs /path/to/food-events.jsonl
```

The report separates input classes/stages and includes sample counts, outcome counts, p50/p95 durations, tokens and provider-reported costs. A missing price is `null`, not zero. Cost coverage is reported explicitly. Some existing providers do not report cost; token totals alone are not a dollar estimate. Request and worker timings are separate, not end-to-end meal completion time. Trace IDs distinguish attempts; message IDs allow investigation across workers. Repeated request observations are not unique meals.

Feature switches use `FOOD_HISTORY_SEARCH`, `FOOD_AGENT_TEXT`, `FOOD_FAST_SELECTOR`, `FOOD_AGENT_FALLBACK`, `FOOD_NUTRITION_CONSTRAINTS`, `FOOD_AGENT_IMAGE`, `FOOD_GROUNDED_SEARCH`, `FOOD_GROUNDED_IMPORT`, with supported values `off`, `shadow` or `on` and corresponding `_PERCENT` values from 0–100. Cohorts are stable per user and feature; 100 enables every user. Invalid settings fail closed. `FOOD_KILL_SWITCH=true` disables rollout features independently of telemetry. The selected Jev/Gemini route now supports live mode; see [live rollout](FOOD_LIVE.md).

**Phase 2 now registers history shadow mode and a separate exact-reference reuse switch:** see `FOOD_HISTORY.md`. **Phase 3 registers the older text-agent shadow comparison and separate `FOOD_FAST_SELECTOR` / `FOOD_AGENT_FALLBACK` shadow or live modes:** see `FOOD_AGENT.md` and `FOOD_LIVE.md`. The fallback requires the same enabled mode as the fast selector; the live route takes precedence over older shadow comparisons. Reports include route and fallback-reason counts. `FOOD_NUTRITION_CONSTRAINTS` supports only shadow mode, described in `FOOD_CONSTRAINTS.md`. `FOOD_AGENT_TEXT=on` and other unimplemented modes remain off; implementations must register supported modes before activation. No agent imports are implemented. Live import also requires live grounding. These environment-backed controls require environment refresh/redeployment; they are not a remotely editable flag service. Configuration is captured per execution; persisted cross-deployment job snapshots belong with later durable execution work.

## Verification and release gate

```sh
node --test tests/*.test.cjs
./node_modules/.bin/tsc --noEmit
```

The regression suite includes exact rice and explicit mass, serving ambiguity, wrong-brand rejection, mixed outcomes, provider failures, duplicate initial submissions, post-commit HTTP recovery, queue redelivery and ownership checks. New tests cover cohort stability, disabled features, model-adapter parity, concurrent telemetry isolation and report calculations.

`tests/fixtures/food-baseline.json` is the seed review set. Its rice/banana/eggs numbers derive from the earlier audited records; other entries describe rejection constraints. Expand it with reviewed branded, barcode and image cases before their replacements are enabled. No photo accuracy claim is made from text fixtures.

The 56-test regression suite uses isolated database/provider substitutes. A separate integration script, `scripts/food-baseline/verify-claims.cjs`, was also run successfully against disposable local PostgreSQL 14.20 on 23 September 2026. It uses the installed Supabase client with a small PostgREST response bridge executing real SQL. Exactly one of 20 competing initial requests claimed the message; active processing, wrong-owner, deleted-message and stale-edit claims were refused; exactly one of 20 current edit requests claimed the completed message.

To repeat against a disposable local database named `amino_phase1_test`:

```sh
FOOD_TEST_DATABASE_URL=postgresql://127.0.0.1:55439/amino_phase1_test node scripts/food-baseline/verify-claims.cjs
```

The script refuses non-local/non-test databases, creates its own schema, and removes that schema afterwards. The test server used during this review was shut down. This proves PostgreSQL conditional-update concurrency, not hosted PostgREST behaviour, production permissions, throughput or real-provider matching accuracy. A deployed Supabase smoke test remains a release gate. The change has no schema migration.

After deployment, enable telemetry for the baseline observation window. Review representative text, branded, image and barcode outcomes against source food/serving data; record correct identity/quantity, unsupported selections, failure rate and cost coverage alongside timing reports. Do not infer matching accuracy from `Processed` alone. Do not enable a later phase until this evidence is recorded. The local smoke sample below is available; it is too small to establish production percentiles or matching accuracy.

## Known boundaries

- Claims stop duplicate initial admission, but a crash after claiming and before enqueueing still requires recovery. Do not automatically reset such messages and risk duplicating partially saved foods.
- Concurrent workers may still perform duplicate provider work before updating the same existing item. Durable worker leases, revision-safe edits, transactional enqueueing and global catalogue deduplication require subsequent work; this phase does not claim exactly-once processing.
- Existing app status fields are preserved. There are no recipes, clarification questions or provisional nutrition in this release; Phase 2 adds history shadowing and separately gated exact-reference reuse.
- Rollback the code if claim behaviour is incompatible with an older client; disable telemetry independently if logging volume is excessive. Never bulk reprocess completed messages as a rollback step.

## Local HTTP smoke test — 23 September 2026

Ran the current Next.js API at `127.0.0.1:3100` with a local Quirrel queue at `127.0.0.1:9181`, hosted Amino Supabase and real model providers. Used only the existing synthetic test account; no production server deployment was needed.

- Input: `100 g apple`, synthetic message 30271.
- Two concurrent HTTP requests returned 200 in 4,658 ms and 1,856 ms. Only one logged item (52207) was created.
- Final result: `RESOLVED`, 1/1 processed, food ID 6, 100 g, 54.945 kcal.
- Retry after completion returned HTTP 200 in 186 ms, retaining exactly one logged item.
- Telemetry captured extraction, model usage, request and worker stages. Extraction used gpt-4o-mini; time reasoning used OpenRouter google/gemini-3.8-flash. Worker duration was approximately 541 ms.
- Soft-deleted only this test's message and logged item and stopped the local API/queue afterwards. The user's original apple message 30270 was not changed.

This exercises the real hosted PostgREST/auth boundary and locally modified HTTP/queue code, including the claim race. The wall-clock HTTP figures include local development overhead; a single smoke case is not a production latency baseline. Image, branded-food and broader accuracy review remain outstanding.
