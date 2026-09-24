# Phase 2: history search and controlled reuse

## Behaviour

`createUserFoodHistorySearch(authenticatedUser)` binds the user ID and timezone on the server and returns the read-only `searchUserFoodHistory` function. Its arguments contain the search text, the current message creation time and message ID to exclude, plus an optional explicit brand. A model cannot supply an alternative user ID.

The lookup reads completed messages and their logged food records from the existing database. It returns original message text, event times, food IDs, recorded quantities/calories and grouping by message. Food labels/brands come from the current catalogue; the numerical values come from the historical log. It does not create preferences, recipes, embeddings, catalogue foods or logged items.

- **Yesterday:** uses the user's timezone and calendar boundaries, including daylight-saving days. Reference time is the current message creation time, so retries do not move the reference day.
- **Usual meals:** groups identical sets of food IDs and gram amounts. A repeated-pattern result requires at least three distinct local days and at least 75% of relevant events. It remains an inference, not a confirmed preference.
- **Ordinary foods:** matches normalized food/message words and ranks by recency and repeated days. Optional explicit brand restricts results. The request hook searches the original text; it does not invent a brand preference.
- **Ambiguity:** multiple plausible events remain ambiguous. A bounded/incomplete scan cannot assert a unique reference. “Same again” remains ambiguous when more than one plausible event exists.
- **Recipes/substitutions:** phrases such as “without banana”, “double” or “my recipe” are returned as unsupported evidence requests. Recorded aggregate foods never become invented ingredient lists.

Breakfast/lunch/dinner retrieval can use local meal-time ranges when the original message has no meal label. Explicit conflicting meal labels are excluded. This heuristic needs review before live use.

Deleted or failed messages/items, other users' records, incomplete meals, future-created records and the current message are excluded. Complete events require valid positive gram weights and recorded calories; volume-only/unknown-weight entries are conservatively excluded in this first version.

## Limits and integration

The lookup searches the last 30 days, or the previous local calendar day for “yesterday”. It scans at most 100 recent messages, fetches one extra to detect truncation, and returns at most five candidates. It does not search all historical records or use semantic embeddings. High-volume histories can therefore miss an older relevant meal; truncation is explicitly reported.

After a successful message claim, the request starts shadow retrieval alongside normal extraction/time inference. It joins the read before ending, with a 750 ms wall-clock deadline and an abort signal. The usual case overlaps existing work; the worst case can add the remaining portion of that budget to an otherwise faster response. Lookup failure, invalid timezone and timeout do not alter normal food processing.

The shadow result never enters the extraction/matching prompt, changes quantities or modifies the response. Edits skip shadow search because the existing message lacks an edit timestamp/revision suitable for interpreting relative dates. In particular, an ambiguous history result does **not** yet change the legacy matcher's behaviour. Preventing generic guesses for unresolved references belongs to the live integration gate, not this shadow release.

## Enable for evaluation

Set these server environment variables in the test deployment:

```text
FOOD_BASELINE_TELEMETRY=true
FOOD_HISTORY_SEARCH=shadow
FOOD_HISTORY_SEARCH_PERCENT=100
```

Use a lower percentage for stable user cohorts. Default remains off; `FOOD_HISTORY_SEARCH=on` also stays off because the search switch only controls observation. Exact live reuse uses the separate switch documented below. `FOOD_KILL_SWITCH=true` disables history reads. No production environment setting was changed during implementation.

The initial shadow snapshot was `history-shadow-v1`; the addition of controlled reuse versions it as `history-reuse-v1`. Events include lookup duration, disposition, candidate count, source message IDs, candidate food IDs and truncation. They exclude meal text, user identity and nutrient contents. Normal worker events include matched food ID/grams, so reviewers can join by message ID to compare history evidence against the baseline result. Candidate membership alone is not matching accuracy, and ordinary output logs retain their separate legacy privacy behaviour.

## Verification

```sh
node --test tests/*.test.cjs
./node_modules/.bin/tsc --noEmit
npm run build
```

Tests cover ownership and incomplete meals, deletion, current-message exclusion, date boundaries and DST, repeated patterns, explicit brands, ambiguity, unsupported modifications, truncation, query scoping, disabled mode, error isolation and cancellation. Database access uses the documented Supabase select/filter/abort interface; no schema changes are required.

Local HTTP smoke on 23 September 2026 used the actual modified API and local queue with hosted Supabase and real model services:

- Seeded a synthetic historical apple meal (message 30272) in the existing test account.
- Sent two concurrent `100 g apple` requests for message 30273.
- Shadow lookup found that historical meal and food ID 6 in approximately **130 ms**, returning `ranked_foods`.
- The unchanged matcher saved exactly one item: **100 g, 54.945 kcal**, and resolved 1/1 items.
- Both HTTP requests and a completed-result retry returned 200; no duplicate food was created.
- Soft-deleted both synthetic messages and their food records; shut down the local API/queue. No real-user history was edited.

## Before enabling live use

Review shadow results across real repeated meals, multiple possible references, brands and uncommon phrasing. Measure retrieval recall, unsupported assumptions and added latency. The initial smoke proves retrieval/isolation plumbing, not broad accuracy.

The initial exact-reference integration below provides a separate switch. Broader references and changed quantities still need reviewed resolution policies. Clarification UI and recipes remain later work.

### Explicit reference and ambiguity test — 23 September 2026

A second local HTTP test used `same apple as yesterday`, with one synthetic 100 g historical apple (message 30274). Shadow retrieval selected that exact event as `single_event` in approximately 90 ms. Two concurrent requests for message 30275 returned HTTP 200; only one food was logged. A retry returned the existing result in 249 ms without duplicates.

The legacy matcher logged its default 182 g apple (100 kcal), not the historical 100 g quantity. This is expected in shadow mode and demonstrates that retrieval is working but is not yet influencing logging. Correct reuse of the historical quantity still requires live integration; this test must not be presented as complete end-to-end reference resolution.

Added a second synthetic yesterday event (30276): the same read-only history tool returned `ambiguous`, with both source events. Soft-deleting that second message excluded it and restored the unique original event. All three synthetic messages and their logged items were soft-deleted at cleanup, and the local API/queue were stopped.

## Controlled live reuse — 23 September 2026

The limitation demonstrated above is now fixed for clear, new text references of the form `same <food or meal> as yesterday` (also `from yesterday`). Enable only for a reviewed cohort:

```text
FOOD_HISTORY_REUSE=on
FOOD_HISTORY_REUSE_PERCENT=100
```

Default remains off. It is independent of `FOOD_HISTORY_SEARCH=shadow`; a live reuse request performs one lookup and does not additionally run shadow lookup. The global kill switch disables both. No production configuration was changed.

A unique, complete historical event supplies the recorded grams and all available nutritional fields. Unknown nutrients remain null. The server selects only the named food from a multi-food event; an explicit breakfast/lunch/dinner reference can reuse the complete event. A smoothie whose ingredient grouping cannot be established is not reconstructed. Original source message/item IDs are stored as provenance. New rows use the caller-selected consumed time, never yesterday merely because the reference mentions yesterday. Display servings normalize to grams to avoid reinterpretation of changed catalogue serving definitions.

After the existing atomic request claim, the server inserts all copied foods in one bulk operation and finalizes the message. There is no generic matching, serving model, queue job or global food creation for this path. The HTTP error handler can reconcile saved item counts if the final progress update fails; it does not retry the insert.

Ambiguous, missing, truncated, invalid or unavailable history returns the existing `FAILED` response with zero saved foods and an instruction to enter food/amount directly. Quantity overrides, compound requests, substitutions, inferred usual meals, images and other reference forms are deliberately unsupported by this first live release. They do not fall through to generic guessing when this switch is active. Reference edits are rejected before deleting old items; ordinary explicit-food edits retain their existing behaviour.

### Live verification

Ran the local API against hosted Supabase with this switch enabled only in the local server process:

- Yesterday's source: synthetic message 30279, apple 100 g / 54.945 kcal.
- New reference: message 30280, `same apple as yesterday`.
- Saved result: exactly 100 g / 54.945 kcal, with the new selected date/time and source provenance.
- Two simultaneous HTTP requests returned 200; one food item was saved. Completed retry returned 200 in 109 ms without duplicates.
- History lookup and saving took approximately 238 ms; full local HTTP request took 892 ms. No model usage events occurred for the request.
- Adding a second plausible historical apple and sending another reference returned `FAILED` with no logged foods, rather than choosing an arbitrary portion.
- All synthetic messages and foods were soft-deleted; local servers were stopped.

The implementation still inherits the existing message-claim crash window: a process killed between claiming and completing a write can leave a processing message requiring reconciliation. Concurrent source edits/deletion are not locked across retrieval and insertion. This is a controlled initial rollout, not a new exactly-once transaction system or proof of broad reference accuracy.
