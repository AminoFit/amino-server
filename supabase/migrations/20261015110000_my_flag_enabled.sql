-- The app calls energy_expenditure as the signed-in user, who can't read FeatureFlag or call user_flag_enabled
-- (permission denied: the tile fell back to "Coming soon"). my_flag_enabled answers for the caller only, with the
-- definer's rights; it says nothing about anyone else.
CREATE OR REPLACE FUNCTION public.my_flag_enabled(p_flag text)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO ''
AS $function$
  SELECT auth.uid() IS NOT NULL AND public.user_flag_enabled(p_flag, auth.uid());
$function$;
REVOKE ALL ON FUNCTION public.my_flag_enabled(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_flag_enabled(text) TO authenticated, service_role;

-- energy_expenditure asks it instead of user_flag_enabled.
CREATE OR REPLACE FUNCTION public.energy_expenditure(p_days integer DEFAULT 28)
RETURNS jsonb
LANGUAGE plpgsql STABLE SET search_path TO ''
AS $function$
DECLARE
  me uuid := auth.uid();
  zone text := public.mcp_user_timezone();
  last_day date;
  first_day date;
  ts float8[];
  ws float8[];
  kcals float8[];
  median_kcal float8;
  intake float8;
  complete int;
  logged int;
  need_weighings int;
  need_complete int;
  wt float8[];
  t_mean float8; w_mean float8; sxx float8; sxy float8; slope float8; intercept float8;
  scale float8; k float8; resid float8; sse float8; sw float8; se float8;
  n int;
BEGIN
  IF me IS NULL THEN RAISE EXCEPTION 'Not signed in' USING ERRCODE = '28000'; END IF;
  IF p_days IS NULL OR p_days NOT BETWEEN 14 AND 56 THEN RAISE EXCEPTION 'Invalid window' USING ERRCODE = '22023'; END IF;
  last_day := (pg_catalog.now() AT TIME ZONE zone)::date - 1;
  first_day := last_day - (p_days - 1);
  need_weighings := ceil(10.0 * p_days / 28);
  need_complete := ceil(18.0 * p_days / 28);

  SELECT array_agg((t.day - first_day)::float8 ORDER BY t.day), array_agg(t."weightKg"::float8 ORDER BY t.day)
  INTO ts, ws FROM public.weight_trend(first_day, last_day) t WHERE t."weightKg" IS NOT NULL;
  n := coalesce(array_length(ws, 1), 0);

  SELECT array_agg((d.totals->>'kcal')::float8) INTO kcals
  FROM public.nutrition_day_totals(first_day, last_day, zone) d
  WHERE d.foods > 0 AND (d.totals->>'kcal')::float8 > 0;
  logged := coalesce(array_length(kcals, 1), 0);
  SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY k0) INTO median_kcal FROM pg_catalog.unnest(kcals) k0;
  SELECT count(*), avg(k0) INTO complete, intake FROM pg_catalog.unnest(kcals) k0 WHERE k0 >= 0.6 * median_kcal;
  complete := coalesce(complete, 0);

  IF n < need_weighings OR complete < need_complete THEN
    RETURN pg_catalog.jsonb_build_object('enabled', public.my_flag_enabled('expenditure_estimate'),
      'from', first_day, 'to', last_day, 'weighings', n, 'loggedDays', logged, 'completeDays', complete,
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

  RETURN pg_catalog.jsonb_build_object('enabled', public.my_flag_enabled('expenditure_estimate'),
    'from', first_day, 'to', last_day, 'weighings', n, 'loggedDays', logged, 'completeDays', complete,
    'kcalPerDay', round((intake - slope * 7700) / 10) * 10,
    'plusMinus', greatest(round(se * 7700 / 10) * 10, 10),
    'meanIntakeKcal', round(intake),
    'trendKgPerWeek', round((slope * 7)::numeric, 2));
END;
$function$;
