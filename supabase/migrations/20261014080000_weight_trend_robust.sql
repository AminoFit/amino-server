-- The weight trend, made robust (the app's common/progress/weightTrend.ts does the same arithmetic):
-- * a weigh-in after a gap counts for the days it covers (alpha 1 - 0.9^days): weighing every third day lagged three
--   times as much as weighing daily;
-- * one reading moves the trend at most 2% of it (1.5 kg at 75 kg): a water swing passes, a misread scale doesn't drag
--   the line;
-- * a day with several readings counts the one nearest the trend, with its own body fat (the owner's scale recorded
--   73 kg at 5 am and 81 kg at 8:30 the same morning; their mean was neither). The first day takes the reading nearest
--   its median. The day's "weightKg" is that reading.
CREATE OR REPLACE FUNCTION public.weight_trend(p_from date, p_to date)
RETURNS TABLE(day date, "weightKg" numeric, "bodyFatPct" numeric, "trendKg" numeric)
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = '' AS $function$
DECLARE
  me uuid := auth.uid();
  zone text;
  first_day date;
  last_weighed date;
  ema float8;
  target float8;
  chosen int;
  alpha float8;
  cap float8;
  measured record;
BEGIN
  IF me IS NULL THEN RAISE EXCEPTION 'Not signed in' USING ERRCODE = '28000'; END IF;
  IF p_from IS NULL OR p_to IS NULL OR p_to < p_from OR p_to - p_from > 731 THEN
    RAISE EXCEPTION 'Invalid range' USING ERRCODE = '22023'; END IF;
  SELECT coalesce(public.valid_timezone(u."tzIdentifier"), 'UTC') INTO zone FROM public."User" u WHERE u.id = me;
  zone := coalesce(zone, 'UTC');
  -- The trend warms up over the 120 days before the range.
  SELECT min((w."measuredAt" AT TIME ZONE zone)::date) INTO first_day FROM public."WeightEntry" w
  WHERE w."userId" = me AND w."deletedAt" IS NULL AND w."weightKg" IS NOT NULL
    AND w."measuredAt" >= ((p_from - 120)::timestamp AT TIME ZONE zone);
  IF first_day IS NULL OR first_day > p_to THEN RETURN; END IF;
  FOR measured IN
    SELECT g.d::date AS d, a.kg, a.fat, a.med FROM generate_series(first_day, p_to, interval '1 day') g(d)
    LEFT JOIN (SELECT (w."measuredAt" AT TIME ZONE zone)::date AS d,
        array_agg(w."weightKg"::float8 ORDER BY w."measuredAt", w.id) AS kg,
        array_agg(w."bodyFatPct"::float8 ORDER BY w."measuredAt", w.id) AS fat,
        percentile_cont(0.5) WITHIN GROUP (ORDER BY w."weightKg"::float8) AS med
      FROM public."WeightEntry" w
      WHERE w."userId" = me AND w."deletedAt" IS NULL AND w."weightKg" IS NOT NULL
        AND w."measuredAt" >= (first_day::timestamp AT TIME ZONE zone)
        AND w."measuredAt" < ((p_to + 1)::timestamp AT TIME ZONE zone)
      GROUP BY 1) a ON a.d = g.d::date
    ORDER BY 1
  LOOP
    chosen := NULL;
    IF measured.kg IS NOT NULL THEN
      -- The reading nearest the trend (the first day: its median); the earlier one on a tie.
      target := coalesce(ema, measured.med);
      chosen := 1;
      FOR i IN 2 .. array_length(measured.kg, 1) LOOP
        IF abs(measured.kg[i] - target) < abs(measured.kg[chosen] - target) THEN chosen := i; END IF;
      END LOOP;
      IF ema IS NULL THEN ema := measured.kg[chosen];
      ELSE
        alpha := 1 - power(0.9, measured.d - last_weighed);
        cap := 0.02 * ema;
        ema := ema + alpha * greatest(-cap, least(cap, measured.kg[chosen] - ema));
      END IF;
      last_weighed := measured.d;
    END IF;
    IF measured.d >= p_from AND ema IS NOT NULL THEN
      day := measured.d;
      "weightKg" := CASE WHEN chosen IS NULL THEN NULL ELSE round(measured.kg[chosen]::numeric, 2) END;
      "bodyFatPct" := CASE WHEN chosen IS NULL THEN NULL ELSE round(measured.fat[chosen]::numeric, 1) END;
      "trendKg" := round(ema::numeric, 2);
      RETURN NEXT;
    END IF;
  END LOOP;
END;
$function$;
REVOKE ALL ON FUNCTION public.weight_trend(date, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.weight_trend(date, date) TO authenticated, service_role;
