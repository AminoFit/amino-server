-- MCP access (2026-10-02): agents a user connects through OAuth (Supabase Auth's OAuth 2.1 server) read the user's
-- meals, daily totals, goals and body stats at /api/mcp. The read functions run as the caller (the OAuth access token
-- is an ordinary `authenticated` session), so the existing row-level security decides what they can see.
SET TimeZone = 'UTC';

-- 1. The sync feed: one row per meal, moved forward whenever the meal or any of its foods changes. A client keeps a
-- cursor of (changedAt, messageId) and asks for what changed after it. A deleted meal keeps its row (the message is
-- soft-deleted), so deletions reach every client. Written only by the triggers below.
CREATE TABLE IF NOT EXISTS public."MealChange" (
  "messageId" integer PRIMARY KEY REFERENCES public."Message"(id) ON DELETE CASCADE,
  "userId" uuid NOT NULL,
  "changedAt" timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public."MealChange" IS 'When each meal (or one of its foods) last changed; the MCP sync feed reads it.';
CREATE INDEX IF NOT EXISTS "MealChange_feed_idx" ON public."MealChange"("userId", "changedAt", "messageId");
ALTER TABLE public."MealChange" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."MealChange" FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public."MealChange" TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public."MealChange" TO service_role;
DROP POLICY IF EXISTS "Read your own meal changes" ON public."MealChange";
CREATE POLICY "Read your own meal changes" ON public."MealChange" FOR SELECT TO authenticated
  USING (auth.uid() = "userId");

-- The triggers run as the owner: the app and the meal worker write meals under their own roles, and neither may
-- write MealChange directly. They never touch Message itself, so the operation-protocol guards are unaffected.
CREATE OR REPLACE FUNCTION public.record_meal_change() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $function$
BEGIN
  IF NEW.role = 'User' THEN
    INSERT INTO public."MealChange"("messageId", "userId", "changedAt") VALUES (NEW.id, NEW."userId", now())
    ON CONFLICT ("messageId") DO UPDATE SET "changedAt" = now(), "userId" = excluded."userId";
  END IF;
  RETURN NULL;
END;
$function$;

CREATE OR REPLACE FUNCTION public.record_meal_food_change() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $function$
DECLARE
  meal_ids integer[] := '{}';
BEGIN
  IF TG_OP IN ('UPDATE', 'DELETE') THEN meal_ids := meal_ids || OLD."messageId"; END IF;
  IF TG_OP IN ('INSERT', 'UPDATE') THEN meal_ids := meal_ids || NEW."messageId"; END IF;
  INSERT INTO public."MealChange"("messageId", "userId", "changedAt")
    SELECT m.id, m."userId", now() FROM public."Message" m WHERE m.id = ANY(meal_ids) AND m.role = 'User'
  ON CONFLICT ("messageId") DO UPDATE SET "changedAt" = now();
  RETURN NULL;
END;
$function$;
REVOKE ALL ON FUNCTION public.record_meal_change(), public.record_meal_food_change() FROM PUBLIC, anon, authenticated;

-- Only the columns a client shows; progress and operation bookkeeping change many times per meal.
DROP TRIGGER IF EXISTS record_meal_change ON public."Message";
CREATE TRIGGER record_meal_change
  AFTER INSERT OR UPDATE OF content, "consumedOn", "deletedAt", status, "resolvedAt", hasimages, "isAudio", "userId"
  ON public."Message" FOR EACH ROW EXECUTE FUNCTION public.record_meal_change();
DROP TRIGGER IF EXISTS record_meal_food_change ON public."LoggedFoodItem";
CREATE TRIGGER record_meal_food_change AFTER INSERT OR UPDATE OR DELETE ON public."LoggedFoodItem"
  FOR EACH ROW EXECUTE FUNCTION public.record_meal_food_change();

-- Existing meals start at their latest known change (never in the future).
INSERT INTO public."MealChange"("messageId", "userId", "changedAt")
SELECT m.id, m."userId", least(now(), greatest(m."createdAt"::timestamptz, m."resolvedAt"::timestamptz,
    m."deletedAt"::timestamptz, foods.at))
FROM public."Message" m
LEFT JOIN LATERAL (SELECT max(l."updatedAt")::timestamptz AS at FROM public."LoggedFoodItem" l
  WHERE l."messageId" = m.id) foods ON true
WHERE m.role = 'User'
ON CONFLICT ("messageId") DO NOTHING;

-- 2. Reading meals. A meal is a user message that asked to log food (or, for old chat-era messages, has foods).
-- Times are stored as UTC without a zone; days are the user's current profile timezone.
CREATE OR REPLACE FUNCTION public.mcp_user_timezone() RETURNS text
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = '' AS $function$
  SELECT coalesce((SELECT u."tzIdentifier" FROM public."User" u WHERE u.id = auth.uid()
    AND EXISTS (SELECT 1 FROM pg_catalog.pg_timezone_names z WHERE z.name = u."tzIdentifier")), 'UTC');
$function$;

CREATE OR REPLACE FUNCTION public.mcp_is_meal(m public."Message") RETURNS boolean
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = '' AS $function$
  SELECT m.role = 'User' AND (m."messageType" = 'FOOD_LOG_REQUEST'
    OR EXISTS (SELECT 1 FROM public."LoggedFoodItem" l WHERE l."messageId" = m.id));
$function$;

-- One meal as JSON. `p_all` returns every nutrient; otherwise the core ones (energy, macros, fibre, sugar, sodium).
-- Nulls are left out, and values are rounded to two decimals.
CREATE OR REPLACE FUNCTION public.mcp_meal_json(m public."Message", p_tz text, p_all boolean) RETURNS jsonb
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = '' AS $function$
  WITH keys AS (
    SELECT key, ord FROM unnest(CASE WHEN p_all THEN ARRAY['kcal', 'proteinG', 'carbG', 'totalFatG', 'satFatG',
      'transFatG', 'unsatFatG', 'polyunsatFatG', 'monounsatFatG', 'fiberG', 'sugarG', 'addedSugarG', 'waterMl',
      'vitaminAMcg', 'vitaminCMg', 'vitaminDMcg', 'vitaminEMg', 'vitaminKMcg', 'vitaminB1Mg', 'vitaminB2Mg',
      'vitaminB3Mg', 'vitaminB5Mg', 'vitaminB6Mg', 'vitaminB7Mcg', 'vitaminB9Mcg', 'vitaminB12Mcg', 'calciumMg',
      'ironMg', 'magnesiumMg', 'phosphorusMg', 'potassiumMg', 'sodiumMg', 'zincMg', 'copperMg', 'manganeseMg',
      'seleniumMcg', 'iodineMcg', 'cholesterolMg', 'omega3Mg', 'omega6Mg', 'caffeineMg', 'alcoholG']
      ELSE ARRAY['kcal', 'proteinG', 'carbG', 'totalFatG', 'satFatG', 'fiberG', 'sugarG', 'sodiumMg'] END)
      WITH ORDINALITY AS k(key, ord)
  ), foods AS (
    SELECT l.id, f.name, f.brand, l."servingAmount" AS amount, coalesce(l."loggedUnit", s."servingName") AS unit,
      l.grams, to_jsonb(l) AS row
    FROM public."LoggedFoodItem" l
    LEFT JOIN public."FoodItem" f ON f.id = l."foodItemId"
    LEFT JOIN public."Serving" s ON s.id = l."servingId"
    WHERE l."messageId" = m.id AND l."deletedAt" IS NULL
  ), eaten AS (
    SELECT coalesce(m."consumedOn", m."createdAt")::timestamp AS utc
  )
  SELECT jsonb_strip_nulls(jsonb_build_object(
    'id', m.id,
    'eatenAt', to_char(e.utc, 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
    'localDate', to_char((e.utc AT TIME ZONE 'UTC') AT TIME ZONE p_tz, 'YYYY-MM-DD'),
    'localTime', to_char((e.utc AT TIME ZONE 'UTC') AT TIME ZONE p_tz, 'HH24:MI'),
    'text', nullif(btrim(m.content), ''),
    'input', CASE WHEN m.hasimages THEN CASE WHEN btrim(coalesce(m.content, '')) <> '' THEN 'photo+text' ELSE 'photo' END
      WHEN m."isAudio" THEN 'voice' ELSE 'text' END,
    'status', CASE m.status::text WHEN 'RESOLVED' THEN 'logged' WHEN 'FAILED' THEN 'failed' ELSE 'processing' END,
    'totals', (SELECT jsonb_object_agg(t.key, t.total ORDER BY t.ord) FROM (
        SELECT k.key, k.ord, pg_catalog.trim_scale(round(sum((f.row->>k.key)::numeric), 2)) AS total
        FROM keys k CROSS JOIN foods f GROUP BY k.key, k.ord) t WHERE t.total IS NOT NULL),
    'items', coalesce((SELECT jsonb_agg(jsonb_strip_nulls(jsonb_build_object('id', f.id, 'food', f.name,
        'brand', f.brand, 'amount', f.amount, 'unit', f.unit, 'grams', pg_catalog.trim_scale(round(f.grams::numeric, 1))))
        || coalesce((SELECT jsonb_object_agg(k.key, pg_catalog.trim_scale(round((f.row->>k.key)::numeric, 2))
          ORDER BY k.ord) FROM keys k WHERE f.row->>k.key IS NOT NULL), '{}'::jsonb)
      ORDER BY f.id) FROM foods f), '[]'::jsonb)))
  FROM eaten e;
$function$;

-- Meals eaten on local days p_from..p_to (inclusive), in eating order, after the (eatenAt, id) cursor. Returns one row
-- more than the page so the caller knows whether another page follows.
CREATE OR REPLACE FUNCTION public.mcp_list_meals(p_from date, p_to date, p_after_eaten timestamp DEFAULT NULL,
  p_after_id integer DEFAULT NULL, p_limit integer DEFAULT 50, p_all boolean DEFAULT false)
RETURNS TABLE(eaten text, id integer, meal jsonb)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = '' AS $function$
  WITH tz AS (SELECT public.mcp_user_timezone() AS name),
  bounds AS (SELECT tz.name, (p_from::timestamp AT TIME ZONE tz.name) AT TIME ZONE 'UTC' AS lo,
    ((p_to + 1)::timestamp AT TIME ZONE tz.name) AT TIME ZONE 'UTC' AS hi FROM tz),
  page AS (
    SELECT m AS msg, coalesce(m."consumedOn", m."createdAt")::timestamp AS at, m.id
    FROM public."Message" m, bounds b
    WHERE m."userId" = auth.uid() AND m."deletedAt" IS NULL AND public.mcp_is_meal(m)
      AND coalesce(m."consumedOn", m."createdAt") >= b.lo AND coalesce(m."consumedOn", m."createdAt") < b.hi
      AND (p_after_eaten IS NULL OR (coalesce(m."consumedOn", m."createdAt")::timestamp, m.id) > (p_after_eaten, p_after_id))
    ORDER BY 2, 3 LIMIT least(greatest(p_limit, 1), 100) + 1)
  SELECT p.at::text, p.id, public.mcp_meal_json(p.msg, b.name, p_all) FROM page p, bounds b ORDER BY p.at, p.id;
$function$;

CREATE OR REPLACE FUNCTION public.mcp_get_meals(p_ids integer[]) RETURNS SETOF jsonb
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = '' AS $function$
  SELECT public.mcp_meal_json(m, public.mcp_user_timezone(), true) FROM public."Message" m
  WHERE m.id = ANY(p_ids[1:50]) AND m."userId" = auth.uid() AND m."deletedAt" IS NULL AND public.mcp_is_meal(m)
  ORDER BY m.id;
$function$;

-- Totals per local day (days with no meals are left out), at most 366 days.
CREATE OR REPLACE FUNCTION public.mcp_daily_summary(p_from date, p_to date) RETURNS jsonb
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = '' AS $function$
  WITH tz AS (SELECT public.mcp_user_timezone() AS name),
  bounds AS (SELECT tz.name, (p_from::timestamp AT TIME ZONE tz.name) AT TIME ZONE 'UTC' AS lo,
    ((least(p_to, p_from + 365) + 1)::timestamp AT TIME ZONE tz.name) AT TIME ZONE 'UTC' AS hi FROM tz),
  meals AS (
    SELECT m.id, ((coalesce(m."consumedOn", m."createdAt")::timestamp AT TIME ZONE 'UTC') AT TIME ZONE b.name)::date AS day
    FROM public."Message" m, bounds b
    WHERE m."userId" = auth.uid() AND m."deletedAt" IS NULL AND public.mcp_is_meal(m)
      AND coalesce(m."consumedOn", m."createdAt") >= b.lo AND coalesce(m."consumedOn", m."createdAt") < b.hi),
  days AS (
    SELECT meals.day, count(DISTINCT meals.id) AS meals, sum(l.kcal) AS kcal, sum(l."proteinG") AS protein,
      sum(l."carbG") AS carb, sum(l."totalFatG") AS fat, sum(l."satFatG") AS sat_fat, sum(l."fiberG") AS fiber,
      sum(l."sugarG") AS sugar, sum(l."sodiumMg") AS sodium, sum(l."alcoholG") AS alcohol,
      sum(l."caffeineMg") AS caffeine, sum(l."waterMl") AS water
    FROM meals LEFT JOIN public."LoggedFoodItem" l ON l."messageId" = meals.id AND l."deletedAt" IS NULL
    GROUP BY meals.day)
  SELECT jsonb_build_object('timezone', (SELECT name FROM tz), 'days', coalesce(jsonb_agg(jsonb_strip_nulls(
    jsonb_build_object('date', d.day, 'meals', d.meals,
      'kcal', pg_catalog.trim_scale(round(d.kcal::numeric, 1)),
      'proteinG', pg_catalog.trim_scale(round(d.protein::numeric, 1)),
      'carbG', pg_catalog.trim_scale(round(d.carb::numeric, 1)),
      'totalFatG', pg_catalog.trim_scale(round(d.fat::numeric, 1)),
      'satFatG', pg_catalog.trim_scale(round(d.sat_fat::numeric, 1)),
      'fiberG', pg_catalog.trim_scale(round(d.fiber::numeric, 1)),
      'sugarG', pg_catalog.trim_scale(round(d.sugar::numeric, 1)),
      'sodiumMg', pg_catalog.trim_scale(round(d.sodium::numeric, 0)),
      'alcoholG', pg_catalog.trim_scale(round(d.alcohol::numeric, 1)),
      'caffeineMg', pg_catalog.trim_scale(round(d.caffeine::numeric, 0)),
      'waterMl', pg_catalog.trim_scale(round(d.water::numeric, 0)))) ORDER BY d.day), '[]'::jsonb))
  FROM days d;
$function$;

-- Meals changed after the (changedAt, id) cursor, oldest change first. Changes from the last 15 seconds are held
-- back: a change is stamped when its transaction starts, so a later cursor must never pass a change still committing.
-- A deleted meal comes back as {id, deleted: true}.
CREATE OR REPLACE FUNCTION public.mcp_meal_changes(p_after_at timestamptz DEFAULT NULL, p_after_id integer DEFAULT NULL,
  p_limit integer DEFAULT 50, p_all boolean DEFAULT false)
RETURNS TABLE("changedAt" text, id integer, meal jsonb)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = '' AS $function$
  WITH tz AS (SELECT public.mcp_user_timezone() AS name),
  page AS (
    SELECT c."changedAt", c."messageId", m AS msg, m."deletedAt"
    FROM public."MealChange" c JOIN public."Message" m ON m.id = c."messageId"
    WHERE c."userId" = auth.uid() AND c."changedAt" < now() - interval '15 seconds'
      AND (p_after_at IS NULL OR (c."changedAt", c."messageId") > (p_after_at, p_after_id))
      AND public.mcp_is_meal(m)
    ORDER BY c."changedAt", c."messageId" LIMIT least(greatest(p_limit, 1), 100) + 1)
  SELECT p."changedAt"::text, p."messageId",
    CASE WHEN p."deletedAt" IS NOT NULL THEN jsonb_build_object('id', p."messageId", 'deleted', true)
      ELSE public.mcp_meal_json(p.msg, tz.name, p_all) END
  FROM page p, tz ORDER BY p."changedAt", p."messageId";
$function$;

REVOKE ALL ON FUNCTION public.mcp_user_timezone(), public.mcp_is_meal(public."Message"),
  public.mcp_meal_json(public."Message", text, boolean),
  public.mcp_list_meals(date, date, timestamp, integer, integer, boolean), public.mcp_get_meals(integer[]),
  public.mcp_daily_summary(date, date), public.mcp_meal_changes(timestamptz, integer, integer, boolean)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mcp_user_timezone(), public.mcp_is_meal(public."Message"),
  public.mcp_meal_json(public."Message", text, boolean),
  public.mcp_list_meals(date, date, timestamp, integer, integer, boolean), public.mcp_get_meals(integer[]),
  public.mcp_daily_summary(date, date), public.mcp_meal_changes(timestamptz, integer, integer, boolean)
  TO authenticated, service_role;

-- 3. One row per MCP tool call: who (user and OAuth client), which tool, whether it worked, rows and time. Also the
-- per-user rate limit. Kept 60 days (prune_mcp_requests, from the outbox cron).
CREATE TABLE IF NOT EXISTS public."McpRequest" (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  "userId" uuid NOT NULL,
  "clientId" text,
  tool text NOT NULL,
  ok boolean NOT NULL,
  "errorCode" text,
  rows integer,
  "durationMs" integer NOT NULL,
  "createdAt" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "McpRequest_userId_createdAt_idx" ON public."McpRequest"("userId", "createdAt" DESC);
CREATE INDEX IF NOT EXISTS "McpRequest_createdAt_idx" ON public."McpRequest"("createdAt" DESC);
ALTER TABLE public."McpRequest" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."McpRequest" FROM PUBLIC, anon, authenticated;
REVOKE ALL ON SEQUENCE public."McpRequest_id_seq" FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, DELETE ON public."McpRequest" TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public."McpRequest_id_seq" TO service_role;

CREATE OR REPLACE FUNCTION public.prune_mcp_requests() RETURNS integer
LANGUAGE sql SECURITY INVOKER SET search_path = '' AS $function$
  WITH gone AS (DELETE FROM public."McpRequest" WHERE id IN (
    SELECT id FROM public."McpRequest" WHERE "createdAt" < now() - interval '60 days' ORDER BY id LIMIT 5000) RETURNING 1)
  SELECT count(*)::integer FROM gone;
$function$;
REVOKE ALL ON FUNCTION public.prune_mcp_requests() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.prune_mcp_requests() TO service_role;

-- 4. Approving a connection from the app: the consent page on the computer shows a QR code, the app approves the
-- authorization with its own session, and the page picks up the client's redirect URL here. The URL's code is only
-- usable with the client's PKCE verifier. Rows live 10 minutes (the code's own lifetime).
CREATE TABLE IF NOT EXISTS public."OAuthConsentHandoff" (
  "authorizationId" text PRIMARY KEY,
  "redirectUrl" text NOT NULL,
  "createdAt" timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public."OAuthConsentHandoff" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."OAuthConsentHandoff" FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public."OAuthConsentHandoff" TO service_role;

-- 5. Kill switch: "off", "all", or a comma-separated list of user IDs.
INSERT INTO public."FeatureFlag"(name, value) VALUES ('mcp_server', 'all') ON CONFLICT (name) DO NOTHING;

NOTIFY pgrst, 'reload schema';
