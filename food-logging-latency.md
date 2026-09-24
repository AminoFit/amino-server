# Food logging latency investigation

Investigated the current amino-server and amino-mobile working trees on 2026-09-23/24. The reported 5-second server / 30-second app discrepancy has not been measured on a physical device in this task. The findings below are verified code paths, with isolated concurrency regressions; they are not production latency measurements.

## Where the waits came from

| Symptom | Cause in the inspected code | Change made |
| --- | --- | --- |
| Submit button remains busy | `AddFoodModal` awaited session access, message lookup/insert, attachment linking, and the processing HTTP response before closing. That response waits for AI extraction and meal-time inference. | Dismiss after the local draft and uploaded-photo IDs are persisted. Deliver in the background, retaining the existing food-log Retry and foreground/reconnect recovery. |
| Server has saved food but app stays processing | `processMessageById` held the same global lock needed by every authoritative refresh and edit throughout the processing request. | New-food processing no longer holds the cache/edit lock. Duplicate requests for the same message still share one promise. |
| Live changes sit behind older refreshes | FIFO sync queue, separate jobs for overlapping food-ID batches, and whole-day refreshes keyed by exact timestamps. | Prioritize targeted changes; merge pending IDs; normalize day keys; refresh the submitted meal rather than its entire day. |
| A missed update leaves food pending | Realtime is unsubscribed while the food-log screen is unfocused. Initial subscription and other one-off reads can miss a worker completion; there was no pending-meal reconciliation loop. | While the log is visible and active, refresh only pending meal IDs every two seconds after the previous request finishes. Stop on completion, navigation away, or backgrounding. This is recovery, not a two-second end-to-end guarantee. |
| Each food update needs extra network time | Catalogue/serving/image hydration finished before the linked message read even started. | Fetch those independent relations concurrently; apply them together under the existing cache/edit lock. |
| Resolved status briefly goes backwards | A late processing HTTP response could write PROCESSING over a newer terminal Realtime status. | Preserve an already RESOLVED or FAILED local status. |
| Meal remains PROCESSING after nutrition is saved | Worker awaited icon lookup/linking and Redis enqueue before updating meal progress. | Publish progress before optional icon work, while still awaiting that work within the worker invocation. |
| Extra server work before matching | A timestamp RPC preceded every pending-row insert, despite database timestamp defaults/triggers. Two independent embedding reads were serial. | Use existing database timestamps; overlap the embedding reads. |
| Portion Save performs serial readiness lookups | Fetch food's message ID, then fetch the message's status. | Fetch the owned food and associated message state in one nested query, preserving unavailable/deleted/processing checks. |

Relevant mobile code: `common/dbReadWrite/sendAndWriteToDb.ts`, `editReadiness.ts`, `refreshPendingMeals.ts`, `watermelon/syncLoggedFoodItem.ts`, `screens/AddFoodModal.tsx`, and `screens/FoodLogScreen.tsx`. Relevant server code: `src/foodMessageProcessing/addLogFoodItemToQueue.ts` and `processAndMatchLoggedFoodItem.ts`.

## Why server tests can look much faster

A worker-only benchmark excludes submission, extraction, meal-time inference, queue delivery, and the client refresh/render path. An exact catalogue match with explicit grams also bypasses work required by other inputs. The newer selector/history paths are gated by environment flags and per-user cohorts in `src/foodResolution/config.ts`; their default is off. Test configuration and deployed configuration must match before comparing timings.

The old `food-logging-pipeline.md` is a proposed design with estimated timing tables, not measured evidence that all paths are deployed. In the current code extraction is streamed internally but the complete item list is collected before dispatch, and meal-time inference is a separate awaited model call.

## Follow-up: saved drafts incorrectly appeared offline

The saved-draft row used the same "sends when online" text for every SENDING/RECEIVED message, without checking connectivity. Automatic delivery only ran on network or foreground changes, so an initial transient failure while continuously online required a manual retry. The follow-up mobile fix uses NetInfo for the label and adds a non-overlapping foreground delivery loop with retries capped at 30 seconds between failed attempts. Offline/background transitions and account changes stop delivery. Empty outbox checks do not refresh authentication. The mobile regression suite now passes 71 checks, including recovery without a new network event and truthful online/offline labels.

## Further work for consistently fast Edit and Save

Text edits still await extraction and retain serialization so overlapping edits cannot replace each other's inputs. Existing portion/date/delete actions still await server acknowledgement. These changes remove interference from a new food submission and one redundant readiness round trip; they do not make every edit optimistic.

To dismiss every editor immediately, add a durable operation journal with pending/failed UI and versioned, idempotent server mutations. For text edits, the server should durably accept a revision and enqueue extraction, and workers must check the revision before publishing. For portions and dates, a single owner-checked transactional endpoint can combine validation, update, and returned food data. Keep the current ordering safeguards until those replacements exist. The mobile repository's `docs/audit/editing-backend-handoff.md` records the existing endpoint ownership/field-validation prerequisites.

An active broad refresh can still delay a save or targeted refresh until its current read/cache transaction ends. Further reducing this requires chunking the refresh or adding version-aware cache application, rather than simply removing the lock that protects acknowledged edits from stale reads.

## Verification and rollout

Regression coverage includes a stalled processing request with concurrent food refresh/save, offline background delivery, duplicate sends, stale processing responses, coalesced refreshes and failed-ID retention, pending-meal polling cleanup, concurrent relation hydration, edit-readiness ownership/state checks, and completion before stalled icon work.

Validation passed: 69 mobile source regression checks, 177 server tests, TypeScript checks in both repositories, and a clean `npm run ios:prod` build (zero errors, four warnings), installed on the iPhone 15 Pro simulator. The build's JavaScript bundle was generated after the final app source edits.

No production deployment or schema migration is included. Ship both mobile and server changes for the complete improvement. Measure tap-to-dismiss, server food commit, message completion, cache application, and first resolved render separately for the same message ID. Compare warm/cold requests, repeat/new foods, multiple foods, photos, and reconnects. A physical-device timing run remains necessary before asserting a specific latency improvement.

Supabase behavior was checked against the official [Realtime Postgres Changes](https://supabase.com/docs/guides/realtime/postgres-changes) and [nested queries](https://supabase.com/docs/guides/database/joins-and-nesting) documentation.
