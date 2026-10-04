-- MCP food search (2026-10-03-mcp-food-search-and-writes-plan.md, phase 1): how often the user logged each food, on
-- which local day last, and their usual amount, so an agent can log "my usual breakfast" with exact foods. Runs as the
-- user (row-level security), on the meal's own time and the user's profile timezone, like the other mcp_* functions.
SET TimeZone = 'UTC';

-- Foods logged on local days p_from..p_to (either null: no bound), or only p_food_ids, most often logged first. A food
-- counts once per meal. The usual amount is the most frequent (serving, amount) the user logged, the latest on a tie.
CREATE OR REPLACE FUNCTION public.mcp_food_history(p_from date DEFAULT NULL, p_to date DEFAULT NULL,
  p_food_ids integer[] DEFAULT NULL, p_limit integer DEFAULT 50)
RETURNS TABLE("foodId" integer, "timesLogged" integer, "lastLoggedOn" date, "usualServingId" integer,
  "usualAmount" float8, "usualUnit" text, "usualGrams" float8)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = '' AS $function$
  WITH tz AS (SELECT public.mcp_user_timezone() AS name),
  logged AS (
    SELECT l.id, l."messageId", l."foodItemId" AS food_id, l."servingId", l."servingAmount", l."loggedUnit", l.grams,
      ((coalesce(m."consumedOn", m."createdAt")::timestamp AT TIME ZONE 'UTC') AT TIME ZONE tz.name)::date AS day
    FROM public."LoggedFoodItem" l
    JOIN public."Message" m ON m.id = l."messageId", tz
    WHERE l."userId" = auth.uid() AND m."userId" = auth.uid() AND l."deletedAt" IS NULL AND m."deletedAt" IS NULL
      AND l."foodItemId" IS NOT NULL AND l.grams > 0
      AND (p_food_ids IS NULL OR l."foodItemId" = ANY(p_food_ids[1:100]))
  ), ranged AS (
    SELECT * FROM logged
    WHERE (p_from IS NULL OR day >= p_from) AND (p_to IS NULL OR day <= p_to)
  ), totals AS (
    SELECT food_id, count(DISTINCT "messageId")::integer AS times, max(day) AS last FROM ranged GROUP BY food_id
  ), usual AS (
    SELECT DISTINCT ON (food_id) food_id, "servingId", "servingAmount", "loggedUnit", grams
    FROM (SELECT r.*, count(*) OVER (PARTITION BY food_id, "servingId", "servingAmount", "loggedUnit") AS n FROM ranged r) x
    ORDER BY food_id, n DESC, day DESC, id DESC
  )
  SELECT t.food_id, t.times, t.last, u."servingId", u."servingAmount", u."loggedUnit", u.grams
  FROM totals t JOIN usual u USING (food_id)
  ORDER BY t.times DESC, t.last DESC, t.food_id
  LIMIT least(greatest(coalesce(p_limit, 50), 1), 100);
$function$;

REVOKE ALL ON FUNCTION public.mcp_food_history(date, date, integer[], integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mcp_food_history(date, date, integer[], integer) TO authenticated, service_role;
