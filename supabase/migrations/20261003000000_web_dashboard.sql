-- Web dashboard (2026-10-03): a signed-in user's day, stats and connected agents at /dashboard, and signing in on the
-- web by scanning a code with the app.
--
-- Everything here reads the caller's own rows (auth.uid()). Days are the user's profile time zone, as in the app.

-- 1. A valid time zone name, else NULL. Checking pg_timezone_names reads every zone file (20-50 ms a call), so try the
-- conversion instead. mcp_user_timezone uses it too.
CREATE OR REPLACE FUNCTION public.valid_timezone(p_name text) RETURNS text
LANGUAGE plpgsql STABLE SET search_path = '' AS $function$
BEGIN
  IF p_name IS NULL OR p_name = '' THEN RETURN NULL; END IF;
  PERFORM pg_catalog.now() AT TIME ZONE p_name;
  RETURN p_name;
EXCEPTION WHEN OTHERS THEN RETURN NULL;
END;
$function$;

CREATE OR REPLACE FUNCTION public.mcp_user_timezone() RETURNS text
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = '' AS $function$
  SELECT coalesce(public.valid_timezone((SELECT u."tzIdentifier" FROM public."User" u WHERE u.id = auth.uid())), 'UTC');
$function$;

-- 2. Meals by the time they were eaten. The dashboard and the MCP functions filter on this exact expression.
CREATE INDEX IF NOT EXISTS "Message_userId_eatenAt_idx" ON public."Message"("userId", (coalesce("consumedOn", "createdAt")))
  WHERE "deletedAt" IS NULL;

-- 3. Row policies that call auth.uid() per row: wrap it in a subquery so Postgres evaluates it once per statement.
-- Same rules, only faster (Supabase's auth_rls_initplan advice).
DO $$
DECLARE p record;
BEGIN
  FOR p IN SELECT tablename, policyname, qual, with_check FROM pg_catalog.pg_policies
    WHERE schemaname = 'public' AND tablename IN ('User', 'Message', 'LoggedFoodItem', 'FoodItem', 'UserMessageImages')
  LOOP
    IF p.qual LIKE '%auth.uid()%' AND p.qual NOT LIKE '%SELECT auth.uid()%' THEN
      EXECUTE format('ALTER POLICY %I ON public.%I USING (%s)', p.policyname, p.tablename,
        replace(p.qual, 'auth.uid()', '(SELECT auth.uid())'));
    END IF;
    IF p.with_check LIKE '%auth.uid()%' AND p.with_check NOT LIKE '%SELECT auth.uid()%' THEN
      EXECUTE format('ALTER POLICY %I ON public.%I WITH CHECK (%s)', p.policyname, p.tablename,
        replace(p.with_check, 'auth.uid()', '(SELECT auth.uid())'));
    END IF;
  END LOOP;
END $$;

-- 4. The dashboard's reads. SECURITY DEFINER so the joins skip the per-row food and serving policies; each one starts
-- from the caller's own meals or requests, so it can only return what the caller could read anyway.

-- The caller's time zone, today there, goals and name.
DROP FUNCTION IF EXISTS public.web_me();
CREATE OR REPLACE FUNCTION public.web_me() RETURNS TABLE(tz text, today date, goals jsonb, name text, email text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $function$
  SELECT z.tz, (pg_catalog.now() AT TIME ZONE z.tz)::date,
    jsonb_build_object('kcal', u."calorieGoal", 'proteinG', u."proteinGoal", 'carbG', u."carbsGoal", 'totalFatG', u."fatGoal"),
    u."fullName"::text, u.email::text
  FROM public."User" u, LATERAL (SELECT coalesce(public.valid_timezone(u."tzIdentifier"), 'UTC') AS tz) z
  WHERE u.id = auth.uid();
$function$;

-- The icon the app shows for a food: fewest downvotes, then the newest image, without any query string.
CREATE OR REPLACE FUNCTION public.web_food_icon(p_food_id integer) RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $function$
  SELECT pg_catalog.split_part(i."pathToImage", '?', 1) FROM public."FoodItemImages" fi
  JOIN public."FoodImage" i ON i.id = fi."foodImageId"
  WHERE fi."foodItemId" = p_food_id ORDER BY i.downvotes, i.id DESC LIMIT 1;
$function$;

-- Per local day in [p_from, p_to]: meals and totals. Days with nothing logged are left out.
CREATE OR REPLACE FUNCTION public.web_days(p_from date, p_to date) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $function$
DECLARE
  uid uuid := auth.uid();
  zone text;
  result jsonb;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Not signed in' USING ERRCODE = '28000'; END IF;
  IF p_from IS NULL OR p_to IS NULL OR p_to < p_from OR p_to - p_from > 400 THEN
    RAISE EXCEPTION 'Invalid range' USING ERRCODE = '22023'; END IF;
  SELECT w.tz INTO zone FROM public.web_me() w;
  WITH meals AS (
    SELECT m.id, ((coalesce(m."consumedOn", m."createdAt") AT TIME ZONE 'UTC') AT TIME ZONE zone)::date AS day
    FROM public."Message" m
    WHERE m."userId" = uid AND m."deletedAt" IS NULL AND m.role = 'User'
      AND coalesce(m."consumedOn", m."createdAt") >= (p_from::timestamp AT TIME ZONE zone) AT TIME ZONE 'UTC'
      AND coalesce(m."consumedOn", m."createdAt") < ((p_to + 1)::timestamp AT TIME ZONE zone) AT TIME ZONE 'UTC'),
  days AS (
    SELECT meals.day, count(DISTINCT meals.id) AS meals, sum(l.kcal) AS kcal, sum(l."proteinG") AS protein,
      sum(l."carbG") AS carb, sum(l."totalFatG") AS fat, sum(l."fiberG") AS fiber
    FROM meals JOIN public."LoggedFoodItem" l ON l."messageId" = meals.id AND l."deletedAt" IS NULL
    GROUP BY meals.day)
  SELECT coalesce(jsonb_agg(jsonb_build_object('date', d.day, 'meals', d.meals,
      'kcal', round(coalesce(d.kcal, 0)::numeric), 'proteinG', round(coalesce(d.protein, 0)::numeric, 1),
      'carbG', round(coalesce(d.carb, 0)::numeric, 1), 'totalFatG', round(coalesce(d.fat, 0)::numeric, 1),
      'fiberG', round(coalesce(d.fiber, 0)::numeric, 1)) ORDER BY d.day), '[]'::jsonb)
  INTO result FROM days d;
  RETURN result;
END;
$function$;

-- One local day: its meals (oldest first) with their foods, icons and photo paths.
CREATE OR REPLACE FUNCTION public.web_day(p_date date) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $function$
DECLARE
  uid uuid := auth.uid();
  zone text;
  lo timestamp;
  hi timestamp;
  result jsonb;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Not signed in' USING ERRCODE = '28000'; END IF;
  IF p_date IS NULL THEN RAISE EXCEPTION 'Invalid date' USING ERRCODE = '22023'; END IF;
  SELECT w.tz INTO zone FROM public.web_me() w;
  lo := (p_date::timestamp AT TIME ZONE zone) AT TIME ZONE 'UTC';
  hi := ((p_date + 1)::timestamp AT TIME ZONE zone) AT TIME ZONE 'UTC';
  WITH meals AS (
    SELECT m.id, coalesce(m."consumedOn", m."createdAt") AS at, m.content, m.hasimages, m."isAudio", m.status
    FROM public."Message" m
    WHERE m."userId" = uid AND m."deletedAt" IS NULL AND m.role = 'User'
      AND coalesce(m."consumedOn", m."createdAt") >= lo AND coalesce(m."consumedOn", m."createdAt") < hi
      AND (m."messageType" = 'FOOD_LOG_REQUEST' OR EXISTS (SELECT 1 FROM public."LoggedFoodItem" l WHERE l."messageId" = m.id))),
  items AS (
    SELECT l."messageId", jsonb_agg(jsonb_strip_nulls(jsonb_build_object('id', l.id, 'name', f.name, 'brand', f.brand,
        'amount', pg_catalog.trim_scale(round(l."servingAmount"::numeric, 2)), 'unit', coalesce(l."loggedUnit", s."servingName"),
        'grams', round(l.grams::numeric), 'icon', public.web_food_icon(l."foodItemId"),
        'kcal', round(coalesce(l.kcal, 0)::numeric), 'proteinG', round(coalesce(l."proteinG", 0)::numeric, 1),
        'carbG', round(coalesce(l."carbG", 0)::numeric, 1), 'totalFatG', round(coalesce(l."totalFatG", 0)::numeric, 1),
        'fiberG', round(coalesce(l."fiberG", 0)::numeric, 1))) ORDER BY l.id) AS list
    FROM meals JOIN public."LoggedFoodItem" l ON l."messageId" = meals.id AND l."deletedAt" IS NULL
    LEFT JOIN public."FoodItem" f ON f.id = l."foodItemId"
    LEFT JOIN public."Serving" s ON s.id = l."servingId"
    GROUP BY l."messageId"),
  photos AS (
    SELECT i."messageId", jsonb_agg(i."imagePath" ORDER BY i.id) AS list
    FROM meals JOIN public."UserMessageImages" i ON i."messageId" = meals.id WHERE meals.hasimages GROUP BY i."messageId")
  SELECT coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
      'id', m.id,
      'time', to_char((m.at AT TIME ZONE 'UTC') AT TIME ZONE zone, 'HH24:MI'),
      'text', nullif(btrim(m.content), ''),
      'input', CASE WHEN m.hasimages THEN 'photo' WHEN m."isAudio" THEN 'voice' ELSE 'text' END,
      'status', CASE m.status::text WHEN 'RESOLVED' THEN 'logged' WHEN 'FAILED' THEN 'failed' ELSE 'processing' END,
      'photos', p.list,
      'items', coalesce(i.list, '[]'::jsonb))) ORDER BY m.at, m.id), '[]'::jsonb)
  INTO result
  FROM meals m LEFT JOIN items i ON i."messageId" = m.id LEFT JOIN photos p ON p."messageId" = m.id;
  RETURN jsonb_build_object('date', p_date, 'meals', result);
END;
$function$;

-- Stats: the current logging streak (days in a row with food logged, ending today or yesterday; up to a year) and the
-- foods logged most often in the last 30 days.
CREATE OR REPLACE FUNCTION public.web_stats() RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $function$
DECLARE
  uid uuid := auth.uid();
  zone text;
  local_today date;
  streak integer;
  recent_meals integer[];
  top jsonb;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Not signed in' USING ERRCODE = '28000'; END IF;
  SELECT w.tz, w.today INTO zone, local_today FROM public.web_me() w;
  WITH logged AS (
    SELECT DISTINCT ((coalesce(m."consumedOn", m."createdAt") AT TIME ZONE 'UTC') AT TIME ZONE zone)::date AS day
    FROM public."Message" m
    WHERE m."userId" = uid AND m."deletedAt" IS NULL AND m.role = 'User'
      AND coalesce(m."consumedOn", m."createdAt") >= ((local_today - 366)::timestamp AT TIME ZONE zone) AT TIME ZONE 'UTC'
      AND EXISTS (SELECT 1 FROM public."LoggedFoodItem" l WHERE l."messageId" = m.id AND l."deletedAt" IS NULL)),
  ranked AS (SELECT day, row_number() OVER (ORDER BY day DESC) AS n FROM logged WHERE day <= local_today),
  anchor AS (SELECT CASE WHEN EXISTS (SELECT 1 FROM logged WHERE day = local_today) THEN local_today ELSE local_today - 1 END AS day)
  SELECT count(*) INTO streak FROM ranked, anchor WHERE ranked.day = anchor.day - (ranked.n - 1)::integer;

  -- The meal IDs first, so the foods are read through the messageId index (a join here can turn into a full scan).
  SELECT array_agg(m.id) INTO recent_meals FROM public."Message" m
  WHERE m."userId" = uid AND m."deletedAt" IS NULL AND m.role = 'User'
    AND coalesce(m."consumedOn", m."createdAt") >= ((local_today - 29)::timestamp AT TIME ZONE zone) AT TIME ZONE 'UTC';
  WITH counted AS (
    SELECT l."foodItemId", count(*) AS times, sum(l.kcal) AS kcal
    FROM public."LoggedFoodItem" l
    WHERE l."messageId" = ANY(recent_meals) AND l."deletedAt" IS NULL AND l."foodItemId" IS NOT NULL
    GROUP BY l."foodItemId" ORDER BY count(*) DESC, sum(l.kcal) DESC LIMIT 6)
  SELECT coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object('id', c."foodItemId", 'name', f.name, 'brand', f.brand,
      'icon', public.web_food_icon(c."foodItemId"), 'times', c.times, 'kcal', round(coalesce(c.kcal, 0)::numeric)))
      ORDER BY c.times DESC, c.kcal DESC), '[]'::jsonb)
  INTO top FROM counted c LEFT JOIN public."FoodItem" f ON f.id = c."foodItemId";

  RETURN jsonb_build_object('streak', streak, 'topFoods', top);
END;
$function$;

-- Connected agents' use over the last p_days (the log keeps 60): per OAuth client, calls, failures, time, tools, and
-- calls per local day.
CREATE OR REPLACE FUNCTION public.web_agent_usage(p_days integer DEFAULT 30) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $function$
DECLARE
  uid uuid := auth.uid();
  zone text;
  result jsonb;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Not signed in' USING ERRCODE = '28000'; END IF;
  IF p_days NOT BETWEEN 1 AND 60 THEN RAISE EXCEPTION 'Invalid range' USING ERRCODE = '22023'; END IF;
  SELECT w.tz INTO zone FROM public.web_me() w;
  WITH calls AS (
    SELECT coalesce(r."clientId", '') AS client, r.tool, r.ok, r."durationMs", r."createdAt",
      (r."createdAt" AT TIME ZONE zone)::date AS day
    FROM public."McpRequest" r
    WHERE r."userId" = uid AND r."createdAt" >= pg_catalog.now() - pg_catalog.make_interval(days => p_days)),
  per_day AS (SELECT client, jsonb_object_agg(day, n) AS days FROM (SELECT client, day, count(*) AS n FROM calls GROUP BY 1, 2) d GROUP BY client),
  per_tool AS (
    SELECT client, jsonb_agg(jsonb_build_object('tool', tool, 'calls', n) ORDER BY n DESC, tool) AS tools
    FROM (SELECT client, tool, count(*) AS n FROM calls GROUP BY 1, 2) t GROUP BY client),
  totals AS (
    SELECT client, count(*) AS calls, count(*) FILTER (WHERE NOT ok) AS failed, round(avg("durationMs")) AS avg_ms,
      max("createdAt") AS last_at FROM calls GROUP BY client)
  SELECT coalesce(jsonb_agg(jsonb_build_object('clientId', t.client, 'calls', t.calls, 'failed', t.failed,
      'avgMs', t.avg_ms, 'lastUsedAt', t.last_at, 'tools', pt.tools, 'days', pd.days) ORDER BY t.last_at DESC), '[]'::jsonb)
  INTO result
  FROM totals t JOIN per_day pd USING (client) JOIN per_tool pt USING (client);
  RETURN result;
END;
$function$;

-- The first page load in one call: goals and today, the chosen day (today when NULL), its week (Sunday first, as in the
-- app), the last 12 weeks and the stats.
CREATE OR REPLACE FUNCTION public.web_dashboard(p_date date DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $function$
DECLARE
  me record;
  day date;
  week_start date;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not signed in' USING ERRCODE = '28000'; END IF;
  SELECT * INTO me FROM public.web_me();
  IF NOT FOUND THEN RAISE EXCEPTION 'No profile' USING ERRCODE = 'P0002'; END IF;
  day := coalesce(p_date, me.today);
  week_start := day - extract(dow FROM day)::integer;
  RETURN jsonb_build_object('timezone', me.tz, 'today', me.today, 'goals', me.goals, 'name', me.name, 'email', me.email,
    'day', public.web_day(day), 'week', public.web_days(week_start, week_start + 6),
    'recent', public.web_days(me.today - 83, me.today), 'stats', public.web_stats());
END;
$function$;

-- web_me and web_food_icon are only called from the functions above (which run as their owner): an icon's file name
-- holds its food's name, so looking icons up by any food ID would reveal other users' private food names.
REVOKE ALL ON FUNCTION public.valid_timezone(text), public.web_me(), public.web_food_icon(integer),
  public.web_days(date, date), public.web_day(date), public.web_stats(), public.web_agent_usage(integer),
  public.web_dashboard(date) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.valid_timezone(text), public.web_days(date, date), public.web_day(date),
  public.web_stats(), public.web_agent_usage(integer), public.web_dashboard(date) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.web_me(), public.web_food_icon(integer) TO service_role;

-- 5. Signing in on the web with the app: the sign-in page shows a QR code, the app approves with its own session, and
-- the server leaves a one-time sign-in token for the browser that asked (it proves that with a cookie only it holds).
-- Rows live 5 minutes.
CREATE TABLE IF NOT EXISTS public."WebSignIn" (
  id text PRIMARY KEY,
  "browserSecretHash" text NOT NULL,
  code text NOT NULL,
  browser text,
  place text,
  status text NOT NULL DEFAULT 'waiting' CHECK (status IN ('waiting', 'approved', 'denied')),
  "userId" uuid,
  "tokenHash" text,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "decidedAt" timestamptz
);
ALTER TABLE public."WebSignIn" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."WebSignIn" FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public."WebSignIn" TO service_role;

NOTIFY pgrst, 'reload schema';
