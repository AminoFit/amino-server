-- Expenditure over time (2026-10-22): the Progress tab's Expenditure page charts the estimate for past days, each from
-- its own 28-day window. energy_expenditure_at is the estimate as of a day (the maths of energy_expenditure, unchanged);
-- energy_expenditure is it as of yesterday, so the tile and the chart's newest point are the same number; and
-- energy_expenditure_history runs it back from a day in steps. Each reads only the caller's own data (auth.uid()).
SET lock_timeout = '3s';

-- The fit behind every estimate: a Huber-weighted line through the window's weigh-ins (day number, kg), so a clothed
-- or misread weigh-in counts less; expenditure is intake minus the slope × 7,700 kcal/kg, and the ± is one standard
-- error of the slope (about a 2-in-3 chance). Pure arithmetic on what it's given.
CREATE OR REPLACE FUNCTION public.expenditure_fit(ts float8[], ws float8[], intake float8)
 RETURNS jsonb
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO ''
AS $function$
DECLARE
  n int := coalesce(array_length(ws, 1), 0);
  wt float8[];
  t_mean float8; w_mean float8; sxx float8; sxy float8; slope float8; intercept float8;
  scale float8; k float8; resid float8; sse float8; sw float8; se float8;
BEGIN
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

  RETURN pg_catalog.jsonb_build_object(
    'kcalPerDay', round((intake - slope * 7700) / 10) * 10,
    'plusMinus', greatest(round(se * 7700 / 10) * 10, 10),
    'meanIntakeKcal', round(intake),
    'trendKgPerWeek', round((slope * 7)::numeric, 2));
END;
$function$;

REVOKE ALL ON FUNCTION public.expenditure_fit(float8[], float8[], float8) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.expenditure_fit(float8[], float8[], float8) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.energy_expenditure_at(p_last_day date, p_days integer DEFAULT 28)
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
  n int;
  left_out date[];
BEGIN
  IF me IS NULL THEN RAISE EXCEPTION 'Not signed in' USING ERRCODE = '28000'; END IF;
  IF p_days IS NULL OR p_days NOT BETWEEN 14 AND 56 THEN RAISE EXCEPTION 'Invalid window' USING ERRCODE = '22023'; END IF;
  -- The window ends on the given day, never later than yesterday (today's food isn't finished).
  IF p_last_day IS NULL THEN RAISE EXCEPTION 'Invalid day' USING ERRCODE = '22023'; END IF;
  last_day := least(p_last_day, (pg_catalog.now() AT TIME ZONE zone)::date - 1);
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

  RETURN pg_catalog.jsonb_build_object('from', first_day, 'to', last_day, 'weighings', n, 'loggedDays', logged,
    'completeDays', complete, 'leftOutDays', coalesce(array_length(left_out, 1), 0))
    || public.expenditure_fit(ts, ws, intake);
END;
$function$;

REVOKE ALL ON FUNCTION public.energy_expenditure_at(date, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.energy_expenditure_at(date, integer) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.energy_expenditure(p_days integer DEFAULT 28)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
  SELECT public.energy_expenditure_at(
    (pg_catalog.now() AT TIME ZONE public.mcp_user_timezone())::date - 1, p_days);
$function$;

-- The estimate every p_step days back from p_to, oldest first, from p_from on. The weigh-ins, food and left-out days are
-- read once for the whole range and each window is fitted with expenditure_fit, as energy_expenditure_at fits one; the
-- newest point is energy_expenditure_at itself, so it is exactly the tile's number. Windows without enough weigh-ins or
-- logged days are left out, so the chart shows a gap rather than a guess.
CREATE OR REPLACE FUNCTION public.energy_expenditure_history(p_from date, p_to date, p_step integer DEFAULT 1,
  p_days integer DEFAULT 28)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
DECLARE
  me uuid := auth.uid();
  zone text := public.mcp_user_timezone();
  last_day date;
  start_day date;
  span int;
  kg float8[];
  kcal float8[];
  left_out boolean[];
  need_weighings int;
  need_complete int;
  e int;
  ts float8[]; ws float8[]; total float8; logged int;
  estimate jsonb;
  points jsonb[] := ARRAY[]::jsonb[];
  r record;
BEGIN
  IF me IS NULL THEN RAISE EXCEPTION 'Not signed in' USING ERRCODE = '28000'; END IF;
  IF p_from IS NULL OR p_to IS NULL OR p_step IS NULL OR p_step NOT BETWEEN 1 AND 31
    OR p_days IS NULL OR p_days NOT BETWEEN 14 AND 56 THEN
    RAISE EXCEPTION 'Invalid range' USING ERRCODE = '22023'; END IF;
  last_day := least(p_to, (pg_catalog.now() AT TIME ZONE zone)::date - 1);
  IF last_day < p_from OR last_day - p_from > 700 OR (last_day - p_from) / p_step > 200 THEN
    RAISE EXCEPTION 'Invalid range' USING ERRCODE = '22023'; END IF;
  need_weighings := ceil(10.0 * p_days / 28);
  need_complete := ceil(18.0 * p_days / 28);

  -- Day i of the arrays is start_day + i - 1.
  start_day := p_from - (p_days - 1);
  span := last_day - start_day + 1;
  kg := array_fill(NULL::float8, ARRAY[span]);
  kcal := array_fill(NULL::float8, ARRAY[span]);
  left_out := array_fill(false, ARRAY[span]);
  FOR r IN SELECT x.day FROM public."ExpenditureExcludedDay" x
    WHERE x."userId" = me AND x.day BETWEEN start_day AND last_day LOOP
    left_out[r.day - start_day + 1] := true;
  END LOOP;
  FOR r IN SELECT t.day, t."weightKg"::float8 AS w FROM public.weight_trend(start_day, last_day) t
    WHERE t."weightKg" IS NOT NULL LOOP
    kg[r.day - start_day + 1] := r.w;
  END LOOP;
  FOR r IN SELECT n.day, (n.totals->>'kcal')::float8 AS k FROM public.nutrition_day_totals(start_day, last_day, zone) n
    WHERE n.foods > 0 AND (n.totals->>'kcal')::float8 > 0 LOOP
    kcal[r.day - start_day + 1] := r.k;
  END LOOP;

  -- The newest point: the tile's own estimate.
  estimate := public.energy_expenditure_at(last_day, p_days);
  IF estimate ? 'kcalPerDay' THEN
    points := ARRAY[pg_catalog.jsonb_build_object('day', last_day) || (estimate - 'from' - 'to' - 'weighings'
      - 'loggedDays' - 'completeDays' - 'leftOutDays')];
  END IF;

  e := span - p_step;
  WHILE start_day + e - 1 >= p_from LOOP
    ts := ARRAY[]::float8[]; ws := ARRAY[]::float8[]; total := 0; logged := 0;
    FOR i IN e - p_days + 1 .. e LOOP
      CONTINUE WHEN left_out[i];
      IF kg[i] IS NOT NULL THEN ts := ts || (i - (e - p_days + 1))::float8; ws := ws || kg[i]; END IF;
      IF kcal[i] IS NOT NULL THEN total := total + kcal[i]; logged := logged + 1; END IF;
    END LOOP;
    IF coalesce(array_length(ws, 1), 0) >= need_weighings AND logged >= need_complete THEN
      points := pg_catalog.array_prepend(pg_catalog.jsonb_build_object('day', start_day + e - 1)
        || public.expenditure_fit(ts, ws, total / logged), points);
    END IF;
    e := e - p_step;
  END LOOP;
  RETURN pg_catalog.to_jsonb(points);
END;
$function$;

REVOKE ALL ON FUNCTION public.energy_expenditure_history(date, date, integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.energy_expenditure_history(date, date, integer, integer) TO authenticated, service_role;
