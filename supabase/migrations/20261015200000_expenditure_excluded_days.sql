-- Days left out of the expenditure estimate (2026-10-14). A sick day, a trip or a day the user knows they didn't log
-- can be switched off in Settings › Data › Expenditure days (a detail screen, never the everyday UI); energy_expenditure
-- then drops BOTH that day's food and its weigh-in, since dropping one side skews the slope. One row per left-out day;
-- the user's own app session reads and writes them, agents' tokens can't (as on every table the app writes).
SET lock_timeout = '3s';

CREATE TABLE IF NOT EXISTS public."ExpenditureExcludedDay" (
  "userId" uuid NOT NULL REFERENCES public."User"(id) ON DELETE CASCADE,
  day date NOT NULL,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY ("userId", day)
);
ALTER TABLE public."ExpenditureExcludedDay" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."ExpenditureExcludedDay" FROM PUBLIC, anon;
GRANT SELECT, INSERT, DELETE ON TABLE public."ExpenditureExcludedDay" TO authenticated;
DROP POLICY IF EXISTS "Read your own left-out days" ON public."ExpenditureExcludedDay";
CREATE POLICY "Read your own left-out days" ON public."ExpenditureExcludedDay" FOR SELECT TO authenticated
  USING ("userId" = (SELECT auth.uid()));
DROP POLICY IF EXISTS "Leave out your own days" ON public."ExpenditureExcludedDay";
CREATE POLICY "Leave out your own days" ON public."ExpenditureExcludedDay" FOR INSERT TO authenticated
  WITH CHECK ("userId" = (SELECT auth.uid()));
DROP POLICY IF EXISTS "Count your own days again" ON public."ExpenditureExcludedDay";
CREATE POLICY "Count your own days again" ON public."ExpenditureExcludedDay" FOR DELETE TO authenticated
  USING ("userId" = (SELECT auth.uid()));
DROP POLICY IF EXISTS "No inserts by agents" ON public."ExpenditureExcludedDay";
CREATE POLICY "No inserts by agents" ON public."ExpenditureExcludedDay" AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (NOT public.is_agent_token());
DROP POLICY IF EXISTS "No deletes by agents" ON public."ExpenditureExcludedDay";
CREATE POLICY "No deletes by agents" ON public."ExpenditureExcludedDay" AS RESTRICTIVE FOR DELETE TO authenticated
  USING (NOT public.is_agent_token());

CREATE OR REPLACE FUNCTION public.energy_expenditure(p_days integer DEFAULT 28)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
DECLARE
  me uuid := auth.uid();
  zone text := public.mcp_user_timezone();
  last_day date;
  first_day date;
  ts float8[];
  ws float8[];
  kcals float8[];
  intake float8;
  complete int;
  logged int;
  need_weighings int;
  need_complete int;
  wt float8[];
  t_mean float8; w_mean float8; sxx float8; sxy float8; slope float8; intercept float8;
  scale float8; k float8; resid float8; sse float8; sw float8; se float8;
  n int;
  left_out date[];
BEGIN
  IF me IS NULL THEN RAISE EXCEPTION 'Not signed in' USING ERRCODE = '28000'; END IF;
  IF p_days IS NULL OR p_days NOT BETWEEN 14 AND 56 THEN RAISE EXCEPTION 'Invalid window' USING ERRCODE = '22023'; END IF;
  last_day := (pg_catalog.now() AT TIME ZONE zone)::date - 1;
  first_day := last_day - (p_days - 1);
  need_weighings := ceil(10.0 * p_days / 28);
  need_complete := ceil(18.0 * p_days / 28);
  -- Days the user left out (Settings › Expenditure days): neither their food nor their weigh-in counts.
  left_out := ARRAY(SELECT e.day FROM public."ExpenditureExcludedDay" e
    WHERE e."userId" = me AND e.day BETWEEN first_day AND last_day);

  SELECT array_agg((t.day - first_day)::float8 ORDER BY t.day), array_agg(t."weightKg"::float8 ORDER BY t.day)
  INTO ts, ws FROM public.weight_trend(first_day, last_day) t WHERE t."weightKg" IS NOT NULL
    AND NOT t.day = ANY(left_out);
  n := coalesce(array_length(ws, 1), 0);

  SELECT array_agg((d.totals->>'kcal')::float8) INTO kcals
  FROM public.nutrition_day_totals(first_day, last_day, zone) d
  WHERE d.foods > 0 AND (d.totals->>'kcal')::float8 > 0 AND NOT d.day = ANY(left_out);
  logged := coalesce(array_length(kcals, 1), 0);
  -- Every day with food logged counts, however low: a careful logger's light day (illness, a fast) is real intake, and
  -- dropping it while keeping that day's weigh-in read as a steep loss on normal eating.
  SELECT avg(k0) INTO intake FROM pg_catalog.unnest(kcals) k0;
  complete := logged;

  IF n < need_weighings OR complete < need_complete THEN
    RETURN pg_catalog.jsonb_build_object('from', first_day, 'to', last_day, 'weighings', n, 'loggedDays', logged, 'completeDays', complete,
      'leftOutDays', coalesce(array_length(left_out, 1), 0),
      'insufficient', pg_catalog.jsonb_build_object(
        'weighInsNeeded', greatest(need_weighings - n, 0), 'completeDaysNeeded', greatest(need_complete - complete, 0)));
  END IF;

  -- Huber-weighted least squares, by iteratively reweighting: a clothed or misread weigh-in counts less.
  wt := array_fill(1::float8, ARRAY[n]);
  FOR iteration IN 1 .. 10 LOOP
    sw := 0; t_mean := 0; w_mean := 0;
    FOR i IN 1 .. n LOOP sw := sw + wt[i]; t_mean := t_mean + wt[i] * ts[i]; w_mean := w_mean + wt[i] * ws[i]; END LOOP;
    t_mean := t_mean / sw; w_mean := w_mean / sw;
    sxx := 0; sxy := 0;
    FOR i IN 1 .. n LOOP
      sxx := sxx + wt[i] * (ts[i] - t_mean) ^ 2; sxy := sxy + wt[i] * (ts[i] - t_mean) * (ws[i] - w_mean);
    END LOOP;
    slope := sxy / sxx; intercept := w_mean - slope * t_mean;
    SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY abs(ws[i] - (intercept + slope * ts[i]))) INTO scale
    FROM pg_catalog.generate_series(1, n) i;
    -- 1.4826 × MAD estimates the scatter; at least 0.1 kg so a few identical readings can't make every other an outlier.
    k := 1.345 * greatest(1.4826 * scale, 0.1);
    FOR i IN 1 .. n LOOP
      resid := abs(ws[i] - (intercept + slope * ts[i]));
      wt[i] := CASE WHEN resid <= k THEN 1 ELSE k / resid END;
    END LOOP;
  END LOOP;
  sse := 0; sw := 0;
  FOR i IN 1 .. n LOOP sse := sse + wt[i] * (ws[i] - (intercept + slope * ts[i])) ^ 2; sw := sw + wt[i]; END LOOP;
  se := sqrt(sse / greatest(sw - 2, 1) / sxx);

  RETURN pg_catalog.jsonb_build_object('from', first_day, 'to', last_day, 'weighings', n, 'loggedDays', logged, 'completeDays', complete,
      'leftOutDays', coalesce(array_length(left_out, 1), 0),
    'kcalPerDay', round((intake - slope * 7700) / 10) * 10,
    'plusMinus', greatest(round(se * 7700 / 10) * 10, 10),
    'meanIntakeKcal', round(intake),
    'trendKgPerWeek', round((slope * 7)::numeric, 2));
END;
$function$;
