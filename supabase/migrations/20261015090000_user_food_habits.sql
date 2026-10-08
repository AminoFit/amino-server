-- The foods a user logs out of habit, for the meal agent (server only): every food they logged in the last p_days (180)
-- with how many meals, the last day and their usual serving, plus their favourites. One read per meal (about 25 ms);
-- the agent sees the ones whose names carry every word of a mention, so "blueberry kefir" finds the Lifeway Lowfat
-- Blueberry Kefir they log rather than any of the catalogue's 18 kefirs (2026-10-08).
-- p_before is the meal's own time: only what was logged before it; p_message_id is the meal itself, never its own habit
-- (an edit, or a replay).
DROP FUNCTION IF EXISTS public.user_food_habits(uuid, integer);
DROP FUNCTION IF EXISTS public.user_food_habits(uuid, integer, timestamptz);
DROP FUNCTION IF EXISTS public.user_food_habits(uuid, integer, timestamptz, integer);
CREATE OR REPLACE FUNCTION public.user_food_habits(p_user_id uuid, p_days integer DEFAULT 180, p_before timestamptz DEFAULT now(),
  p_message_id integer DEFAULT NULL)
RETURNS TABLE("foodId" integer, name text, brand text, "timesLogged" integer, "timesLast30Days" integer, "lastLoggedOn" date,
  favorite boolean,
  "usualServingId" integer, "usualAmount" double precision, "usualUnit" text)
LANGUAGE sql STABLE SET search_path TO ''
AS $function$
  WITH logged AS (
    SELECT l.id, l."foodItemId" AS food_id, l."messageId", l."servingId", l."servingAmount", l."loggedUnit", l."consumedOn"
    FROM public."LoggedFoodItem" l
    WHERE l."userId" = p_user_id AND l."deletedAt" IS NULL AND l."foodItemId" IS NOT NULL AND l.grams > 0
      AND l."consumedOn" < coalesce(p_before, now()) AND l."messageId" IS DISTINCT FROM p_message_id
      AND l."consumedOn" > coalesce(p_before, now()) - pg_catalog.make_interval(days => least(greatest(coalesce(p_days, 180), 1), 730))),
  totals AS (
    SELECT food_id, count(DISTINCT "messageId")::integer AS times,
      count(DISTINCT "messageId") FILTER (WHERE "consumedOn" > coalesce(p_before, now()) - interval '30 days')::integer AS recent,
      max("consumedOn")::date AS last FROM logged GROUP BY food_id),
  usual AS (
    SELECT DISTINCT ON (food_id) food_id, "servingId", "servingAmount", "loggedUnit"
    FROM (SELECT g.*, count(*) OVER (PARTITION BY food_id, "servingId", "servingAmount", "loggedUnit") AS n FROM logged g) x
    ORDER BY food_id, n DESC, "consumedOn" DESC, id DESC),
  favs AS (SELECT DISTINCT "foodItemId" AS food_id FROM public."UserFavoriteFoodItem" WHERE "userId" = p_user_id),
  ids AS (SELECT food_id FROM totals UNION SELECT food_id FROM favs)
  SELECT f.id, f.name, f.brand, coalesce(t.times, 0), coalesce(t.recent, 0), t.last, fv.food_id IS NOT NULL,
    u."servingId", u."servingAmount"::double precision, u."loggedUnit"
  FROM ids JOIN public."FoodItem" f ON f.id = ids.food_id
  LEFT JOIN totals t ON t.food_id = f.id LEFT JOIN usual u ON u.food_id = f.id LEFT JOIN favs fv ON fv.food_id = f.id
  WHERE f."archivedAt" IS NULL AND public.food_visible(p_user_id, f."privateToUserId", f."lineageId")
  ORDER BY fv.food_id IS NOT NULL DESC, coalesce(t.times, 0) DESC, t.last DESC NULLS LAST, f.id
  LIMIT 500;
$function$;

-- Anyone's history by user id: the server only, never the app's or an agent's token.
REVOKE ALL ON FUNCTION public.user_food_habits(uuid, integer, timestamptz, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.user_food_habits(uuid, integer, timestamptz, integer) TO service_role;
