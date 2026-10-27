-- The web log's meals say who logged them, as the app's do (amino-mobile common/foodLog/mealCard.ts mealSubline):
-- `agent` (the agent's name, or "an AI agent"), `loggedBy` (the name of the person who logged it for the user, or
-- "someone"; never their user id) and `listsFoods` (an Add Food entry, whose text only lists its foods, so the card
-- shows no words). A logged meal whose foods were all deleted no longer shows as an empty card; one that found no
-- food still does. Everything else is as in 20261003000000_web_dashboard.sql.

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
    SELECT m.id, coalesce(m."consumedOn", m."createdAt") AS at, m.content, m.hasimages, m."isAudio", m.status,
      m."agentClientId", m."agentName", m."loggedByUserId", m."loggedByName", m."listsFoods"
    FROM public."Message" m
    WHERE m."userId" = uid AND m."deletedAt" IS NULL AND m.role = 'User'
      AND coalesce(m."consumedOn", m."createdAt") >= lo AND coalesce(m."consumedOn", m."createdAt") < hi
      AND (EXISTS (SELECT 1 FROM public."LoggedFoodItem" l WHERE l."messageId" = m.id AND l."deletedAt" IS NULL)
        OR (m."messageType" = 'FOOD_LOG_REQUEST'
          AND (m.status::text <> 'RESOLVED' OR NOT EXISTS (SELECT 1 FROM public."LoggedFoodItem" l WHERE l."messageId" = m.id))))),
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
      'agent', CASE WHEN m."agentClientId" IS NOT NULL THEN coalesce(nullif(btrim(m."agentName"), ''), 'an AI agent') END,
      'loggedBy', CASE WHEN m."loggedByUserId" IS NOT NULL OR nullif(btrim(m."loggedByName"), '') IS NOT NULL
        THEN coalesce(nullif(btrim(m."loggedByName"), ''), 'someone') END,
      'listsFoods', CASE WHEN m."listsFoods" THEN true END,
      'photos', p.list,
      'items', coalesce(i.list, '[]'::jsonb))) ORDER BY m.at, m.id), '[]'::jsonb)
  INTO result
  FROM meals m LEFT JOIN items i ON i."messageId" = m.id LEFT JOIN photos p ON p."messageId" = m.id;
  RETURN jsonb_build_object('date', p_date, 'meals', result);
END;
$function$;

REVOKE ALL ON FUNCTION public.web_day(date) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.web_day(date) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
