-- Weight history (2026-10-03-weight-history-plan.md, phase 1): every weight the user records, from Apple Health (read
-- by the app), the app's Profile editor and agents over MCP, so the Progress tab can show a trend and, later, estimate
-- expenditure. "User"."weightKg" stays the latest weight, kept in step, so every existing reader keeps working.
--
-- Apple Health keeps weight and body fat as separate samples taken moments apart. They share one entry when the same
-- source recorded them within 5 minutes; body fat that arrives before its weight waits in an entry without a weight.
-- No backfill: "User"."weightKg" has no date, and an invented one would mislead the trend.
CREATE TABLE IF NOT EXISTS public."WeightEntry" (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  "userId" uuid NOT NULL REFERENCES public."User"(id) ON DELETE CASCADE,
  "measuredAt" timestamptz NOT NULL,
  "weightKg" numeric(5,2) CHECK ("weightKg" BETWEEN 20 AND 400),
  "bodyFatPct" numeric(4,1) CHECK ("bodyFatPct" BETWEEN 2 AND 75),
  source text NOT NULL CHECK (source IN ('health', 'profile', 'agent')),
  -- Health: the app or device that recorded it ("Withings", "Health").
  "sourceName" text,
  -- Health sample UUIDs: re-imports never duplicate, and deletions in Health find their entry.
  "healthSampleId" uuid,
  "bodyFatSampleId" uuid,
  "deletedAt" timestamptz,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now(),
  CHECK ("weightKg" IS NOT NULL OR "bodyFatPct" IS NOT NULL),
  UNIQUE ("userId", "healthSampleId"),
  UNIQUE ("userId", "bodyFatSampleId")
);
-- The app pulls rows changed since its last sync; charts read by time.
CREATE INDEX IF NOT EXISTS "WeightEntry_userId_updatedAt_idx" ON public."WeightEntry"("userId", "updatedAt");
CREATE INDEX IF NOT EXISTS "WeightEntry_userId_measuredAt_idx" ON public."WeightEntry"("userId", "measuredAt")
  WHERE "deletedAt" IS NULL;
ALTER TABLE public."WeightEntry" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Read your own weight" ON public."WeightEntry";
CREATE POLICY "Read your own weight" ON public."WeightEntry" FOR SELECT USING ("userId" = (SELECT auth.uid()));
-- Writes go through the functions below only.
REVOKE INSERT, UPDATE, DELETE ON public."WeightEntry" FROM anon, authenticated;

-- The user's latest weight (by measurement time) becomes "User"."weightKg". The import flag keeps the trigger below
-- from recording that update as a new entry.
CREATE OR REPLACE FUNCTION public.refresh_user_weight(p_user_id uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $function$
DECLARE latest numeric;
BEGIN
  SELECT w."weightKg" INTO latest FROM public."WeightEntry" w
  WHERE w."userId" = p_user_id AND w."deletedAt" IS NULL AND w."weightKg" IS NOT NULL
  ORDER BY w."measuredAt" DESC, w.id DESC LIMIT 1;
  IF latest IS NULL THEN RETURN; END IF;
  PERFORM pg_catalog.set_config('app.weight_import', 'true', true);
  UPDATE public."User" SET "weightKg" = latest WHERE id = p_user_id AND "weightKg" IS DISTINCT FROM latest;
  PERFORM pg_catalog.set_config('app.weight_import', 'false', true);
END;
$function$;
REVOKE ALL ON FUNCTION public.refresh_user_weight(uuid) FROM PUBLIC, anon, authenticated;

-- Every other way weight changes (the app writing "User" directly, the web, support) is recorded as a profile entry.
-- The app saves every profile field together and rounds weight to a whole kg: writing back the same weight rounded
-- (78.4 from Health saved as 78 with the goals) is no change, and the precise weight stays.
CREATE OR REPLACE FUNCTION public.record_user_weight_change() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $function$
BEGIN
  IF NEW."weightKg" IS NULL OR NEW."weightKg" IS NOT DISTINCT FROM OLD."weightKg"
     OR coalesce(pg_catalog.current_setting('app.weight_import', true), '') = 'true' THEN
    RETURN NEW;
  END IF;
  IF OLD."weightKg" IS NOT NULL AND NEW."weightKg" = round(OLD."weightKg") THEN
    NEW."weightKg" := OLD."weightKg";
    RETURN NEW;
  END IF;
  IF NEW."weightKg" BETWEEN 20 AND 400 THEN
    INSERT INTO public."WeightEntry" ("userId", "measuredAt", "weightKg", source)
    VALUES (NEW.id, pg_catalog.now(), NEW."weightKg", 'profile');
  END IF;
  RETURN NEW;
END;
$function$;
DROP TRIGGER IF EXISTS "User_weight_history" ON public."User";
CREATE TRIGGER "User_weight_history" BEFORE UPDATE OF "weightKg" ON public."User"
  FOR EACH ROW EXECUTE FUNCTION public.record_user_weight_change();

-- One weight recorded in Amino (the Profile editor, an agent), at a time (default now), then "User"."weightKg".
CREATE OR REPLACE FUNCTION public.record_weight(p_weight_kg numeric, p_measured_at timestamptz DEFAULT NULL,
  p_source text DEFAULT 'profile') RETURNS bigint
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $function$
DECLARE me uuid := auth.uid(); entry bigint;
BEGIN
  IF me IS NULL THEN RAISE EXCEPTION 'Not signed in' USING ERRCODE = '28000'; END IF;
  IF p_weight_kg IS NULL OR p_weight_kg NOT BETWEEN 20 AND 400 OR p_source NOT IN ('profile', 'agent')
     OR coalesce(p_measured_at, pg_catalog.now()) > pg_catalog.now() + interval '1 day' THEN
    RAISE EXCEPTION 'Invalid weight' USING ERRCODE = '22023'; END IF;
  INSERT INTO public."WeightEntry" ("userId", "measuredAt", "weightKg", source)
  VALUES (me, coalesce(p_measured_at, pg_catalog.now()), round(p_weight_kg, 2), p_source) RETURNING id INTO entry;
  PERFORM public.refresh_user_weight(me);
  RETURN entry;
END;
$function$;
REVOKE ALL ON FUNCTION public.record_weight(numeric, timestamptz, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_weight(numeric, timestamptz, text) TO authenticated, service_role;

-- Apple Health samples read by the app, for the signed-in user. p_rows: at most 500 of
-- {"kind": "weight"|"bodyFat", "id": <sample UUID>, "at": <ISO time>, "value": <kg | percent>, "sourceName": "..."};
-- p_deleted: sample UUIDs Health no longer has. Re-imports change nothing. Returns the entries changed.
CREATE OR REPLACE FUNCTION public.import_weight_entries(p_rows jsonb, p_deleted jsonb DEFAULT '[]'::jsonb) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $function$
DECLARE
  me uuid := auth.uid();
  sample jsonb;
  sample_id uuid;
  at timestamptz;
  value numeric;
  source_name text;
  target bigint;
  changed integer := 0;
  touched integer;
BEGIN
  IF me IS NULL THEN RAISE EXCEPTION 'Not signed in' USING ERRCODE = '28000'; END IF;
  IF jsonb_typeof(p_rows) IS DISTINCT FROM 'array' OR jsonb_array_length(p_rows) > 500
     OR jsonb_typeof(p_deleted) IS DISTINCT FROM 'array' OR jsonb_array_length(p_deleted) > 500 THEN
    RAISE EXCEPTION 'Invalid weight import' USING ERRCODE = '22023'; END IF;
  -- Weights first, so body fat from the same weigh-in finds its entry.
  FOR sample IN SELECT r FROM jsonb_array_elements(p_rows) r ORDER BY (r->>'kind') = 'bodyFat' LOOP
    sample_id := (sample->>'id')::uuid;
    at := (sample->>'at')::timestamptz;
    value := (sample->>'value')::numeric;
    source_name := left(nullif(btrim(sample->>'sourceName'), ''), 80);
    IF sample_id IS NULL OR at IS NULL OR value IS NULL OR at > pg_catalog.now() + interval '1 day'
       OR at < timestamptz '1990-01-01' THEN CONTINUE; END IF;
    IF sample->>'kind' = 'weight' THEN
      IF value NOT BETWEEN 20 AND 400 THEN CONTINUE; END IF;
      IF EXISTS (SELECT 1 FROM public."WeightEntry" WHERE "userId" = me AND "healthSampleId" = sample_id) THEN
        UPDATE public."WeightEntry" SET "weightKg" = round(value, 2), "measuredAt" = at, "deletedAt" = NULL,
          "updatedAt" = pg_catalog.now()
        WHERE "userId" = me AND "healthSampleId" = sample_id
          AND ("weightKg" IS DISTINCT FROM round(value, 2) OR "measuredAt" IS DISTINCT FROM at OR "deletedAt" IS NOT NULL);
      ELSE
        -- Body fat from the same weigh-in that arrived first.
        SELECT id INTO target FROM public."WeightEntry"
        WHERE "userId" = me AND "weightKg" IS NULL AND "deletedAt" IS NULL AND "sourceName" IS NOT DISTINCT FROM source_name
          AND abs(extract(epoch FROM "measuredAt" - at)) <= 300
        ORDER BY abs(extract(epoch FROM "measuredAt" - at)) LIMIT 1;
        IF target IS NOT NULL THEN
          UPDATE public."WeightEntry" SET "weightKg" = round(value, 2), "healthSampleId" = sample_id, "measuredAt" = at,
            "updatedAt" = pg_catalog.now() WHERE id = target;
        ELSE
          INSERT INTO public."WeightEntry" ("userId", "measuredAt", "weightKg", source, "sourceName", "healthSampleId")
          VALUES (me, at, round(value, 2), 'health', source_name, sample_id);
        END IF;
      END IF;
    ELSIF sample->>'kind' = 'bodyFat' THEN
      IF value NOT BETWEEN 2 AND 75 THEN CONTINUE; END IF;
      IF EXISTS (SELECT 1 FROM public."WeightEntry" WHERE "userId" = me AND "bodyFatSampleId" = sample_id) THEN
        UPDATE public."WeightEntry" SET "bodyFatPct" = round(value, 1), "updatedAt" = pg_catalog.now()
        WHERE "userId" = me AND "bodyFatSampleId" = sample_id AND "bodyFatPct" IS DISTINCT FROM round(value, 1);
      ELSE
        SELECT id INTO target FROM public."WeightEntry"
        WHERE "userId" = me AND source = 'health' AND "deletedAt" IS NULL AND "bodyFatSampleId" IS NULL
          AND "weightKg" IS NOT NULL AND "sourceName" IS NOT DISTINCT FROM source_name
          AND abs(extract(epoch FROM "measuredAt" - at)) <= 300
        ORDER BY abs(extract(epoch FROM "measuredAt" - at)) LIMIT 1;
        IF target IS NOT NULL THEN
          UPDATE public."WeightEntry" SET "bodyFatPct" = round(value, 1), "bodyFatSampleId" = sample_id,
            "updatedAt" = pg_catalog.now() WHERE id = target;
        ELSE
          INSERT INTO public."WeightEntry" ("userId", "measuredAt", "bodyFatPct", source, "sourceName", "bodyFatSampleId")
          VALUES (me, at, round(value, 1), 'health', source_name, sample_id);
        END IF;
      END IF;
    ELSE
      CONTINUE;
    END IF;
    GET DIAGNOSTICS touched = ROW_COUNT;
    changed := changed + touched;
  END LOOP;
  -- Samples deleted in Health: a weight hides its entry; a body fat leaves the weight.
  UPDATE public."WeightEntry" SET "deletedAt" = pg_catalog.now(), "updatedAt" = pg_catalog.now()
  WHERE "userId" = me AND "deletedAt" IS NULL
    AND "healthSampleId" IN (SELECT (d #>> '{}')::uuid FROM jsonb_array_elements(p_deleted) d);
  GET DIAGNOSTICS touched = ROW_COUNT;
  changed := changed + touched;
  UPDATE public."WeightEntry" SET "bodyFatPct" = NULL, "bodyFatSampleId" = NULL, "updatedAt" = pg_catalog.now(),
    "deletedAt" = CASE WHEN "weightKg" IS NULL THEN pg_catalog.now() ELSE "deletedAt" END
  WHERE "userId" = me AND "bodyFatSampleId" IN (SELECT (d #>> '{}')::uuid FROM jsonb_array_elements(p_deleted) d);
  GET DIAGNOSTICS touched = ROW_COUNT;
  changed := changed + touched;
  IF changed > 0 THEN PERFORM public.refresh_user_weight(me); END IF;
  RETURN changed;
END;
$function$;
REVOKE ALL ON FUNCTION public.import_weight_entries(jsonb, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.import_weight_entries(jsonb, jsonb) TO authenticated, service_role;

-- The signed-in user's weight per local day in [p_from, p_to] (at most 2 years): the day's mean weight and body fat
-- when measured, and the trend, an exponential moving average (alpha 0.1) of daily weights that carries over days
-- without a weigh-in. The trend is for display only: it lags a changing weight by about 9 days, so expenditure is
-- estimated from the raw weights instead (plan, "Estimating expenditure"). Days before the first weigh-in are left out.
CREATE OR REPLACE FUNCTION public.weight_trend(p_from date, p_to date)
RETURNS TABLE(day date, "weightKg" numeric, "bodyFatPct" numeric, "trendKg" numeric)
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = '' AS $function$
DECLARE
  me uuid := auth.uid();
  zone text;
  first_day date;
  ema float8;
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
    SELECT g.d::date AS d, a.kg, a.fat FROM generate_series(first_day, p_to, interval '1 day') g(d)
    LEFT JOIN (SELECT (w."measuredAt" AT TIME ZONE zone)::date AS d, avg(w."weightKg")::float8 AS kg,
        avg(w."bodyFatPct")::float8 AS fat
      FROM public."WeightEntry" w
      WHERE w."userId" = me AND w."deletedAt" IS NULL AND w."weightKg" IS NOT NULL
        AND w."measuredAt" >= (first_day::timestamp AT TIME ZONE zone)
        AND w."measuredAt" < ((p_to + 1)::timestamp AT TIME ZONE zone)
      GROUP BY 1) a ON a.d = g.d::date
    ORDER BY 1
  LOOP
    IF measured.kg IS NOT NULL THEN ema := CASE WHEN ema IS NULL THEN measured.kg ELSE ema + 0.1 * (measured.kg - ema) END; END IF;
    IF measured.d >= p_from AND ema IS NOT NULL THEN
      day := measured.d;
      "weightKg" := round(measured.kg::numeric, 2);
      "bodyFatPct" := round(measured.fat::numeric, 1);
      "trendKg" := round(ema::numeric, 2);
      RETURN NEXT;
    END IF;
  END LOOP;
END;
$function$;
REVOKE ALL ON FUNCTION public.weight_trend(date, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.weight_trend(date, date) TO authenticated, service_role;
