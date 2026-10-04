# Weight history plan

**Date:** 2026-10-03
**Status:** planned, nothing built.
**Scope:** amino-server (table, import, trend and expenditure functions, MCP) and amino-mobile (Apple Health read, sync, Progress tab).

Amino keeps a history of the user's body weight (and body-fat % when a scale provides it), read from Apple Health and from weights entered in the app or by an agent, stored per user in the cloud. The Progress tab shows the weight trend; later, the trend against logged intake gives an estimated daily expenditure (TDEE), also exposed over MCP.

---

## Decisions (owner, 2026-10-03)

1. **Read Apple Health only.** Weights entered in Amino are not written to Apple Health (no write permission). Can be revisited.
1a. **One Apple Health sheet** (owner, 2026-10-03, before launch). Weight and body fat (read) are asked with the food types in the same sheet, wherever Health is connected (setup's weight step, Settings); no separate weight switch. People who connected for food before see the sheet once more (`healthSheetPending`, Settings shows "Tap to add weight"); food export carries on meanwhile. The import runs once the user has seen the sheet.
2. **Two years of history** on first enable; then only new samples.
3. **Body fat is shown only when a source provides it** (a smart scale through Health). No manual body-fat entry.
4. **Both ends:** server (history, functions, MCP) and app (import, Progress tab).
5. **Expenditure is estimated from raw weights with a regression, not from moving-average endpoints** (see "Estimating expenditure"). A moving average is used only for the displayed trend line.

## What exists today

- **`User.weightKg`** is one number: the latest weight. The app's `saveAllUserInfo` rounds it to a whole kg; MCP's `update_body_stats` keeps 0.1 kg. No history anywhere.
- **Goal history** (`UserGoalHistory`, migration `20261006000000`) is the pattern to copy: one table per user, RLS read-own, written by a trigger on `User` so every write path is recorded, synced to the phone (Watermelon `goal_history`) by `updatedAt`, read by the Progress charts.
- **Apple Health** (`common/appleHealthKit/appleHealthKitSync.ts`, `@kingstinct/react-native-healthkit` 16): the app exports food and nutrients and reads back only food correlations. It requests food types only. The library has `queryQuantitySamplesWithAnchor`, `HKQuantityTypeIdentifierBodyMass` and `BodyFatPercentage`, so incremental reads need no new dependency.
- **Health permission text** (`app.json` `NSHealthShareUsageDescription`) mentions only food. Changing it needs a native build (fine for the personal-device build; other users need an App Store release).
- **Progress tab** (`screens/Progress`, `common/progress/progressMath.ts`): today, this week, last 30 days, day details. Charts in `components/BarChart`. Watermelon schema is v14.
- **MCP** (`src/mcp/tools.ts`): `get_profile` returns `body.weightKg`; `update_body_stats` writes `User.weightKg`.

## Data model

```sql
CREATE TABLE "WeightEntry" (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  "userId" uuid NOT NULL REFERENCES "User"(id) ON DELETE CASCADE,
  "measuredAt" timestamptz NOT NULL,          -- the instant; the day is derived in the user's time zone
  "weightKg" numeric(5,2) NOT NULL,
  "bodyFatPct" numeric(4,1),                  -- only when the source gives it
  source text NOT NULL,                       -- 'health' | 'profile' | 'agent'
  "sourceName" text,                          -- Health: the recording app or device ("Withings", "Health")
  "healthSampleId" uuid,                      -- Health sample UUID; re-syncs never duplicate
  "deletedAt" timestamptz,                    -- a sample deleted in Health is kept but hidden
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now(),
  UNIQUE ("userId", "healthSampleId")
);
-- Sync by updatedAt; charts by measuredAt.
CREATE INDEX ON "WeightEntry"("userId", "updatedAt");
CREATE INDEX ON "WeightEntry"("userId", "measuredAt") WHERE "deletedAt" IS NULL;
```

- **Weight and body fat are two Health samples** taken at nearly the same time. They merge into one entry when measured within 5 minutes of each other by the same source; otherwise the body-fat sample is its own entry with `weightKg` of the nearest weight that day (if none, it is dropped: body fat without a weight is of no use here).
- **`User.weightKg` stays "latest weight"** and keeps every existing reader working: after any insert, it becomes the newest entry's `weightKg` (by `measuredAt`) if that is newer than what is there. It stops being rounded to a whole kg in the app.
- **Every write path is recorded.** A trigger on `User` inserts a `profile` entry (or `agent`, when MCP sets a session flag, as the meal worker does with `app.meal_operation_write`) whenever `weightKg` changes, unless `app.weight_import` is set, which the Health import sets so it doesn't double its own update.
- **RLS:** users read their own rows. Writes go only through the functions below.

### Functions

- **`import_weight_entries(p_rows jsonb)`** (the signed-in user; at most 500 rows): upsert by `healthSampleId`, soft-delete rows named in `p_deleted`, then refresh `User.weightKg`. Returns how many changed. Sets `app.weight_import`.
- **`record_weight(p_measured_at, p_weight_kg, p_source)`**: one entry from the app's Profile editor or MCP, then the `User.weightKg` refresh.
- **`weight_trend(p_from date, p_to date)`**: per local day in the range: the day's weight (mean of the day's entries), body fat if any, and the **trend** (below), plus the change over 7 and 30 days. Used by the Progress tab (through sync) and MCP.
- **`energy_expenditure(p_days int)`**: the estimate described below, with its uncertainty and why it can't be given when it can't.

## The trend line (display)

An exponential moving average over daily weights, α = 0.1 (about a 19-day half-weight window; MacroFactor's trend behaves like this). Days without a weighing carry the trend forward. The EMA lags the raw weights by roughly 1/α − 1 ≈ 9 days during a steady change, which is fine for a line whose job is to hide water swings, and wrong for arithmetic, which is why it isn't used for expenditure.

## Estimating expenditure (TDEE)

**Energy balance:** over a window, intake − expenditure = change in stored energy ≈ Δweight × 7,700 kcal/kg. So

```
expenditure = mean daily intake over the window − slope(kg/day) × 7,700
```

**Raw values or moving averages?** Neither raw daily deltas nor moving-average endpoints:

- Raw day-to-day deltas are useless: water, glycogen and gut contents move weight by ±0.5–1 kg a day, which is ±4,000–8,000 kcal at 7,700 kcal/kg, far larger than any real daily imbalance.
- Subtracting EMA endpoints (EMA today − EMA 28 days ago) lags. The lag cancels only while the trend is a straight line; when the trend changes (a cut begins, a holiday), the trailing average still carries the old weights and the estimate turns weeks late. MacroFactor's "takes a while to adjust" is this.
- **Least-squares regression over the raw daily weights in the window** gives the slope of the period itself, centred on the period, with no lag beyond the inherent one (an estimate of expenditure over the last 28 days describes the last 28 days, not today; nothing shorter is possible from weight). It uses every weighing, tolerates missing days (fewer points), and its uncertainty is computable:

  With daily weighings of about 0.5 kg day-to-day scatter, the slope's standard error is σ / √Σ(t − t̄)²:
  - 14 days: 0.5 / 15.1 = 0.033 kg/day → **±255 kcal/day**
  - 28 days: 0.5 / 42.7 = 0.012 kg/day → **±90 kcal/day**
  - 56 days: ±32 kcal/day, but the trend is less likely to be straight that long

  So the window is **28 days** (14 at minimum, shown with its wider error), and the estimate is shown with its ± so it never reads as exact.

**Intake must be complete.** Under-logged days are the largest error: a day with half the food logged lowers "mean intake" and so the estimate. Only **complete days** count, and the window needs enough of them:
- a day counts when it has food logged and its kcal is at least 60% of the window's median (a heuristic for "the user logged the whole day"; to confirm with real data);
- the estimate needs ≥ 10 weighings and ≥ 18 complete days in the 28; otherwise it says what's missing ("Weigh in 4 more days this month") rather than a number.

**Energy density:** 7,700 kcal/kg is fat; real change is a mix of fat and lean, nearer 7,000. Start at 7,700 and revisit with data; body fat from a scale is too noisy to steer it.

**Outliers:** a weighing more than 2 kg from the previous day's is kept but down-weighted (a robust fit, Huber weights) so a clothed or post-meal weigh-in doesn't swing the slope.

**Where it runs:** one SQL function on the server, so the app (through sync) and MCP give the same number.

## Phase 1: server

1. Migration: the table, indexes, RLS, the `User` trigger, `import_weight_entries`, `record_weight`, `weight_trend`.
2. `update_body_stats` (MCP) records an `agent` entry through `record_weight`.
3. MCP `get_weight_history({ from, to })`: entries and the trend per day, body fat when present, change over 7/30 days. `get_profile` gains `body.weightTrendKg` and `body.weightMeasuredAt`.
4. Tests: SQL on a disposable database (merge of weight+fat samples, dedupe on re-import, soft delete, `User.weightKg` refresh, trigger skip during import); unit tests for the trend arithmetic.

## Phase 2: app, import and sync

1. **Permission:** weight and body fat are read types in the one Apple Health sheet (`requestAppleHealthAccess`, decision 1a). iOS never reports whether *read* access was granted: the Apple Health card says "No weight from Apple Health yet" when nothing comes back, never an error. `NSHealthShareUsageDescription` gains "and your weight".
2. **Import:** `queryQuantitySamplesWithAnchor` for each type; the anchor is kept in MMKV per account. First run: two years back, in pages of 500 through `import_weight_entries`. Then on foreground, like the catalogue refresh. HealthKit returns body fat as a fraction (0.21): × 100.
3. **Watermelon** `weight_entries` (schema v15 with a migration; extend `tests/watermelon-migration.cjs`), pulled by `updatedAt` like `goal_history`, indexed on `userId, measuredAt`.
4. **Profile › Weight** (`screens/components/ProfileSettings.tsx`) saves through `record_weight` so the entry carries the time; `saveAllUserInfo` stops rounding to a whole kg.
5. **Setup asks for weight from Health** (owner, 2026-10-03). The stats setup's weight step (`UserStatsInput`) offers "Use my weight from Apple Health": it requests weight read access there (the only prompt, at the moment it makes sense), fills the step with the latest Health weight, and turns weight sync on, so the two-year import starts straight away. Without Health, or without a weight in it, the step stays as it is.

## Phase 3: app, Progress tab

1. **Weight card** under Today: latest weight and when, the trend weight, change over 7 and 30 days (trend, not raw), a 30-day chart of daily points with the trend line through them; body fat as a second small line when present. Tapping opens **Weight history**: 30 / 90 / 365 days, the same chart, a list of entries with their source.
2. Nothing logged yet: "Turn on weight in Apple Health, or add your weight in Profile", linking to both.
3. Shared pieces: `Card`, `SectionHeader`, the Progress chart primitives; units through `common/format/body.ts` (lb when Imperial).

## Phase 4: expenditure

1. `energy_expenditure(p_days)` on the server, as above, returning `{ kcalPerDay, plusMinus, weighings, completeDays, window, insufficient?: reason }`.
2. Progress: "Estimated expenditure 2,650 ± 90 kcal" on the weight card once there's enough data, with the "needs N more weigh-ins / logged days" state before. Edit goals can offer it as the calorie basis (later; today's goals use the formula estimate from activity level).
3. MCP `get_expenditure_estimate`, with the same fields, and `get_daily_summary`'s goals note when goals are based on it.
4. Check against reality for the owner's data over a few weeks before anyone else sees it (a feature flag, as `recipes_in_agent` was).

## Order and costs

Phase 1, then 2 (a device build for the permission text), then 3, then 4 after a few weeks of data. No model calls anywhere; the only cost is one native build per phase.

## Left to confirm

- The "complete day" rule (60% of median) once a few weeks of the owner's data show what under-logged days look like.
- Whether `weight_trend` should also carry lean mass (Health has it from some scales). Not in v1.
- Writing Amino weights back to Apple Health (decision 1 says no for now).
