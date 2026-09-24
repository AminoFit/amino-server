# Live Jev / Gemini text resolution

The user requested activation for all traffic because they are currently the only user. The supported text route now has an explicit live mode; no cohort sampling is needed for this deployment.

## Behaviour

Exact catalogue matches, history reuse, images and barcodes retain their current paths. Other text items try the validated Jev/Gemini resolver before the legacy matcher. A successful result is re-read from the catalogue and revalidated, then goes through the existing food save, icon and progress handling. It skips the legacy matching and serving model calls. `extendedOpenAiData.resolution` records the chosen strategy, route and model.

Agent failures, unsupported wording, missing evidence and failed catalogue revalidation return to the legacy pipeline. This preserves its broader serving and external-provider coverage, but also means a legacy estimate remains possible after agent abstention. The worker's shared numeric nutrition guard still applies. Existing user-supplied nutrition stays on the legacy path until the typed-constraint phase.

No agent and shadow run execute together. The resolver and final revalidation share 12 seconds; revalidation itself is capped at two seconds. Legacy fallback has its existing separate budget, so this is not a 12-second end-to-end request guarantee. The worker still owns persistence; no model has a write tool.

## Configuration and rollback

Production activation uses:

```bash
FOOD_BASELINE_TELEMETRY=true
FOOD_FAST_SELECTOR=on
FOOD_FAST_SELECTOR_PERCENT=100
FOOD_AGENT_FALLBACK=on
FOOD_AGENT_FALLBACK_PERCENT=100
FOOD_AGENT_TEXT=off
FOOD_KILL_SWITCH=false
```

Both modes must agree for the Gemini fallback to run. Model defaults remain `typesafe/jev-1.13` and `google/gemini-3.8-flash`, with the experimental 0.9 Jev confidence threshold.

Rollback: set `FOOD_KILL_SWITCH=true` and redeploy, or promote the previous known deployment for immediate rollback. Environment changes do not update already built deployments. Setting `FOOD_FAST_SELECTOR=off` and redeploying disables just this route. The prior shadow-only implementation is preserved in Git commit `fddba48`.

`agent_live` telemetry records accepted/fallback outcomes, provider usage, route and validation failures without meal text or user identifiers. A failed live attempt is not a food failure if the legacy path subsequently succeeds. Use saved item provenance to verify which route actually wrote the result.

## Verification

151 tests pass, including live admission/kill-switch behaviour, no duplicate shadow runs, catalogue revalidation, gram and household serving conversion, baseline recovery and the actual worker save/progress path. TypeScript passes. Production deployment and synthetic HTTP smoke results are recorded below once completed.

The earlier synthetic benchmarks are not proof of improved production accuracy. This activation is an explicit user decision for a single-user app; broader rollout still requires reviewed matching and latency data.

## Production verification — 23 September 2026

Live release `4d7c29b` was deployed as `dpl_FZkcV7ZGvp36YC3ZwNU7Nx6jjGu2` and promoted to https://www.amino.fit. Production flags enable the supported text route and Gemini fallback for 100% of traffic.

Synthetic API smoke requests returned HTTP 200 and completed RESOLVED 1/1. “100 g cooked garbanzo beans” saved catalogue food 1456, 100 g, 164 kcal; “100 g boiled long grain white rice” saved food 387, 100 g, 130 kcal. Both saved records contained `resolution.strategy=jev_gemini` and `route=gemini`. Test messages 30285/30286 and their food rows were soft-deleted afterward.

An earlier smoke used “steamed white rice,” which correctly took the exact-food shortcut to catalogue food 486 (151 kcal/100 g). Its hard-coded 130 kcal test expectation was invalid for that different food. That record was cleaned up; the follow-up tests used source-derived checks and verified agent provenance explicitly.

The separately reported image dressing omission is addressed in [the composition fix](FOOD_COMPOSITION.md); it came from a legacy/image path, not the new live text resolver.
