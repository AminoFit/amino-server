-- Admin dashboard sorting (2026-10-01): users by meals and foods logged, foods by how often they are logged, meals by
-- time taken, attempts or calories. The result columns change, so each function is dropped and recreated.

-- Every list returns "total", the number of matching rows (a window count on the same query), for numbered pages.

-- Users with their activity. p_sort: recent (last meal, default), meals_7d, meals_30d, meals, foods_30d, foods,
-- failed, first (first meal, newest first), email.
DROP FUNCTION IF EXISTS public.admin_users(text, integer);
CREATE OR REPLACE FUNCTION public.admin_users(p_query text DEFAULT NULL, p_sort text DEFAULT 'recent', p_limit integer DEFAULT 100,
  p_offset integer DEFAULT 0)
RETURNS TABLE(id uuid, email text, "fullName" text, "tzIdentifier" text, "subscriptionType" text,
  "firstMessageAt" timestamp, "lastMessageAt" timestamp, meals7d bigint, meals30d bigint, "totalMeals" bigint,
  foods30d bigint, "totalFoods" bigint, failed30d bigint, total bigint)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = '' AS $function$
  SELECT u.id, u.email::text, u."fullName"::text, u."tzIdentifier", u."subscriptionType"::text,
    m.first::timestamp, m.last::timestamp, coalesce(m.n7, 0), coalesce(m.n30, 0), coalesce(m.total, 0),
    coalesce(f.n30, 0), coalesce(f.total, 0), coalesce(o.failed, 0), count(*) OVER ()
  FROM public."User" u
  LEFT JOIN LATERAL (SELECT min("createdAt") AS first, max("createdAt") AS last,
      count(*) FILTER (WHERE "createdAt" > now() - interval '7 days') AS n7,
      count(*) FILTER (WHERE "createdAt" > now() - interval '30 days') AS n30, count(*) AS total
    FROM public."Message" WHERE "userId" = u.id AND "deletedAt" IS NULL AND role = 'User') m ON true
  LEFT JOIN LATERAL (SELECT count(*) FILTER (WHERE "consumedOn" > now() - interval '30 days') AS n30, count(*) AS total
    FROM public."LoggedFoodItem" WHERE "userId" = u.id AND "deletedAt" IS NULL) f ON true
  LEFT JOIN LATERAL (SELECT count(*) AS failed FROM public."MealOperation"
    WHERE "userId" = u.id AND state = 'failed' AND "createdAt" > now() - interval '30 days') o ON true
  WHERE p_query IS NULL OR u.email ILIKE '%' || p_query || '%' OR u."fullName" ILIKE '%' || p_query || '%'
    OR u.id::text = p_query
  ORDER BY
    CASE p_sort WHEN 'meals_7d' THEN m.n7 WHEN 'meals_30d' THEN m.n30 WHEN 'meals' THEN m.total
      WHEN 'foods_30d' THEN f.n30 WHEN 'foods' THEN f.total WHEN 'failed' THEN o.failed END DESC NULLS LAST,
    CASE WHEN p_sort = 'first' THEN m.first END DESC NULLS LAST,
    CASE WHEN p_sort = 'email' THEN u.email END ASC,
    m.last DESC NULLS LAST, u.id
  LIMIT least(greatest(p_limit, 1), 500) OFFSET greatest(p_offset, 0);
$function$;

-- Admin food search, now with sorting by usage. p_sort: relevance (with a query) or newest (default), oldest, name,
-- logs (all time), logs_30d, users, last_logged. Usage sorts count every food's logs first (one pass over the log
-- table's food index); the other sorts count only the page's foods.
DROP FUNCTION IF EXISTS public.admin_search_foods(text, text, text, text, integer, integer);
CREATE OR REPLACE FUNCTION public.admin_search_foods(
  p_query text DEFAULT NULL, p_source text DEFAULT NULL, p_filter text DEFAULT NULL,
  p_sort text DEFAULT 'relevance', p_limit integer DEFAULT 50, p_offset integer DEFAULT 0
) RETURNS TABLE(id integer, name text, brand text, "foodInfoSource" text, verified boolean, gtin text,
  "privateToUserId" uuid, "kcalPerServing" double precision, "proteinPerServing" double precision,
  "carbPerServing" double precision, "totalFatPerServing" double precision, "defaultServingWeightGram" double precision,
  "createdAtDateTime" timestamp, icon text, logs bigint, logs30d bigint, users bigint, "lastLogged" timestamp, total bigint)
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = '' AS $function$
DECLARE
  raw text := nullif(trim(coalesce(p_query, '')), '');
  q text := CASE WHEN raw IS NULL THEN '' ELSE public.food_identity_part(raw) END;
  digits text := CASE WHEN raw ~ '^\d{1,14}$' THEN raw END;
  pattern text := '%' || replace(replace(replace(coalesce(raw, ''), '\', '\\'), '%', '\%'), '_', '\_') || '%';
  by_usage boolean := p_sort IN ('logs', 'logs_30d', 'users', 'last_logged');
BEGIN
  IF p_limit NOT BETWEEN 1 AND 200 OR p_offset NOT BETWEEN 0 AND 100000 OR length(coalesce(raw, '')) > 100 THEN
    RAISE EXCEPTION 'Invalid admin food search' USING ERRCODE = '22023';
  END IF;
  PERFORM pg_catalog.set_config('pg_trgm.word_similarity_threshold', '0.4', true);
  RETURN QUERY
  WITH hits AS (
    SELECT f.id, 3::real AS score FROM public."FoodItem" f
      WHERE digits IS NOT NULL AND length(digits) <= 9 AND f.id = digits::integer
    UNION ALL
    SELECT f.id, 3::real FROM public."FoodItem" f
      WHERE digits IS NOT NULL AND length(digits) >= 8 AND f.gtin = public.gtin14(digits)
    UNION ALL
    SELECT f.id, CASE WHEN public.food_identity_part(f.name) = q THEN 2::real
        ELSE extensions.word_similarity(q, public.food_identity_part(f.name)) END
      FROM public."FoodItem" f WHERE q <> '' AND q OPERATOR(extensions.<%) public.food_identity_part(f.name)
    UNION ALL
    SELECT f.id, 0.5::real FROM public."FoodItem" f WHERE raw IS NOT NULL AND f.brand ILIKE pattern
  ), best AS (
    SELECT hits.id, max(hits.score) AS score FROM hits GROUP BY hits.id
  ), everyone AS (
    -- Only computed for a usage sort (the planner skips it otherwise: by_usage is a constant false).
    SELECT l."foodItemId" AS id, count(*) AS logs, count(*) FILTER (WHERE l."consumedOn" > now() - interval '30 days') AS logs30d,
      count(DISTINCT l."userId") AS users, max(l."consumedOn") AS last
    FROM public."LoggedFoodItem" l WHERE by_usage AND l."deletedAt" IS NULL AND l."foodItemId" IS NOT NULL GROUP BY 1
  ), page AS (
    SELECT f.id, f.name, f.brand, f."foodInfoSource"::text AS source, f.verified, f.gtin, f."privateToUserId",
      f."kcalPerServing", f."proteinPerServing", f."carbPerServing", f."totalFatPerServing", f."defaultServingWeightGram",
      f."createdAtDateTime", best.score, everyone.logs AS all_logs, everyone.logs30d AS all_logs30d, everyone.users AS all_users,
      everyone.last AS all_last, count(*) OVER () AS total
    FROM public."FoodItem" f
    LEFT JOIN best ON best.id = f.id
    LEFT JOIN everyone ON everyone.id = f.id
    WHERE (raw IS NULL OR best.id IS NOT NULL)
      AND (p_source IS NULL OR f."foodInfoSource"::text = p_source)
      AND (p_filter IS NULL
        OR p_filter = 'private' AND f."privateToUserId" IS NOT NULL
        OR p_filter = 'shared' AND f."privateToUserId" IS NULL
        OR p_filter = 'unverified' AND NOT f.verified
        OR p_filter = 'gtin' AND f.gtin IS NOT NULL
        OR p_filter = 'no_icon' AND NOT EXISTS (SELECT 1 FROM public."FoodItemImages" i WHERE i."foodItemId" = f.id)
        OR p_filter = 'reported' AND EXISTS (SELECT 1 FROM public."userSubmittedBug" b WHERE b.food_item_id = f.id)
        OR p_filter = 'conflicts' AND EXISTS (SELECT 1 FROM public."FoodItemConflict" c WHERE c."foodItemId" = f.id))
    ORDER BY
      CASE WHEN p_sort = 'relevance' AND raw IS NOT NULL THEN best.score END DESC NULLS LAST,
      CASE p_sort WHEN 'logs' THEN everyone.logs WHEN 'logs_30d' THEN everyone.logs30d WHEN 'users' THEN everyone.users END DESC NULLS LAST,
      CASE WHEN p_sort = 'last_logged' THEN everyone.last END DESC NULLS LAST,
      CASE WHEN p_sort IN ('newest', 'relevance') THEN f."createdAtDateTime" END DESC,
      CASE WHEN p_sort = 'oldest' THEN f."createdAtDateTime" END ASC,
      CASE WHEN p_sort = 'name' THEN f.name END ASC,
      f.id DESC
    LIMIT p_limit OFFSET p_offset
  )
  SELECT page.id, page.name, page.brand, page.source, page.verified, page.gtin, page."privateToUserId",
    page."kcalPerServing", page."proteinPerServing", page."carbPerServing", page."totalFatPerServing",
    page."defaultServingWeightGram", page."createdAtDateTime"::timestamp,
    (SELECT img."pathToImage" FROM public."FoodItemImages" link JOIN public."FoodImage" img ON img.id = link."foodImageId"
      WHERE link."foodItemId" = page.id ORDER BY img.downvotes, img.id DESC LIMIT 1),
    coalesce(page.all_logs, usage.logs, 0), coalesce(page.all_logs30d, usage.logs30d, 0), coalesce(page.all_users, usage.users, 0),
    coalesce(page.all_last, usage.last)::timestamp, page.total
  FROM page
  LEFT JOIN LATERAL (SELECT count(*) AS logs, count(*) FILTER (WHERE l."consumedOn" > now() - interval '30 days') AS logs30d,
      count(DISTINCT l."userId") AS users, max(l."consumedOn") AS last
    FROM public."LoggedFoodItem" l WHERE NOT by_usage AND l."foodItemId" = page.id AND l."deletedAt" IS NULL) usage ON true
  ORDER BY
    CASE WHEN p_sort = 'relevance' AND raw IS NOT NULL THEN page.score END DESC NULLS LAST,
    CASE p_sort WHEN 'logs' THEN page.all_logs WHEN 'logs_30d' THEN page.all_logs30d WHEN 'users' THEN page.all_users END DESC NULLS LAST,
    CASE WHEN p_sort = 'last_logged' THEN page.all_last END DESC NULLS LAST,
    CASE WHEN p_sort IN ('newest', 'relevance') THEN page."createdAtDateTime" END DESC,
    CASE WHEN p_sort = 'oldest' THEN page."createdAtDateTime" END ASC,
    CASE WHEN p_sort = 'name' THEN page.name END ASC,
    page.id DESC;
END;
$function$;

-- The meal list, now sortable and in two stages: the page of message IDs is chosen first (with only the operation
-- columns that filter or sort), then just those rows get their photos and foods. p_sort: newest (default), slowest,
-- attempts, kcal, items.
DROP FUNCTION IF EXISTS public.admin_meals(uuid, text, text, text, text, timestamptz, timestamptz, text, text, integer, integer);
CREATE OR REPLACE FUNCTION public.admin_meals(
  p_user_id uuid DEFAULT NULL, p_kind text DEFAULT NULL, p_state text DEFAULT NULL, p_route text DEFAULT NULL,
  p_query text DEFAULT NULL, p_from timestamptz DEFAULT NULL, p_to timestamptz DEFAULT NULL,
  p_date_field text DEFAULT 'created', p_deleted text DEFAULT 'hide', p_sort text DEFAULT 'newest',
  p_limit integer DEFAULT 50, p_offset integer DEFAULT 0
) RETURNS TABLE(id integer, "userId" uuid, email text, content text, "createdAt" timestamp, "consumedOn" timestamp,
  "resolvedAt" timestamp, "deletedAt" timestamp, status text, "hasImages" boolean, "isAudio" boolean,
  "opId" uuid, "opAction" text, "opState" text, route text, attempts integer, "errorCode" text, "durationMs" double precision,
  operations bigint, edits bigint, photos bigint, foods jsonb, kcal double precision, "itemCount" bigint, total bigint)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = '' AS $function$
  WITH chosen AS (
    SELECT m.id, op.id AS op_id, op.action, op.state, op.route, op.attempts, op."errorCode", op.ms, ops.n, ops.edits,
      CASE WHEN p_date_field = 'consumed' THEN m."consumedOn" ELSE m."createdAt" END AS at_time, count(*) OVER () AS total,
      CASE WHEN p_sort IN ('kcal', 'items') THEN (SELECT CASE WHEN p_sort = 'kcal' THEN sum(l.kcal) ELSE count(*) END
        FROM public."LoggedFoodItem" l WHERE l."messageId" = m.id AND l."deletedAt" IS NULL) END AS size
    FROM public."Message" m
    LEFT JOIN LATERAL (SELECT o.id, o.action, o.state, o.attempts, o."errorCode", o.plan->'model'->>'id' AS route,
        extract(epoch FROM o."completedAt" - o."createdAt") * 1000 AS ms
      FROM public."MealOperation" o WHERE o."messageId" = m.id AND o.action IN ('create', 'replace')
      ORDER BY o.generation DESC LIMIT 1) op ON true
    LEFT JOIN LATERAL (SELECT count(*) AS n, count(*) FILTER (WHERE o.action <> 'create') AS edits
      FROM public."MealOperation" o WHERE o."messageId" = m.id) ops ON true
    WHERE m.role = 'User'
      AND (p_user_id IS NULL OR m."userId" = p_user_id)
      AND (p_deleted = 'all' OR p_deleted = 'only' AND m."deletedAt" IS NOT NULL OR p_deleted = 'hide' AND m."deletedAt" IS NULL)
      AND (p_query IS NULL OR m.content ILIKE '%' || p_query || '%' OR m.id::text = p_query)
      AND (p_from IS NULL OR CASE WHEN p_date_field = 'consumed' THEN m."consumedOn" ELSE m."createdAt" END >= p_from)
      AND (p_to IS NULL OR CASE WHEN p_date_field = 'consumed' THEN m."consumedOn" ELSE m."createdAt" END < p_to)
      AND (p_kind IS NULL
        OR p_kind = 'photo' AND m.hasimages
        OR p_kind = 'voice' AND m."isAudio" AND NOT m.hasimages
        OR p_kind = 'text' AND NOT m.hasimages AND NOT coalesce(m."isAudio", false))
      AND (p_state IS NULL OR op.state = p_state OR p_state = 'legacy' AND op.id IS NULL
        OR p_state = 'edited' AND ops.edits > 0 OR p_state = 'retried' AND op.attempts > 1)
      AND (p_route IS NULL OR op.route = p_route OR p_route = 'agent' AND op.route LIKE '%/%')
    ORDER BY
      CASE p_sort WHEN 'slowest' THEN op.ms WHEN 'attempts' THEN op.attempts END DESC NULLS LAST,
      size DESC NULLS LAST, at_time DESC, m.id DESC
    LIMIT least(greatest(p_limit, 1), 200) OFFSET greatest(p_offset, 0)
  )
  SELECT m.id, m."userId", u.email::text, m.content, m."createdAt"::timestamp, m."consumedOn"::timestamp,
    m."resolvedAt"::timestamp, m."deletedAt"::timestamp, m.status::text, m.hasimages, m."isAudio",
    c.op_id, c.action, c.state, c.route, c.attempts, c."errorCode", c.ms,
    coalesce(c.n, 0), coalesce(c.edits, 0), coalesce(photos.n, 0), coalesce(items.foods, '[]'::jsonb), items.kcal,
    coalesce(items.n, 0), c.total
  FROM chosen c
  JOIN public."Message" m ON m.id = c.id
  JOIN public."User" u ON u.id = m."userId"
  LEFT JOIN LATERAL (SELECT count(*) AS n FROM public."UserMessageImages" i WHERE i."messageId" = m.id) photos ON true
  LEFT JOIN LATERAL (SELECT jsonb_agg(jsonb_build_object('id', l.id, 'foodId', l."foodItemId", 'name', f.name,
        'brand', f.brand, 'grams', l.grams, 'kcal', l.kcal, 'unit', l."loggedUnit", 'amount', l."servingAmount") ORDER BY l.id) AS foods,
      sum(l.kcal) AS kcal, count(*) AS n
    FROM public."LoggedFoodItem" l LEFT JOIN public."FoodItem" f ON f.id = l."foodItemId"
    WHERE l."messageId" = m.id AND l."deletedAt" IS NULL) items ON true
  ORDER BY
    CASE p_sort WHEN 'slowest' THEN c.ms WHEN 'attempts' THEN c.attempts END DESC NULLS LAST,
    c.size DESC NULLS LAST, c.at_time DESC, m.id DESC;
$function$;

REVOKE ALL ON FUNCTION public.admin_users(text, text, integer, integer),
  public.admin_search_foods(text, text, text, text, integer, integer),
  public.admin_meals(uuid, text, text, text, text, timestamptz, timestamptz, text, text, text, integer, integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_users(text, text, integer, integer),
  public.admin_search_foods(text, text, text, text, integer, integer),
  public.admin_meals(uuid, text, text, text, text, timestamptz, timestamptz, text, text, text, integer, integer)
  TO service_role;
NOTIFY pgrst, 'reload schema';
