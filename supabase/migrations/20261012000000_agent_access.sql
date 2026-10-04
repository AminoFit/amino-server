-- Agent access, phase 2 (2026-10-03-mcp-food-search-and-writes-plan.md). Tokens agents get through OAuth are ordinary
-- `authenticated` sessions with a `client_id` claim, so until now an agent could write anything row-level security lets
-- the user write by calling PostgREST directly, around the MCP server. From here those tokens are read-only: every
-- write an agent makes goes through the MCP server, which checks the user's "Let agents make changes" setting and runs
-- the write on the server for the verified user. The app's and the website's own sessions have no `client_id`.
SET TimeZone = 'UTC';

-- 1. Is this request made with an agent's (OAuth-issued) token?
CREATE OR REPLACE FUNCTION public.is_agent_token() RETURNS boolean
LANGUAGE sql STABLE SET search_path = '' AS $function$
  SELECT coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'client_id', '') <> '';
$function$;
REVOKE ALL ON FUNCTION public.is_agent_token() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_agent_token() TO authenticated, service_role;

-- 2. No inserts, updates or deletes with an agent token, on every public table the app's role may write (a restrictive
-- policy is ANDed with the table's own policies, so reads and the app's writes are unchanged), and on the user's photos.
DO $do$
DECLARE t record;
BEGIN
  FOR t IN SELECT DISTINCT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relrowsecurity
      AND (has_table_privilege('authenticated', c.oid, 'INSERT') OR has_table_privilege('authenticated', c.oid, 'UPDATE')
        OR has_table_privilege('authenticated', c.oid, 'DELETE'))
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS "No inserts by agents" ON public.%I', t.relname);
    EXECUTE format('DROP POLICY IF EXISTS "No updates by agents" ON public.%I', t.relname);
    EXECUTE format('DROP POLICY IF EXISTS "No deletes by agents" ON public.%I', t.relname);
    EXECUTE format('CREATE POLICY "No inserts by agents" ON public.%I AS RESTRICTIVE FOR INSERT TO authenticated
      WITH CHECK (NOT public.is_agent_token())', t.relname);
    EXECUTE format('CREATE POLICY "No updates by agents" ON public.%I AS RESTRICTIVE FOR UPDATE TO authenticated
      USING (NOT public.is_agent_token()) WITH CHECK (NOT public.is_agent_token())', t.relname);
    EXECUTE format('CREATE POLICY "No deletes by agents" ON public.%I AS RESTRICTIVE FOR DELETE TO authenticated
      USING (NOT public.is_agent_token())', t.relname);
  END LOOP;
END
$do$;

DROP POLICY IF EXISTS "No uploads by agents" ON storage.objects;
DROP POLICY IF EXISTS "No file changes by agents" ON storage.objects;
DROP POLICY IF EXISTS "No file deletes by agents" ON storage.objects;
CREATE POLICY "No uploads by agents" ON storage.objects AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (NOT public.is_agent_token());
CREATE POLICY "No file changes by agents" ON storage.objects AS RESTRICTIVE FOR UPDATE TO authenticated
  USING (NOT public.is_agent_token()) WITH CHECK (NOT public.is_agent_token());
CREATE POLICY "No file deletes by agents" ON storage.objects AS RESTRICTIVE FOR DELETE TO authenticated
  USING (NOT public.is_agent_token());

-- 3. The two weight functions write as their owner, so they check for themselves. An agent's weigh-in is recorded by
-- the MCP server through record_weight_for (server only).
CREATE OR REPLACE FUNCTION public.record_weight_for(p_user_id uuid, p_weight_kg numeric, p_measured_at timestamptz,
  p_source text) RETURNS bigint
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $function$
DECLARE entry bigint;
BEGIN
  IF p_user_id IS NULL THEN RAISE EXCEPTION 'Not signed in' USING ERRCODE = '28000'; END IF;
  IF p_weight_kg IS NULL OR p_weight_kg NOT BETWEEN 20 AND 400 OR p_source NOT IN ('profile', 'agent')
     OR coalesce(p_measured_at, pg_catalog.now()) > pg_catalog.now() + interval '1 day' THEN
    RAISE EXCEPTION 'Invalid weight' USING ERRCODE = '22023'; END IF;
  INSERT INTO public."WeightEntry" ("userId", "measuredAt", "weightKg", source)
  VALUES (p_user_id, coalesce(p_measured_at, pg_catalog.now()), round(p_weight_kg, 2), p_source) RETURNING id INTO entry;
  PERFORM public.refresh_user_weight(p_user_id);
  RETURN entry;
END;
$function$;
REVOKE ALL ON FUNCTION public.record_weight_for(uuid, numeric, timestamptz, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_weight_for(uuid, numeric, timestamptz, text) TO service_role;

CREATE OR REPLACE FUNCTION public.record_weight(p_weight_kg numeric, p_measured_at timestamptz DEFAULT NULL,
  p_source text DEFAULT 'profile') RETURNS bigint
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $function$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not signed in' USING ERRCODE = '28000'; END IF;
  IF public.is_agent_token() THEN RAISE EXCEPTION 'Agents record weights through Amino' USING ERRCODE = '42501'; END IF;
  RETURN public.record_weight_for(auth.uid(), p_weight_kg, p_measured_at, p_source);
END;
$function$;
REVOKE ALL ON FUNCTION public.record_weight(numeric, timestamptz, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_weight(numeric, timestamptz, text) TO authenticated, service_role;

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
  IF public.is_agent_token() THEN RAISE EXCEPTION 'Agents cannot import weights' USING ERRCODE = '42501'; END IF;
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

-- 4. The user's choice: may connected agents log, edit and delete meals and add their own foods and recipes? Off until
-- the user turns it on in the app (Settings › Connected agents), which only the app's own session can do: the table is
-- read-only to users and written by the server.
CREATE TABLE IF NOT EXISTS public."AgentSettings" (
  "userId" uuid PRIMARY KEY REFERENCES public."User"(id) ON DELETE CASCADE,
  "writesEnabled" boolean NOT NULL DEFAULT false,
  "updatedAt" timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public."AgentSettings" IS 'Per user: whether connected agents (MCP) may make changes. Written only by the server.';
ALTER TABLE public."AgentSettings" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."AgentSettings" FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public."AgentSettings" TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public."AgentSettings" TO service_role;
DROP POLICY IF EXISTS "Read your own agent settings" ON public."AgentSettings";
CREATE POLICY "Read your own agent settings" ON public."AgentSettings" FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) = "userId");

-- 5. A goal weight, set in the app or by an agent (a goal, so not behind the setting above).
ALTER TABLE public."User" ADD COLUMN IF NOT EXISTS "goalWeightKg" numeric(5, 2)
  CHECK ("goalWeightKg" IS NULL OR "goalWeightKg" BETWEEN 25 AND 350);

-- 6. Kill switch for agent writes, owner first.
INSERT INTO public."FeatureFlag"(name, value) VALUES ('mcp_writes', '6b005b82-88a5-457b-a1aa-60ecb1e90e21')
ON CONFLICT (name) DO NOTHING;
