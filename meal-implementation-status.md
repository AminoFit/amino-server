# Meal operation implementation status

Updated 2026-09-24. Server branch `codex/meal-agent-rebuild` started from deployed baseline `b09e3c5f927007983ebca94d97b30eb44e0ff1e2` in the isolated `/private/tmp/amino-smoothie-server` worktree. Mobile HEAD was `4f3ac59bdd23931e9b7e5ed4214abb6bacabced9`; its existing dirty changes were retained.

## Implemented locally

- Additive operation/revision/outbox schema, service-role-only RPCs, idempotent acceptance, leases, worker fencing, clarification answers/cancellation, atomic publication, stale source and serving checks, and triggers that stop legacy writers from mutating operation-owned meals.
- Authenticated operation/status/answer/cancel/snapshot routes, immediate Quirrel dispatch with durable outbox recovery, and a minute recovery cron. `MEAL_OPERATIONS_ENABLED` remains off by default.
- Meal-level agent with read-only owned history, complete meal group evidence, catalogue aliases/servings, typed schema output, generic plan validation, bounded error-code-only repair, and direct structured portion/move/delete actions. Uploaded photos now enter the same operation as stable owned image IDs; the worker verifies their meal association and storage path, sends short-lived signed URLs as multimodal image parts, and publishes only the stable IDs. No food-name or English keyword routing is used by the new operation path.
- Mobile account-scoped MMKV operation outbox, local-first create/edit/portion/move/delete entry points, clarification and retry UI, versioned Watermelon fields, and targeted revision-coherent refresh without a network-held global lock. `EXPO_PUBLIC_MEAL_OPERATIONS_ENABLED` remains off by default. Previous unrelated mobile modifications were preserved.
- Acceptance now awaits the short queue handoff before the serverless response; the durable outbox recovers a failed enqueue or a dispatched job never claimed by a worker. The app checks active operations at one-second intervals, retries a failed local refresh before calling an operation complete, and preserves structured action type on manual retry.

## Verification

- Baseline offline audit was rerun on the main checkout: it reproduced the English-only interception, serving inconsistencies, Chinese identity collision in the undeployed matcher, and global mobile-lock problem.
- Disposable local PostgreSQL integration tests passed for concurrent duplicate acceptance, owner isolation, photo ownership/association, photo evidence at publication, active-operation conflicts, late-worker rejection, failed edit preservation, clarification, cancellation and cancelled-create tombstones, atomic edit, historical copy, legacy writer fences (including moving a food away from a protected meal), stale catalogue evidence, and serving arithmetic.
- Compiler tests passed for a complete structured dish group, omission, micronutrient preservation, and nutrient-claim scope.
- Synthetic live `gpt-4o` resolver smoke check passed 12/12 cases across English, Spanish, Chinese, Arabic, French, Portuguese, German and Japanese. Cases cover smoothie/soup references, side-dish exclusion and explicit omission, including four legacy smoothie events with no structured group IDs. Durations in the final run were 2.7–4.7 seconds for resolver/model/tool time, not tap-to-render.
- Server and mobile TypeScript checks passed. Mobile `npm run typecheck` also passed theme checks, and `npm run test:audit` passed 75 isolated checks. A real multimodal model smoke check accepted a generated synthetic image and returned a clarification; it transmitted no account photo. All 12 synthetic multilingual history cases still passed after the photo prompt change. The clean photo-path `npm run ios:prod` build exited 0 with zero errors and four warnings, and installed on the iPhone 15 Pro simulator. No physical iPhone install was performed.
- The latest draft PR #86 Vercel preview check passed. Local server `next build` compiled and passed type/lint phases but page-data collection failed in the existing `/api/queues/process-food-item` route: first because the isolated worktree lacks legacy build-time environment variables, then with a bundled legacy dependency `TypeError` when placeholder variables were supplied. No production build/deployment was claimed.

## Open release gates

- After merging with the model cleanup (25 Sep), the meal resolver uses the central `google/gemini-3.8-flash` policy. Its `gpt-4o` default would have made every operation throw `Unsupported food model`. The 12/12 multilingual smoke result above was measured on `gpt-4o` and must be re-run on Flash before enabling `MEAL_OPERATIONS_ENABLED`. `CRON_SECRET` is not set in Vercel production, so the minute outbox-recovery cron returns 401 until it is added.

- The user explicitly authorized photo logging and signed-URL delivery to the configured model provider. The new photo path has mocked ownership/handoff tests and a synthetic live-model check, but no real uploaded-photo end-to-end test or physical iPhone timing yet.
- External source import/barcode evidence, voice integration, and complete old-client compatibility matrix are not done. New-protocol catalogue resolution currently requires an existing catalogue food.
- The 12-case synthetic smoke check is not the plan's 320-variant multilingual evaluation or 12-family held-out set. No real-account end-to-end test or physical iPhone latency measurement has been run.
- Verify Vercel plan supports the minute cron before deployment; Vercel Hobby allows only daily cron schedules. Run the full server build with authorized deployment environment, rehearse rollback, then enable flags only after accuracy/integrity gates. Do not deploy the separate undeployed model-cleanup branch as part of this change.
- The mobile working tree contains extensive earlier uncommitted work; isolate/review the new mobile edits before any push or release.
