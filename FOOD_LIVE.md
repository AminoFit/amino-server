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
