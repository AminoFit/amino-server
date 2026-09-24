# Amino app–server responsiveness: implementation handoff

Prepared for GPT6-Sol on September 24, 2026. This is an implementation plan. The progress note below records subsequent work; proposals elsewhere in this document are not evidence of deployment.

### Implementation progress, September 24, 2026

An initial contained slice has been implemented. The serving endpoint now verifies identity without loading the full profile, restricts mutable fields, checks food and meal ownership/processing state, fetches the existing food's catalogue relations in one query, and uses an `updatedAt` compare-and-set on its food row. The worker's redundant timestamp RPC has been removed because the database trigger already sets `updatedAt`. Server TypeScript and 197 unit/regression checks pass. The new nested serving query has not been checked against a running local PostgREST instance because Docker is unavailable here; do not treat the mocked route tests as database integration coverage.

On mobile, recovered drafts are dispatched with a two-meal concurrency limit, and repeated food searches can render a small account-scoped in-memory cache while stale entries refresh. TypeScript and 73 audit regression checks pass. A clean signed `npm run ios:prod` build completed and the resulting Amino Test app was installed and launched on Seb iPhone. This confirms build/install/start, not measured end-to-end latency. The mobile working tree still contains extensive pre-existing uncommitted work; preserve it.

The versioned mutation API, durable operation journal/outbox, processing revisions, short sync lock, incremental feed, and durable photo/audio acceptance below remain to be implemented. The contained serving route is not a substitute for the transactional protocol in Phases B–E.

## Assignment

Make Amino feel immediate when a user saves, edits, deletes, moves, searches for, or submits food, while preserving durable offline recovery and correct nutrition. Implement the phases below in dependency order across both repositories. Make routine design decisions autonomously, document deviations, and carry each phase through its acceptance tests. Do not remove synchronization safeguards until their replacements are implemented and tested.

Workspaces:

- Server: `/Users/seb/Documents/GitHub/amino-server`
- Mobile: `/Users/seb/Documents/GitHub/amino-mobile`

Start with measurement and the server mutation contract, then optimistic simple edits and shorter sync locks. Continue through queued text processing, draft recovery, search, and photo/audio submission. The phases are reviewable delivery units, not permission to leave the remaining scope unaddressed. Authentication optimization is conditional on the installed SDK, signing keys, and required session semantics.

This handoff does not itself authorize production schema changes or deployment. Prepare and validate the changes first; distinguish code changes, Git pushes, database migrations, server deployment, and installation of a new iPhone binary in the final report. Follow any additional authorization supplied in the implementation task.

## 1. Baseline and constraints

The server was clean at `f3bfc67` when inspected. It includes:

- `185b49b`: earlier food logging latency improvements.
- `d481198`, `2beaa85`, `f3bfc67`: subsequent explicit-addition/milk-variant resolution fixes and verification. Preserve these; do not start from the older latency commit.

Mobile HEAD was `4f3ac59`, but the working tree contains extensive tracked and untracked work, including the actual current latency, reliability, UI, and Expo changes. The working tree is the baseline. Do not reset it, blindly commit everything, or create a clean checkout that silently omits those changes. Record status before editing and keep the implementation diff identifiable.

The existing signed **Amino Test** binary was installed and launched on **Seb iPhone** during this task. That proves installation/launch, not measured end-to-end latency. No additional changes in this plan are in that binary.

Read the current `AGENTS.md` files, the Supabase skill, and the Postgres skill before implementation. Mobile is managed Expo: never manually edit generated `ios/` files. Its required native validation is clean regeneration followed by `npm run ios:prod`, with network/toolchain access and final command status checked. See `amino-mobile/docs/ios-build.md`. Documentation-only planning does not require rebuilding the app.

Existing evidence to read, while checking each claim against current code:

- `amino-server/food-logging-latency.md`
- `amino-mobile/docs/audit/editing-backend-handoff.md`
- `amino-mobile/docs/audit/editing-races.md`
- `amino-mobile/docs/audit/food-logging-flows.md`
- `amino-mobile/docs/audit/performance-usability-audit.md` — historical findings; many are already fixed.

Preserve the earlier fixes: durable text drafts, truthful connectivity labels, automatic foreground retries, no shared lock around new-food processing, targeted/coalesced refreshes, terminal-state preservation, pending-meal recovery polling, concurrent relation hydration, and nutrition progress publication before optional icon work.

## 2. Current bottlenecks and code map

| Interaction | Current behavior to change | Main code |
| --- | --- | --- |
| Portion/food Save | App readiness read, then HTTP request; server authentication/profile read, logged-food read, catalogue read, and update; shared app lock spans network work | Mobile `common/dbReadWrite/sendAndWriteToDb.ts`, `editReadiness.ts`; server `src/app/api/protected/user/update-logged-food-item-serving/route.ts` |
| Text edit | Readiness check, text update, processing request awaited inside the shared lock | Mobile `editAndReprocessMessage`; server `process-message-quick-log/route.ts`, `RespondToMessage.ts` |
| Date/delete/reorder | Client count/readiness reads and separate Message/LoggedFoodItem writes; photo deletion may be awaited after meal deletion | Mobile `remoteMutation.ts`, `sendAndWriteToDb.ts`, `screens/FoodLogScreen.tsx` |
| Copy meal | Insert message, fetch source foods, insert copies, write local rows, then redundant refreshes | Mobile `duplicateMessageAndLoggedFoodItems` |
| Live updates/week navigation | Full-week refresh on focus/foreground; lock covers fetch and cache application; food, message, and meal jobs can overlap semantically | Mobile `watermelon/syncLoggedFoodItem.ts`, `screens/FoodLogScreen.tsx` |
| Catalogue hydration | Re-download full FoodItem, Serving, and image relationships during food refreshes | Mobile `getFoodItemChanges` |
| Recovered drafts | `sendMessages` awaits one complete `sendDraft` before starting the next; processing fetch lacks an application deadline | Mobile `sendAndWriteToDb.ts`, `draftDelivery.ts` |
| Food search | Clear results on each query, 300 ms debounce, then authentication, embedding lookup/generation, similarity query, relation hydration | Mobile `useSearchForFoodByString.ts`; server `src/app/api/search-food/route.ts` |
| Photo submission | Upload starts in the modal, but Submit stays disabled until every upload finishes; attachment IDs are stored separately from the draft | Mobile `screens/AddFoodModal.tsx`, `uploadImageToSupabase.ts` |
| Recording start | Waits for transcription credentials before preparing/starting local recording | Mobile `common/audioRecording/recordAndTranscribe.ts` |
| Goal/profile Save | Context updates first, server errors are swallowed, then a food-day refresh is requested | Mobile `common/dbReadWrite/saveUserInfo.ts` |
| Worker food updates | A timestamp RPC remains before UPDATE, although the prior optimization removed it from INSERT | Server `src/foodMessageProcessing/common/updateLoggedFoodItemData.ts` |

The current serving endpoint authenticates a user but uses a service-role client to select/update a food by ID without an owner predicate and spreads `updateData`. This is a verified local-source finding already recorded in the backend handoff. Correct ownership, field validation, and processing-state enforcement are prerequisites for moving readiness checks out of the app. Do not probe other users' records in production.

Search access finding from this review: the checked-in `get_cosine_results` SQL ranks all `FoodItem` rows without an owner predicate, and `/api/search-food` hydrates those IDs with a service-role client. The user profile check does not filter result ownership. Correct catalogue visibility before caching/search rollout, including a test that one account cannot see another account's private food name or metadata. Keep global foods visible and preserve result quality after filtering.

## 3. Outcomes and measurement

Proposed targets, to validate and adjust from measurements rather than present as guarantees:

| Metric | Initial target / interpretation |
| --- | --- |
| Tap Save/Delete/Submit → visible local acknowledgement | p95 ≤200 ms for warm local operations, after validation and durable local persistence; no network dependency |
| Durably accepted simple server mutation | p95 ≤1 second under a documented healthy network; report cold starts separately |
| Server food commit → resolved row rendered | p95 ≤1 second with connected Realtime; missed-event recovery within one successful poll cycle plus request/render time |
| Cached/local food search | First useful results ≤100 ms; remote enrichment does not blank them |
| Save waiting for unrelated network work | Zero; local database writer contention must be short and measured |
| Recovery correctness | No lost drafts, duplicate accepted mutations, resurrected deletes, or stale overwrites in the failure matrix |

Photo file persistence and first-time microphone permissions need separate timing categories. Do not label a transient camera URI as durable just to meet a target.

Add operation/trace correlation through mobile submission, server acceptance, queue job, worker commit, sync receipt, local application, and first render. Extend `src/foodResolution/telemetry.ts` rather than adding unstructured logs. Its request/worker traces currently generate separate IDs; explicitly propagate correlation through durable jobs. Record stage durations, queue/lock wait, request counts/bytes, outcome, revision, and retry count. Do not log food text, photos, tokens, full user objects, or signed URLs.

Measure durations using a monotonic clock on each device/process. Phone/server wall clocks are not assumed synchronized; do not derive precise cross-host latency by subtracting their raw timestamps. Use a controlled test harness and report clock uncertainty where applicable. Separate perceived response, server acceptance, AI completion, and display delay.

## 4. Required invariants and shared contracts

### 4.1 Versioning

Use distinct concepts rather than overloading `updatedAt` or the processing status:

- **Mutation version:** compare-and-set version for user edits to a meal aggregate; any user change to its children participates. A standalone food has its own mutation version. A multi-entity action checks all relevant versions atomically.
- **Processing revision:** immutable generation of text/images being extracted and resolved. Text replacement or cancellation invalidates older work. Progress updates must not advance this revision.
- **Row version:** server-assigned monotonically increasing version for each Message/LoggedFoodItem snapshot, including worker updates and tombstones, used by the cache merge. Treat bigint values safely across JSON/TypeScript; opaque decimal strings are acceptable.
- **Sync cursor:** separate commit-safe feed position; do not assume row versions or timestamps are a global cursor.

Finalize names after inspecting the live schema. Add defaults/backfill and non-destructive Watermelon migrations (current inspected mobile schema version is 5). Update both generated Supabase type files and the mobile model/mapping definitions. Never reset the local database to introduce these fields: unsent drafts must survive upgrades.

Every writer must obey the contract: new/legacy endpoints, direct client writes still allowed during transition, extraction, matching, failure handlers, progress counters, and deletion. A worker's initial revision check is insufficient: its final writes must conditionally commit against the still-current revision and a non-deleted meal in the same database transaction.

### 4.2 Durable operation and HTTP contract

Introduce an authenticated mutation API, for example `POST /api/protected/user/food-operations`, plus `GET /api/protected/user/food-operations/{operationId}`. These are proposed routes, not existing endpoints. Use one typed discriminated request union and contract fixtures in both repositories.

Example portion request:

```json
{
  "operationId": "client-generated-uuid",
  "kind": "setFoodPortion",
  "target": { "foodId": 123, "mealId": 456 },
  "expectedVersion": "12",
  "payload": { "foodItemId": 789, "servingId": 42, "servingAmount": 2, "grams": 200 }
}
```

The server derives ownership from authentication, validates the target association itself, and validates a strict field allowlist. Whitelist operation kinds for create meal, portion/replacement, food/meal date move, delete, text/image revision, reorder, and copy. Support combined portion-and-date changes as one operation when the editor submits both; do not recreate the current partial-save gap.

Persist a unique `(userId, operationId)` record with canonical request hash, immutable accepted payload, state, and result/version references. The same key and same payload returns the original outcome; the same key with different payload is a conflict. Concurrent duplicates must not execute twice. Keep receipts long enough for the supported offline retry window; tombstone expired keys or require reconciliation so pruning cannot silently permit duplicate replay.

Use consistent JSON responses:

- `200`: committed synchronous mutation, canonical changed rows/tombstones and versions.
- `202`: work durably accepted, operation ID, accepted processing revision, status URL, and current canonical state. It does not mean food is resolved.
- `409`: stale version or operation-key conflict; include authorized current versions/state for recovery.
- `401/403`, `404`, `422`: explicit authentication, availability, or validation errors with stable codes.

Check replay receipts before rejecting an old expected version: a duplicate of an already committed operation must recover its original result. A transient 5xx or timeout is uncertain, not proof that no write happened. A status lookup returning no record while the original request may still be running permits retrying the **same** idempotent key, never minting a replacement key.

### 4.3 Durable acceptance and transactions

Keep database transactions short: no AI calls, Storage uploads, RevenueCat calls, or queue-provider HTTP requests while holding row locks. The authenticated server may compute derived data first, then conditionally commit against locked/verified source versions, or perform deterministic nutrition computation inside the transaction using the canonical database inputs.

Persist the operation, necessary row mutations, and a job/outbox entry in one database transaction. An outbox dispatcher delivers to the existing Quirrel queue and retries after crashes. Add leases, expiry/recovery, attempt bounds, and observable terminal failure. A request should return after durable acceptance without waiting for AI. An unawaited promise in a serverless route is not a durable job.

Prefer private implementation tables/functions with explicit privileges. Any exposed RPC wrapper must derive identity from a verified caller or be service-role-only; never trust a client-supplied user ID. Define RLS and grants for status reads and tables. Follow the Supabase skill's local migration workflow; generate migration files through the CLI after validating local changes, not by applying experimental changes to production.

## 5. Implementation phases

### Phase A — Baseline, instrumentation, and contained improvements

1. Record Git state, installed dependency versions, schema constraints/triggers, queue deployment configuration, and server/database regions. Verify deployment identity before calling any measurements “production.” Do not change regions speculatively.
2. Capture timings for portion Save, text edit, deletion, date move, foreground refresh, search, text/photo submission, and recording start using the same account/input/device before and after.
3. Fix the serving endpoint's ownership, deleted/processing checks, mutable-field allowlist, finite positive portions, serving/food consistency, and JSON error shape. Preserve these checks in the later shared operation handler.
4. Inspect database `updatedAt` triggers. If UPDATE already reliably sets server time, remove the remaining per-update timestamp RPC in `updateLoggedFoodItemWithData`; otherwise add/validate the trigger first. A test must confirm real timestamp advancement, not merely assert the absence of an RPC call.
5. Correct goal/profile saves: propagate server errors, preserve pending user input, return/apply the acknowledged User row, and remove the unrelated food-day refresh. This flow is not initially a reason to route every profile edit through the food operation system.

Exit: instrumented baseline; contained fixes verified; no new races or weakened authorization.

### Phase B — Versioned server mutations and worker fencing

1. Implement additive schema changes and the operation/status contract in section 4. Inspect all current direct client and worker writes before selecting compatibility rules.
2. Implement transactional portion/replacement, food/meal date moves, deletion, reorder, and copy. The “last food in a meal” decision belongs in the transaction, including races with other devices. Copy only whitelisted food fields, not old IDs, deletion metadata, or processing state.
3. Return canonical rows/relations sufficient for the visible update; avoid an obligatory post-save refetch. Bundle small referenced serving/catalogue data when a replacement introduces uncached data.
4. Make photo cleanup a durable task after deletion commits. A failed Storage deletion must not make the meal reappear or block the UI; cleanup verifies ownership and current references before deleting an object.
5. Fence all worker writes, progress updates, and failure handlers by processing revision/deleted state. Use a stable item key such as `(messageId, processingRevision, extractionIndex)` to deduplicate pending-food creation and queue redelivery. Progress is calculated only from that revision. Publish the expected item count before a worker can mark the meal complete.
6. Add compatibility adapters for existing endpoints. Legacy jobs currently carry a string food ID; drain or safely translate them from a persisted food revision. Do not permit revision-less jobs to update a later revision.

Compatibility gate: old installed clients directly update Supabase tables. New HTTP endpoints alone cannot enforce their version rules. Decide and test the transition explicitly: database constraints/triggers/privileges must make old writes safe, or new concurrent behavior stays disabled until those clients are retired. Do not declare mixed-version safety based solely on feature flags in the new app.

Exit: duplicate/lost responses recover correctly; another account cannot mutate a food; old workers cannot overwrite/delete/recreate a newer revision; multi-row actions are atomic.

### Phase C — Immediate app saves backed by a durable journal

1. Introduce a Watermelon operation journal and a separate pending overlay over acknowledged server rows. Store operation ID, account, target, expected version, immutable intent, local sequence, retry state, and affected fields. Persist the journal and visible optimistic state atomically before dismissing an editor.
2. Migrate `remoteMutation.ts`'s MMKV entries and existing attachment metadata safely. Some old entries represent partially acknowledged multi-step writes. Reconcile them against the server before converting; do not blindly translate/replay over newer changes. Retain raw recoverable entries until conversion succeeds.
3. Apply overlays in shared selectors used by rows, meal groups, calendar totals, and nutrition totals. Pending deletions need a visible recovery surface. Update `useEditorOperation.ts`, `EditMessageView.tsx`, portion/replacement editors, date controls, reorder, and copy actions to wait for local persistence instead of HTTP completion.
4. Serialize conflicting operations per meal/standalone food; allow unrelated meals to proceed with bounded concurrency. Once dispatched, freeze a payload/key. Multiple local edits may coalesce only before dispatch; subsequent operations use the acknowledged previous version. Do not blindly rebase a cross-device conflict.
5. Classify failures: offline/transient → queued with backoff; expired auth → wait for reauthentication; validation/conflict → visible failed state with current server data and an explicit recovery action. An old failure must never undo a newer pending edit; rebuild the view from acknowledged base plus remaining overlays instead of restoring a stale whole-row snapshot.
6. Clear an overlay only when its canonical result/version is acknowledged locally. If Realtime arrives before the HTTP response, receipt reconciliation must still identify the operation; avoid applying additive transforms twice. Late HTTP responses cannot lower cached row versions.
7. Preserve account-generation checks throughout. Logout stops delivery, hides that account's overlay, and retains its recoverable drafts. Re-login resumes only that account's journal.
8. Keep HealthKit exports driven by canonical accepted nutrition. Trace existing observers so an optimistic food does not export and then export again or leave a phantom sample after rejection.

Exit: saves remain responsive during a deliberately stalled network request; force-close/restart retains intent; conflicts and uncertain saves remain visible and recoverable.

### Phase D — Durable text/image revisions and fast acceptance

1. Move new-message extraction and text/image-edit extraction behind the durable acceptance/outbox path. Validate authentication, ownership, input limits, and subscription policy before acceptance; carry sufficient server-owned authorization context into the job without trusting a client snapshot.
2. Capture the exact content, selected time, timezone/reference time, and attachment IDs for the accepted revision. Workers must never read mutable “latest text” as the input to an older job.
3. Preserve current extraction correctness: explicit additions/milk variants, complete expected count before matching, parallel time inference, history behavior, and failure semantics. Existing shadow/history/nutrition tasks must not extend request acknowledgement; place diagnostic work on a durable best-effort path if it must survive response completion.
4. Keep the previous accepted meal available while a replacement revision processes. Expose processing foods as a separate revision, and atomically choose the displayed revision so old/new calories are never summed together. On failure, keep previous accepted nutrition and surface the failed edit. Define “submitted edit text” versus “nutrition currently displayed” clearly in UI/state.
5. Initially reject portion/date changes to a processing meal with a typed busy state, while allowing unrelated meals to save. Support a replacement text revision or delete as explicit supersession/cancellation only once all workers are fenced. Do not accidentally promise arbitrary edits during processing.
6. Change app processing completion logic to be revision-aware. “Never replace terminal status” applies within the same revision; an intentional later edit may legitimately move a resolved meal into processing. Reconcile by revision and row version, not a global terminal-status shortcut.
7. Remove the network-spanning food lock from the text-edit path only after the above protections and the Phase E merge rules pass.

Exit: the edit modal dismisses after durable local save, acceptance does not await extraction, later revisions win deterministically, and failed replacement does not erase the previously usable meal.

### Phase E — Short sync locks, less fetching, and incremental recovery

Implement this in two parts. Per-row versioning and overlay-aware merges from B/C are prerequisites for E1. Full incremental sync in E2 is not required to release the E1 lock improvement.

**E1: network reads outside the local cache lock.**

1. Split refresh into fetch and apply. Fetch outside the shared lock with deadlines and account scope; enter a short database writer for version comparison, canonical row updates, tombstones, and cursor metadata. Reject older snapshots. Never clear a pending overlay just because a refresh completed. Missing rows in a stale or partial response are not deletion evidence; require versioned tombstones or a complete authoritative snapshot with a consistent boundary.
2. Coalesce equivalent meal/food/message work, including overlap with an active request. Keep urgent targeted refresh capacity available while a historical range request is running; start with a small limit such as two concurrent reads, measure, and avoid unbounded `Promise.all`.
3. Fetch only mapped fields. Cache FoodItem/Serving/image bundles by catalogue identity and version, and hydrate missing/stale references. Propagate invalidation when servings or image relationships change; a FoodItem timestamp alone may not cover changes to child rows. TTL revalidation can be a bounded interim fallback, not permanent stale caching.
4. Make base food/progress render independent of decorative images. If new catalogue details are unavailable, use canonical logged nutrition plus an explicit placeholder; never invent nutrition from a stale catalogue cache.
5. Keep Realtime as a change hint unless event versions and field completeness are sufficient for safe direct application. Combine food and message events for the same meal into one hydration request where possible. A new icon may be linked after meal resolution, so ensure catalogue invalidation also reaches already-resolved meals.
6. Use cached days immediately. Deduplicate focus, foreground, socket reconnect, and network reconnect refresh triggers. Preserve the existing non-overlapping pending-meal polling fallback and stop it in background/offline or after completion; ordinary offline users should not be polled continuously.

**E2: commit-safe incremental feed.**

1. Add an authenticated change endpoint returning changed rows/tombstones, relation invalidations, pagination, and a cursor. Scope it to the account, including moves into/out of cached days and deletions. A target-window filter alone must not hide moved/deleted records.
2. Select a cursor design that cannot skip late commits. A naive `updatedAt > lastSeen`, or a sequence allocated before transaction commit, is insufficient. One workable design is a per-user revision row locked until commit plus a transactional change journal; all writers use a consistent lock order and append their changes under that revision. Audit deadlocks and retry whole safe transactions. Alternatively use a proven commit-ordered feed and document its guarantees.
3. Paginate complete revision boundaries, or carry a tie-breaker within a revision. Never advance beyond changes the client has not applied. Preserve a stable high-water mark for a multi-page pull and retain tombstones long enough for the supported offline window.
4. Store applied changes and cursor atomically. Bootstrap/resnapshot must capture a consistent boundary and replay intervening changes. Expired cursors trigger an explicit resnapshot while retaining local journals; they must not silently reset to “now.”
5. Verify that legacy writes and worker updates participate in the feed. If this is not yet true, retain periodic reconciliation and do not retire full refreshes prematurely.

Exit: a slow week refresh cannot block Save or a completed meal; stale reads and delayed events cannot regress state; pagination/restarts/date moves/deletes do not lose changes.

### Phase F — Draft delivery, request deadlines, and recovery

1. Replace serial `sendMessages` delivery with a per-account pool, initially two independent meals. Preserve one active sender per draft/operation and serialize edits to the same meal.
2. Use the durable create-meal API to replace lookup → insert → attach → processing round trips when possible. Enforce uniqueness for `(userId, localDraftId)` after inspecting/deduplicating existing data safely; the current lookup-before-insert alone is not a concurrency guarantee.
3. Centralize fetch behavior: AbortController deadline, account scope, typed JSON/error parsing, one controlled auth refresh, cancellation cleanup, retry classification, and trace propagation. Native fetch cancellation does not roll back server work.
4. Start with configurable deadlines by operation class, e.g. 10 seconds for reads/simple acceptance and a size-aware longer upload budget. Tune from measurements. Do not apply an aggressive deadline plus blind replay to the legacy extraction endpoint.
5. After an uncertain mutation, query its receipt and resend the same key if needed. Use exponential backoff with jitter, honor server retry guidance, and retry on foreground/reconnect. One failing draft must not prevent other meals from dispatching.
6. Keep acceptance and completion separate. Release a delivery slot after `202`; Realtime/status reconciliation follows the revision independently. Do not poll empty queues or refresh credentials for no work.

Exit: one hanging meal does not delay the next; lost replies create exactly one accepted meal; offline/restart/account-switch recovery is deterministic.

### Phase G — Search and conditional authentication optimization

1. Search local recently used/favorite/cached foods immediately. Keep remote debounce and generation/account cancellation protections. Render local/cached results while remote enrichment runs; distinguish current-query local matches from stale previous-query results.
2. Add a bounded query-result cache keyed by normalized query, relevant catalogue version, locale, and account where results are personalized. Preserve meaning-bearing quantities/brands/variants. Clear or partition caches across accounts.
3. Keep response and request budgets. Reduce relation payload to fields actually rendered and limit images in the database/query layer when supported. Combine similarity results and hydration in a single owner-safe database operation if profiling shows the extra round trip matters; preserve ranking and access rules.
   First enforce owner visibility in the similarity candidate query and hydrated response. Filtering only after ranking ten unrestricted candidates can leave legitimate users with empty results; filter before the limit in an appropriately restricted database function or equivalent safe query.
4. Reuse/coalesce identical remote searches and embeddings with an appropriate TTL/version. Cancellation on the phone does not necessarily stop server inference; use server budgets and input limits. Any lexical-first fallback must retain semantic-search quality tests rather than silently weaken matching.
5. Split identity verification from full Amino profile loading. Search usually does not consume the full profile after verifying existence. Inspect the actual installed Supabase version and project signing algorithm before proposing `getClaims`; the package declaration alone does not prove support. With asymmetric keys, verified claims can use cached JWKS; symmetric keys still need server verification. Preserve required revocation/deletion semantics and entitlement checks, and never substitute an unverified decode or server-side `getSession` for authentication.

Exit: repeated search shows useful results immediately; out-of-order responses do not replace the current query; authentication/access correctness and relevance are unchanged.

### Phase H — Durable photo submission and immediate recording start

1. Persist picked/captured photos to an app-owned durable directory as early as possible, with stable attachment IDs and a manifest linked transactionally to the draft. Never persist only temporary camera/cache URIs. If persistence fails or storage is full, keep the editor open with the recoverable input.
2. Permit Submit once the draft and local attachment references are durable. Display queued/uploading status in the food log. Dismissal must not trigger current modal cleanup that deletes files required by the outbox.
3. Give uploads stable user-scoped object paths and content identity. Retry reuses an object rather than generating a new timestamp/random filename every attempt. Validate already-existing objects, register metadata idempotently, and link only owned attachments. Protect against a removed attachment's late completion reappearing.
4. Bound compression/upload concurrency. Preserve image quality needed for labels/barcodes, avoid duplicate resize/base64 work, and test React Native/Supabase file formats against current docs before replacing the transport.
5. Start extraction only after all required attachments for the immutable revision are server-registered. A server “waiting for attachments” state needs expiry/recovery; it must not become permanent processing. Clean up orphaned objects through a durable, reference-checked process after cancellation or retention expiry.
6. Start local recording after microphone permission/audio-session readiness while fetching transcription credentials concurrently. Keep recordings durable if credential fetch/transcription fails. Do not block the initial microphone action on network availability or discard a clip on auth failure. Handle interruption, repeated taps, cancellation, unmount, and account changes explicitly.
7. Scope background claims accurately: foreground/reconnect retries are required. Do not promise uploads or JavaScript execution while iOS has suspended/terminated the app without implementing and verifying a native background facility.

Exit: submitted photos survive force-close/offline/retry without duplicate messages or missing attachments; recording can start with a deliberately stalled credential request.

## 6. Validation matrix

Prefer behavior tests with controllable deferred requests, a real local database for transactions/RLS, and a physical-device run. Source-string checks alone cannot establish concurrency or responsiveness.

| Scenario | Required result |
| --- | --- |
| Save while full-week refresh is stalled | Immediate durable local acknowledgement; later stale read cannot undo it |
| Realtime before HTTP acknowledgement; delayed duplicate event afterward | One acknowledged result, no double overlay application or status regression |
| Timeout after server commit, app killed before acknowledgement | Receipt recovers original operation; exactly one mutation |
| Concurrent same-key requests / same key with different payload | One execution / explicit conflict |
| Two devices edit the same meal version | One ordered outcome or explicit conflict; no silent overwrites |
| Portion and date submitted together | Both commit or neither commits |
| Delete/move one of several foods versus the final food | Correct item/meal scope decided atomically |
| Old worker finishes after edit/delete | Its user-visible writes and progress updates are rejected |
| Queue unavailable after acceptance; dispatcher crashes after enqueue | Outbox recovers; redelivery is idempotent |
| Invalid replacement text / partial extraction failure | Previous accepted meal remains available; failure is visible |
| Offline edits, restart, logout A/login B/login A | Journal survives, no cross-account display/upload, A recovers |
| Several drafts, first request hangs | Other independent drafts start within the configured concurrency limit |
| Photo upload succeeds but metadata/association reply is lost | Retry reuses object and receipt; no duplicate/orphaned linked rows |
| Attachment removed during upload; app killed after Submit | Removed photo stays removed; submitted files remain recoverable |
| Sync pagination plus concurrent commit, moves, and deletes | No skipped updates; cursor advances only with applied changes |
| Cursor expired or catalogue relation changes | Correct resnapshot/invalidation, pending local operations preserved |
| Repeated search and A → B → A typing | Relevant immediate results; late older response cannot win |
| Recording credential request hangs/fails | Local recording starts and clip remains available for transcription retry |
| Mutation rejected after optimistic nutrition display | Totals recover coherently; no phantom/duplicate HealthKit export |
| Old mobile/legacy job mixed with new server | Compatibility rules enforced, or feature remains gated |

Existing check entry points, re-read scripts before running:

```sh
# amino-server
node --test tests/*.test.cjs
npx tsc --noEmit --incremental false

# amino-mobile
npm run test:audit
npm run typecheck
```

Add focused transaction/idempotency/revision/cache-merge tests and run them against the proposed migration. Test RLS using separate local test identities and verify the service-role handler enforces ownership explicitly. Inspect representative query plans before adding indexes; candidates include account/date food reads, meal/revision food reads, operation-key uniqueness, draft-key uniqueness, and ready-outbox lookups. Do not create redundant indexes based only on column names.

For changed mobile runtime code, complete the repository-required clean Release workflow using `docs/ios-build.md`. Preserve generated native ownership in config/plugins. Personal device context from this task: team `J98TPTTZ35`, UDID `00008150-001659C00A80401C`, bundle `fit.amino.personal.j98tpttz35`; rediscover device availability/profile validity before use. The prior binary is at `.expo/personal-device-build/Build/Products/Release-iphoneos/AminoTest.app`. Reuse it only if its source bundle matches the code being installed. Do not rebuild merely to repeat installation of an unchanged validated binary.

If simulator/device tools time out inside the sandbox, retry with appropriate device-service permissions before diagnosing Xcode as broken. This task's `devicectl` timeouts were resolved by normal escalated device access. A successful native build, successful install, successful launch, and successful functional/timing test are separate outcomes.

Physical checks: simple/repeated food, multi-food meal, text replacement, portions, dates, copy, deletion with photos, camera/library inputs, airplane mode/reconnect, force-close/resume, slow network, and cold/warm server paths. Report sample count, p50/p95, errors, request counts, bytes, and any untested paths. Clean up only recorded test-owned fixtures.

## 7. Rollout, review units, and completion

Suggested review units:

1. Baseline instrumentation, endpoint validation, timestamp/profile fixes.
2. Versioned schema, operation receipts, transactional simple mutations, worker fencing, legacy compatibility tests.
3. Mobile schema/journal migration and optimistic simple actions.
4. Durable extraction acceptance/outbox and text/image revision handling.
5. Version-aware cache application, short locks, catalogue cache/coalescing; incremental feed in a separate review if substantial.
6. Bounded draft delivery and shared network handling.
7. Local/cached search and conditional authentication optimization.
8. Durable attachments and recording setup.

Dependency order: B precedes C and the worker parts of D; B/C precede E1; D precedes fast acceptance in F; E2 requires all writers to participate. G and contained A fixes can be implemented independently. H builds on the durable draft/operation model, not an unrelated second queue.

Roll out additive schema/server compatibility first, verify legacy clients and queue redelivery, then enable new mobile behavior for a small cohort. Keep independent capability flags for mutation protocol, short-lock sync, incremental feed, and photo outbox. Rollback stops new operations in the affected path while continuing to reconcile/drain existing accepted work; do not silently replay uncertain operations through legacy APIs. Do not remove schema columns or receipts as rollback.

Verify the actual deployed commit and database migration state before enabling the client capability. A Git push does not prove Vercel deployed it. A compiled app does not prove the new bundle was installed. Preserve compatibility until the supported client population and retained offline journals no longer require it.

Done means all mandatory phase exit criteria and the failure matrix pass, the current food-resolution regressions remain passing, before/after device measurements are attached, and any conditional auth optimization or externally blocked rollout is identified precisely. Report modified files/commits, migrations, deployment/build/install state, measured gains, and remaining limitations. Do not claim “instant server processing” from immediate local feedback.

## 8. Documentation references

These references support the implementation techniques, not measured Amino performance. Recheck current docs during implementation:

- [Supabase nested relationships](https://supabase.com/docs/guides/database/joins-and-nesting) — combine related reads with explicit selected columns.
- [Supabase Postgres Changes](https://supabase.com/docs/guides/realtime/postgres-changes) — subscription behavior and constraints; retain application-level reconciliation.
- [Supabase verified claims](https://supabase.com/docs/reference/javascript/auth-getclaims) — asymmetric-key cached verification versus symmetric-key network verification.
- [PostgreSQL transactions](https://www.postgresql.org/docs/current/tutorial-transactions.html) — transaction boundaries; keep external work outside locks.

Local skills used to prepare this plan: `amino-server/.agents/skills/supabase/SKILL.md` and `amino-server/.agents/skills/supabase-postgres-best-practices/SKILL.md`.
