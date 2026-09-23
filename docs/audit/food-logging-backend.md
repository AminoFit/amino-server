# Food logging backend investigation — September 23, 2026

Evidence supplied by mobile: `/Users/seb/Documents/GitHub/amino-mobile/docs/audit/food-logging-flows.md`.

## Confirmed live state (read-only)

- Test message 30263: two Processed foods (52184, 52185), 105.02 and 143 kcal, message RESOLVED. Mobile observed HTTP 500 with non-JSON body.
- Test message 30264: food 52189 is Matching Failed, 0 grams, no food ID or calories, yet message RESOLVED with 0/1 processed.
- Food 387 is the unique exact-name `cooked white rice`, unbranded, 205.4 kcal per 158 grams. At 100 grams this is 130 kcal.
- All reported test records remain soft-deleted. No production food records or SMTP settings were changed.
- Original backend exception logs were unavailable. The exact historical 500 and matching exception are not proven from the rows alone.

## Local fixes

- Text/image extraction completes before persistence. The final expected count is written before dispatching any food jobs, preventing an early worker from resolving an incomplete meal.
- Message progress is derived from active saved food outcomes. Pending foods remain PROCESSING; failed/partial requests become FAILED; only all-success becomes RESOLVED. Concurrent progress writes use compare-and-swap with retry.
- UpdateMessage honors explicit zero counter resets, preserves explicit statuses, checks database errors, returns the updated row and protects concurrent counter increments.
- Quick-log returns status and processed/expected counts. Every handled HTTP error is JSON. Optional meal-time inference has an immediate rejection handler and falls back to the selected timestamp.
- Exact unambiguous local food names and brands bypass embedding/AI selection. Explicit gram/kilogram quantities bypass AI serving interpretation. Unresolved or nonfinite serving weights fail validation.
- Icon generation failures cannot change a committed Processed food into Matching Failed. Queue redelivery repairs message progress without reprocessing terminal/deleted foods.
- Ownership/deletion checks happen before message writes. Fixed the endpoint's inverted subscription expiry comparison.
- Disabled the pre-existing import-time food diagnostic in logFoodItemStreamChat.ts: importing a production route must not automatically issue synthetic logging calls for a real user's email.

## Model evaluation and configuration

Google documents `gemini-3.8-flash` as stable: https://ai.google.dev/gemini-api/docs/models/gemini-3.8-flash . Model metadata with Amino's configured key returns HTTP 200, but an actual generation request returns HTTP 403: `Your project has been denied access. Please contact support.` This does not establish which provider failed the historical rice request.

Food matching, serving interpretation and meal-time inference now share the foodCompletion adapter. The working default is `gpt-4o-mini` until Google project access is restored. Set `FOOD_REASONING_MODEL=gemini-3.8-flash` to select Gemini; provider denial/not-found/rate-limit/server responses fall back once to GPT-4o mini. Existing VERTEX_SERVING_MATCH_MODEL still overrides the serving stage. Gemini 3 uses `thinkingLevel: low`; the old installed SDK does not serialize this field, so the adapter uses the documented REST API. Generation has a 45-second timeout, requires complete JSON, and usage-logging failures do not invalidate the result.

Text extraction remains GPT-4o mini and existing image/external-database pipelines are not broadly migrated. Gemini quality improvement has NOT been demonstrated because generation is denied. Restore Google project access and evaluate representative text/image inputs before changing the production default.

## Validation

- `node --test tests/*.test.cjs`: 37 passing (22 food logging, 15 password recovery).
- `npm run lint`: passes with four pre-existing warnings outside changed code.
- `npx tsc --noEmit --pretty false`: only existing missing next-auth / next-auth/jwt imports in src/app/api/test.ts.
- Live synthetic prompts through the actual new food adapter and matching/serving/time functions, with database usage writes stubbed: medium banana 118g; cooked vs dry rice chooses 387; banana/eggs text does not invent a meal time. All passed on OpenAI.
- Source tests cover rice 100g → 130 kcal, exact matching, ambiguous quantities, concurrent counters, pending/partial/failure status, foreign ownership, extraction failure, provider errors, JSON responses, icon failure after save and Gemini fallback/configuration.
- Live Supabase queries were read-only. No migration, deployment or real meal insertion was performed.

## Deployment follow-up

Deploy the reviewed server changes, then run synthetic mobile text/image logging and verify both immediate JSON responses and final queue outcomes. This local patch does not itself change the currently deployed API. Google project access is a separate blocker for enabling Gemini as the default.


## OpenRouter follow-up

The user supplied an OpenRouter key, saved only in ignored `.env.prod` under `OPEN_ROUTER_API_KEY`. The adapter supports both this spelling and `OPENROUTER_API_KEY`. Authenticated model discovery confirmed `google/gemini-3.8-flash` and structured-output/reasoning support.

Three live synthetic evaluations through the actual matching/serving/time functions passed on OpenRouter Gemini 3.8 (the evaluation explicitly rejected any fallback request): medium banana 118g; cooked rice selected over dry rice (387); no invented time for banana/eggs. No database records were written.

Local `.env.prod` now sets `FOOD_REASONING_MODEL=google/gemini-3.8-flash`; the old serving override was removed so all three stages use this selection. The adapter sends JSON output mode and low reasoning effort, records usage under openrouter, and retains a direct OpenAI fallback for provider access, credit, rate-limit and server failures. Source defaults still use GPT-4o mini in environments without the explicit model setting.

Validation: 39 tests pass; TypeScript retains only the two existing next-auth missing-import errors. Deployment requires setting the OpenRouter key and FOOD_REASONING_MODEL in the hosting environment and deploying the reviewed code. Neither credentials nor changes have been deployed.

## Production deployment — September 23, 2026

Deployed and promoted `dpl_74BJcjzoPM5pfpXd3mjKF9xoZXdf` in `hedge/amino`:
- Production: https://www.amino.fit
- Immutable deployment: https://amino-4hq0et1sx-hedge.vercel.app
- Inspector: https://vercel.com/hedge/amino/74BJcjzoPM5pfpXd3mjKF9xoZXdf

Production now has the supplied OpenRouter key stored as a sensitive environment variable and FOOD_REASONING_MODEL set to google/gemini-3.8-flash. No SMTP configuration was changed.

Deployment fixes: excluded the unreferenced, non-route NextAuth diagnostic src/app/api/test.ts from TypeScript compilation; marked embedding-test/backfill GET routes force-dynamic so they do not run during static generation. TypeScript now passes. Vercel production build succeeded. The release snapshot excluded unrelated local dev-script/reprocessing edits and all environment files.

Post-promotion verification:
- Test-account password login succeeded.
- Message 30265: `100 g cooked white rice`, HTTP 200 JSON, queued PROCESSING then RESOLVED 1/1; food 52190, database food 387, exactly 100g and 130 kcal.
- Message 30266: `1 medium banana and 2 large eggs`, HTTP 200 JSON, queued PROCESSING then RESOLVED 2/2; foods 52191/52192, 118g/105.02 kcal banana and 100g/143 kcal eggs.
- Both messages and all three test foods soft-deleted after verification.
- Invalid JSON request returns HTTP 400 JSON.
- Password-reset and password-change pages return HTTP 200; email delivery remains a separate unresolved SMTP/DNS issue.

Validation: 39 local tests pass. Production build includes successful type-checking, with existing lint/BullMQ warnings. Deployment was made directly from a reviewed file snapshot; local edits have not been committed or pushed to GitHub.
