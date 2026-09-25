# Meal operation implementation status

Updated 2026-09-24. Server branch `codex/meal-agent-rebuild` started from deployed baseline `b09e3c5f927007983ebca94d97b30eb44e0ff1e2` in the isolated `/private/tmp/amino-smoothie-server` worktree. Mobile HEAD was `4f3ac59bdd23931e9b7e5ed4214abb6bacabced9`; its existing dirty changes were retained.

## Implemented locally

- Additive operation/revision/outbox schema, service-role-only RPCs, idempotent acceptance, leases, worker fencing, clarification answers/cancellation, atomic publication, stale source and serving checks, and triggers that stop legacy writers from mutating operation-owned meals.
- Authenticated operation/status/answer/cancel/snapshot routes, immediate Quirrel dispatch with durable outbox recovery, and a minute recovery cron. `MEAL_OPERATIONS_ENABLED` remains off by default.
- Meal-level agent with read-only owned history, complete meal group evidence, catalogue aliases/servings, typed schema output, generic plan validation, bounded error-code-only repair, and direct structured portion/move/delete actions. No food-name or English keyword routing is used by the new operation path.
- Mobile account-scoped MMKV operation outbox, local-first create/edit/portion/move/delete entry points, clarification and retry UI, versioned Watermelon fields, and targeted revision-coherent refresh without a network-held global lock. `EXPO_PUBLIC_MEAL_OPERATIONS_ENABLED` remains off by default. Previous unrelated mobile modifications were preserved.

## Verification

- Baseline offline audit was rerun on the main checkout: it reproduced the English-only interception, serving inconsistencies, Chinese identity collision in the undeployed matcher, and global mobile-lock problem.
- Disposable local PostgreSQL integration tests passed for concurrent duplicate acceptance, owner isolation, active-operation conflicts, late-worker rejection, failed edit preservation, clarification, cancellation, atomic edit, historical copy, legacy writer fences, stale catalogue evidence, and serving arithmetic.
- Compiler tests passed for a complete structured dish group, omission, micronutrient preservation, and nutrient-claim scope.
- Synthetic live `gpt-4o` resolver smoke check passed 8/8 final cases across English, Spanish, Chinese, Arabic, French, Portuguese, German and Japanese. Cases cover smoothie/soup references, side-dish exclusion and explicit omission. Durations in the final run were 2.8–3.3 seconds for resolver/model/tool time, not tap-to-render.
- Server and mobile TypeScript checks passed. Mobile `npm run typecheck` also passed theme checks. The final clean `npm run ios:prod` build exited 0, with zero errors and five warnings, and installed on the iPhone 15 Pro simulator. No physical iPhone install was performed.
- Server `next build` compiled and passed type/lint phases but page-data collection was blocked by missing legacy build-time environment variables in the isolated worktree (`OPENAI_API_KEY`, `PROMPT_CACHE_REDIS_URL`, `BULL_MQ_REDIS_URL`, `BULL_MQ_PLATFORM` on successive attempts). No production build/deployment was claimed.

## Open release gates

- Photo evidence is not on the new path. The new route rejects photo attachments. Automatic approval review rejected sending private uploaded photo signed URLs to the external model provider; user approval was requested. Existing photo logging remains on its legacy flow.
- External source import/barcode evidence, voice integration, and complete old-client compatibility matrix are not done. New-protocol catalogue resolution currently requires an existing catalogue food.
- The 8-case synthetic smoke check is not the plan's 320-variant multilingual evaluation or 12-family held-out set. No real-account end-to-end test or physical iPhone latency measurement has been run.
- Verify Vercel plan supports the minute cron before deployment; Vercel Hobby allows only daily cron schedules. Run the full server build with authorized deployment environment, rehearse rollback, then enable flags only after accuracy/integrity gates. Do not deploy the separate undeployed model-cleanup branch as part of this change.
- The mobile working tree contains extensive earlier uncommitted work; isolate/review the new mobile edits before any push or release.
