-- Admin dashboard (2026-10-01): a record of each meal resolution, the indexes the admin pages (and the app's own
-- log reads) need, and read-only aggregate functions so stats are computed in the database, not in the page.
-- Everything here is service_role only.

-- 1. One row per worker delivery of a meal operation: what the resolver did, with each tool call (input and output,
-- truncated), each model call (tokens and cost) and the stage timeline. Kept 60 days (prune_meal_runs).
CREATE TABLE IF NOT EXISTS public."MealRun" (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  "operationId" uuid NOT NULL REFERENCES public."MealOperation"(id) ON DELETE CASCADE,
  "messageId" integer NOT NULL,
  "userId" uuid NOT NULL,
  action text NOT NULL,
  attempt integer NOT NULL,
  state text NOT NULL,
  "errorCode" text,
  route text,
  "photoCount" integer NOT NULL DEFAULT 0,
  "itemCount" integer,
  "durationMs" integer NOT NULL,
  "modelCalls" integer NOT NULL DEFAULT 0,
  "toolCalls" integer NOT NULL DEFAULT 0,
  "promptTokens" integer NOT NULL DEFAULT 0,
  "completionTokens" integer NOT NULL DEFAULT 0,
  "costUsd" numeric(12,6),
  resolutions jsonb NOT NULL DEFAULT '[]'::jsonb,
  tools jsonb NOT NULL DEFAULT '[]'::jsonb,
  models jsonb NOT NULL DEFAULT '[]'::jsonb,
  "createdAt" timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public."MealRun" IS 'Debug record of each meal operation delivery (tool calls, model usage, timings). Pruned after 60 days.';
CREATE INDEX IF NOT EXISTS "MealRun_operationId_idx" ON public."MealRun"("operationId");
CREATE INDEX IF NOT EXISTS "MealRun_messageId_idx" ON public."MealRun"("messageId");
CREATE INDEX IF NOT EXISTS "MealRun_userId_createdAt_idx" ON public."MealRun"("userId", "createdAt" DESC);
CREATE INDEX IF NOT EXISTS "MealRun_createdAt_idx" ON public."MealRun"("createdAt" DESC);

ALTER TABLE public."MealRun" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."MealRun" FROM PUBLIC, anon, authenticated;
REVOKE ALL ON SEQUENCE public."MealRun_id_seq" FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, DELETE ON public."MealRun" TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public."MealRun_id_seq" TO service_role;

CREATE OR REPLACE FUNCTION public.prune_meal_runs() RETURNS integer
LANGUAGE sql SECURITY INVOKER SET search_path = '' AS $function$
  WITH gone AS (DELETE FROM public."MealRun" WHERE id IN (
    SELECT id FROM public."MealRun" WHERE "createdAt" < now() - interval '60 days' ORDER BY id LIMIT 2000) RETURNING 1)
  SELECT count(*)::integer FROM gone;
$function$;
REVOKE ALL ON FUNCTION public.prune_meal_runs() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.prune_meal_runs() TO service_role;

-- 2. Indexes. A user's messages and logs by time, a meal's items and photos, and time-ordered admin lists.
CREATE INDEX IF NOT EXISTS "Message_userId_createdAt_idx" ON public."Message"("userId", "createdAt" DESC);
CREATE INDEX IF NOT EXISTS "Message_createdAt_idx" ON public."Message"("createdAt" DESC);
CREATE INDEX IF NOT EXISTS "LoggedFoodItem_messageId_idx" ON public."LoggedFoodItem"("messageId");
CREATE INDEX IF NOT EXISTS "LoggedFoodItem_userId_consumedOn_idx" ON public."LoggedFoodItem"("userId", "consumedOn");
CREATE INDEX IF NOT EXISTS "LoggedFoodItem_foodItemId_consumedOn_idx" ON public."LoggedFoodItem"("foodItemId", "consumedOn" DESC);
CREATE INDEX IF NOT EXISTS "UserMessageImages_messageId_idx" ON public."UserMessageImages"("messageId");
CREATE INDEX IF NOT EXISTS "MealOperation_createdAt_idx" ON public."MealOperation"("createdAt" DESC);
CREATE INDEX IF NOT EXISTS "FoodItem_createdAtDateTime_idx" ON public."FoodItem"("createdAtDateTime" DESC);
CREATE INDEX IF NOT EXISTS "CatalogueAuditBackup_row_idx" ON public."CatalogueAuditBackup"("tableName", "rowId");
CREATE INDEX IF NOT EXISTS "CatalogueAuditBackup_mergedInto_idx" ON public."CatalogueAuditBackup"(((before->>'mergedInto')))
  WHERE before ? 'mergedInto';
CREATE INDEX IF NOT EXISTS "userSubmittedBug_created_at_idx" ON public."userSubmittedBug"(created_at DESC);
CREATE INDEX IF NOT EXISTS "userSubmittedBug_message_id_idx" ON public."userSubmittedBug"(message_id) WHERE message_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS "userSubmittedBug_food_item_id_idx" ON public."userSubmittedBug"(food_item_id) WHERE food_item_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS "FoodItemConflict_foodItemId_idx" ON public."FoodItemConflict"("foodItemId");

-- 3. Meal logging stats for a window: every create/replace operation, classified by what the user sent
-- (text, photo, photo+text, voice, barcode) and by the route that resolved it.
CREATE OR REPLACE FUNCTION public.admin_meal_stats(p_from timestamptz, p_to timestamptz, p_user_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path = '' AS $function$
WITH ops AS (
  SELECT o.id, o."messageId", o."userId", o.action, o.state, o.attempts, o."errorCode", o."createdAt",
    o."completedAt",
    CASE WHEN o."completedAt" IS NOT NULL THEN extract(epoch FROM o."completedAt" - o."createdAt") * 1000 END AS ms,
    coalesce(o.plan->'model'->>'id', 'none') AS route,
    CASE WHEN jsonb_typeof(o.plan->'items') = 'array' THEN jsonb_array_length(o.plan->'items') END AS items,
    CASE
      WHEN o.plan->'model'->>'id' = 'barcode' THEN 'barcode'
      WHEN coalesce(jsonb_array_length(CASE WHEN jsonb_typeof(o.input->'attachmentIds') = 'array' THEN o.input->'attachmentIds' END), 0) > 0
        OR o.action = 'replace' AND EXISTS (SELECT 1 FROM public."UserMessageImages" i WHERE i."messageId" = o."messageId")
        THEN CASE WHEN length(trim(coalesce(o.input->>'originalText', ''))) > 0 THEN 'photo+text' ELSE 'photo' END
      WHEN m."isAudio" THEN 'voice'
      ELSE 'text' END AS kind
  FROM public."MealOperation" o
  JOIN public."Message" m ON m.id = o."messageId"
  WHERE o."createdAt" >= p_from AND o."createdAt" < p_to AND o.action IN ('create', 'replace')
    AND (p_user_id IS NULL OR o."userId" = p_user_id)
), runs AS (
  SELECT r."operationId", sum(r."costUsd") AS cost, sum(r."promptTokens" + r."completionTokens") AS tokens
  FROM public."MealRun" r
  WHERE r."createdAt" >= p_from AND r."createdAt" < p_to + interval '1 hour'
    AND (p_user_id IS NULL OR r."userId" = p_user_id)
  GROUP BY r."operationId"
), edits AS (
  -- Meals the user changed afterwards (a later operation on the same message): a proxy for a wrong first answer.
  SELECT DISTINCT e."messageId" FROM public."MealOperation" e
  JOIN ops ON ops."messageId" = e."messageId" AND ops.action = 'create'
  WHERE e.action IN ('replace', 'portion', 'delete') AND e."createdAt" > ops."createdAt"
), joined AS (
  SELECT ops.*, runs.cost, runs.tokens,
    (ops.action = 'create' AND EXISTS (SELECT 1 FROM edits WHERE edits."messageId" = ops."messageId")) AS edited
  FROM ops LEFT JOIN runs ON runs."operationId" = ops.id
), summary AS (
  SELECT count(*) AS n,
    count(*) FILTER (WHERE state = 'succeeded') AS succeeded,
    count(*) FILTER (WHERE state = 'failed') AS failed,
    count(*) FILTER (WHERE state = 'needs_clarification') AS clarified,
    count(*) FILTER (WHERE state IN ('queued', 'running', 'retry_wait')) AS pending,
    count(*) FILTER (WHERE attempts > 1) AS retried,
    count(*) FILTER (WHERE edited) AS edited,
    count(*) FILTER (WHERE action = 'create') AS creates,
    count(DISTINCT "userId") AS users,
    percentile_cont(0.5) WITHIN GROUP (ORDER BY ms) FILTER (WHERE state = 'succeeded') AS p50,
    percentile_cont(0.9) WITHIN GROUP (ORDER BY ms) FILTER (WHERE state = 'succeeded') AS p90,
    percentile_cont(0.95) WITHIN GROUP (ORDER BY ms) FILTER (WHERE state = 'succeeded') AS p95,
    avg(items) FILTER (WHERE state = 'succeeded') AS items,
    sum(cost) AS cost, avg(cost) AS "avgCost", count(cost) AS costed, avg(tokens) AS "avgTokens"
  FROM joined
), grouped AS (
  SELECT 'kind' AS dim, kind AS key, count(*) AS n,
    count(*) FILTER (WHERE state = 'succeeded') AS succeeded, count(*) FILTER (WHERE state = 'failed') AS failed,
    count(*) FILTER (WHERE state = 'needs_clarification') AS clarified, count(*) FILTER (WHERE attempts > 1) AS retried,
    count(*) FILTER (WHERE edited) AS edited, count(*) FILTER (WHERE action = 'create') AS creates,
    percentile_cont(0.5) WITHIN GROUP (ORDER BY ms) FILTER (WHERE state = 'succeeded') AS p50,
    percentile_cont(0.9) WITHIN GROUP (ORDER BY ms) FILTER (WHERE state = 'succeeded') AS p90,
    avg(items) FILTER (WHERE state = 'succeeded') AS items, avg(cost) AS "avgCost"
  FROM joined GROUP BY kind
  UNION ALL
  SELECT 'route', route, count(*),
    count(*) FILTER (WHERE state = 'succeeded'), count(*) FILTER (WHERE state = 'failed'),
    count(*) FILTER (WHERE state = 'needs_clarification'), count(*) FILTER (WHERE attempts > 1),
    count(*) FILTER (WHERE edited), count(*) FILTER (WHERE action = 'create'),
    percentile_cont(0.5) WITHIN GROUP (ORDER BY ms) FILTER (WHERE state = 'succeeded'),
    percentile_cont(0.9) WITHIN GROUP (ORDER BY ms) FILTER (WHERE state = 'succeeded'),
    avg(items) FILTER (WHERE state = 'succeeded'), avg(cost)
  FROM joined GROUP BY route
), daily AS (
  SELECT date_trunc('day', "createdAt")::date AS day, kind, count(*) AS n,
    count(*) FILTER (WHERE state = 'failed') AS failed,
    percentile_cont(0.5) WITHIN GROUP (ORDER BY ms) FILTER (WHERE state = 'succeeded') AS p50
  FROM joined GROUP BY 1, 2
), latency AS (
  -- Seconds to resolve, in buckets, per kind (succeeded only).
  SELECT kind, CASE WHEN ms < 5000 THEN '<5s' WHEN ms < 10000 THEN '5-10s' WHEN ms < 20000 THEN '10-20s'
    WHEN ms < 40000 THEN '20-40s' WHEN ms < 80000 THEN '40-80s' ELSE '80s+' END AS bucket, count(*) AS n
  FROM joined WHERE state = 'succeeded' AND ms IS NOT NULL GROUP BY 1, 2
), errors AS (
  SELECT coalesce("errorCode", state) AS code, count(*) AS n, max("createdAt") AS last
  FROM joined WHERE state IN ('failed', 'retry_wait', 'needs_clarification') OR "errorCode" IS NOT NULL
  GROUP BY 1 ORDER BY 2 DESC LIMIT 20
)
SELECT jsonb_build_object(
  'summary', (SELECT to_jsonb(summary) FROM summary),
  'groups', coalesce((SELECT jsonb_agg(to_jsonb(grouped) ORDER BY dim, n DESC) FROM grouped), '[]'::jsonb),
  'daily', coalesce((SELECT jsonb_agg(to_jsonb(daily) ORDER BY day, kind) FROM daily), '[]'::jsonb),
  'latency', coalesce((SELECT jsonb_agg(to_jsonb(latency)) FROM latency), '[]'::jsonb),
  'errors', coalesce((SELECT jsonb_agg(to_jsonb(errors)) FROM errors), '[]'::jsonb)
);
$function$;

-- Catalogue and usage stats for a window: foods created by source, the most logged foods, active users per day,
-- icon coverage and bug reports.
CREATE OR REPLACE FUNCTION public.admin_catalogue_stats(p_from timestamptz, p_to timestamptz)
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path = '' AS $function$
SELECT jsonb_build_object(
  'totals', (SELECT jsonb_build_object(
      'foods', count(*),
      'private', count(*) FILTER (WHERE "privateToUserId" IS NOT NULL),
      'verified', count(*) FILTER (WHERE verified),
      'withGtin', count(*) FILTER (WHERE gtin IS NOT NULL),
      'withoutIcon', count(*) FILTER (WHERE NOT EXISTS (SELECT 1 FROM public."FoodItemImages" i WHERE i."foodItemId" = f.id)))
    FROM public."FoodItem" f),
  'bySource', (SELECT coalesce(jsonb_agg(jsonb_build_object('source', source, 'n', n, 'created', created) ORDER BY n DESC), '[]'::jsonb)
    FROM (SELECT "foodInfoSource"::text AS source, count(*) AS n,
      count(*) FILTER (WHERE "createdAtDateTime" >= p_from AND "createdAtDateTime" < p_to) AS created
      FROM public."FoodItem" GROUP BY 1) s),
  'createdDaily', (SELECT coalesce(jsonb_agg(jsonb_build_object('day', day, 'source', source, 'n', n) ORDER BY day), '[]'::jsonb)
    FROM (SELECT date_trunc('day', "createdAtDateTime")::date AS day, "foodInfoSource"::text AS source, count(*) AS n
      FROM public."FoodItem" WHERE "createdAtDateTime" >= p_from AND "createdAtDateTime" < p_to GROUP BY 1, 2) d),
  'topFoods', (SELECT coalesce(jsonb_agg(jsonb_build_object('id', t."foodItemId", 'name', f.name, 'brand', f.brand,
      'logs', t.logs, 'users', t.users) ORDER BY t.logs DESC), '[]'::jsonb)
    FROM (SELECT "foodItemId", count(*) AS logs, count(DISTINCT "userId") AS users FROM public."LoggedFoodItem"
      WHERE "consumedOn" >= p_from AND "consumedOn" < p_to AND "deletedAt" IS NULL AND "foodItemId" IS NOT NULL
      GROUP BY 1 ORDER BY 2 DESC LIMIT 25) t JOIN public."FoodItem" f ON f.id = t."foodItemId"),
  'activeDaily', (SELECT coalesce(jsonb_agg(jsonb_build_object('day', day, 'users', users, 'meals', meals) ORDER BY day), '[]'::jsonb)
    FROM (SELECT date_trunc('day', "createdAt")::date AS day, count(DISTINCT "userId") AS users, count(*) AS meals
      FROM public."Message" WHERE "createdAt" >= p_from AND "createdAt" < p_to AND "deletedAt" IS NULL GROUP BY 1) a),
  'bugs', (SELECT coalesce(jsonb_agg(jsonb_build_object('type', bug_type, 'n', n)), '[]'::jsonb)
    FROM (SELECT bug_type::text, count(*) AS n FROM public."userSubmittedBug"
      WHERE created_at >= p_from AND created_at < p_to GROUP BY 1) b)
);
$function$;

-- The overview: what needs attention now.
CREATE OR REPLACE FUNCTION public.admin_overview() RETURNS jsonb
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = '' AS $function$
SELECT jsonb_build_object(
  'last24h', (SELECT jsonb_build_object('n', count(*),
      'succeeded', count(*) FILTER (WHERE state = 'succeeded'),
      'failed', count(*) FILTER (WHERE state = 'failed'),
      'clarified', count(*) FILTER (WHERE state = 'needs_clarification'),
      'pending', count(*) FILTER (WHERE state IN ('queued', 'running', 'retry_wait')),
      'p50', percentile_cont(0.5) WITHIN GROUP (ORDER BY extract(epoch FROM "completedAt" - "createdAt") * 1000)
        FILTER (WHERE state = 'succeeded' AND action IN ('create', 'replace')),
      'users', count(DISTINCT "userId"))
    FROM public."MealOperation" WHERE "createdAt" > now() - interval '24 hours'),
  'stuck', (SELECT jsonb_build_object(
      'running', count(*) FILTER (WHERE state = 'running' AND "leaseUntil" < now()),
      'queued', count(*) FILTER (WHERE state = 'queued' AND "createdAt" < now() - interval '2 minutes'),
      'retrying', count(*) FILTER (WHERE state = 'retry_wait'))
    FROM public."MealOperation" WHERE state IN ('running', 'queued', 'retry_wait')),
  'outbox', (SELECT jsonb_build_object('pending', count(*), 'oldest', min("availableAt"))
    FROM public."MealOutbox" WHERE state = 'pending'),
  'processingMessages', (SELECT count(*) FROM public."Message"
    WHERE status = 'PROCESSING' AND "deletedAt" IS NULL AND "createdAt" > now() - interval '7 days'
      AND "createdAt" < now() - interval '5 minutes'),
  'foods24h', (SELECT count(*) FROM public."FoodItem" WHERE "createdAtDateTime" > now() - interval '24 hours'),
  'bugs7d', (SELECT count(*) FROM public."userSubmittedBug" WHERE created_at > now() - interval '7 days'),
  'users7d', (SELECT count(DISTINCT "userId") FROM public."Message" WHERE "createdAt" > now() - interval '7 days'),
  'flags', (SELECT coalesce(jsonb_agg(jsonb_build_object('name', name, 'value', value, 'updatedAt', "updatedAt") ORDER BY name), '[]'::jsonb)
    FROM public."FeatureFlag")
);
$function$;

-- Admin food search: an ID, a barcode or a name (typo tolerant, like the meal agent's search), with filters.
-- Private foods are included (the admin sees every food). Each way of matching is its own indexed lookup (the ID,
-- the barcode, the name trigram index), so a search never computes the name form for the whole catalogue.
-- Returns one page with the best icon and log counts for each food.
CREATE OR REPLACE FUNCTION public.admin_search_foods(
  p_query text DEFAULT NULL, p_source text DEFAULT NULL, p_filter text DEFAULT NULL,
  p_sort text DEFAULT 'relevance', p_limit integer DEFAULT 50, p_offset integer DEFAULT 0
) RETURNS TABLE(id integer, name text, brand text, "foodInfoSource" text, verified boolean, gtin text,
  "privateToUserId" uuid, "kcalPerServing" double precision, "proteinPerServing" double precision,
  "carbPerServing" double precision, "totalFatPerServing" double precision, "defaultServingWeightGram" double precision,
  "createdAtDateTime" timestamp, icon text, logs bigint, users bigint, "lastLogged" timestamp)
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = '' AS $function$
DECLARE
  raw text := nullif(trim(coalesce(p_query, '')), '');
  q text := CASE WHEN raw IS NULL THEN '' ELSE public.food_identity_part(raw) END;
  digits text := CASE WHEN raw ~ '^\d{1,14}$' THEN raw END;
  pattern text := '%' || replace(replace(replace(coalesce(raw, ''), '\', '\\'), '%', '\%'), '_', '\_') || '%';
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
  ), page AS (
    SELECT f.id, f.name, f.brand, f."foodInfoSource"::text AS source, f.verified, f.gtin, f."privateToUserId",
      f."kcalPerServing", f."proteinPerServing", f."carbPerServing", f."totalFatPerServing", f."defaultServingWeightGram",
      f."createdAtDateTime", best.score
    FROM public."FoodItem" f
    LEFT JOIN best ON best.id = f.id
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
    usage.logs, usage.users, usage.last::timestamp
  FROM page
  LEFT JOIN LATERAL (SELECT count(*) AS logs, count(DISTINCT l."userId") AS users, max(l."consumedOn") AS last
    FROM public."LoggedFoodItem" l WHERE l."foodItemId" = page.id AND l."deletedAt" IS NULL) usage ON true
  ORDER BY
    CASE WHEN p_sort = 'relevance' AND raw IS NOT NULL THEN page.score END DESC NULLS LAST,
    CASE WHEN p_sort IN ('newest', 'relevance') THEN page."createdAtDateTime" END DESC,
    CASE WHEN p_sort = 'oldest' THEN page."createdAtDateTime" END ASC,
    CASE WHEN p_sort = 'name' THEN page.name END ASC,
    page.id DESC;
END;
$function$;

-- Users with their activity, most recently active first.
CREATE OR REPLACE FUNCTION public.admin_users(p_query text DEFAULT NULL, p_limit integer DEFAULT 100)
RETURNS TABLE(id uuid, email text, "fullName" text, "tzIdentifier" text, "subscriptionType" text,
  "lastMessageAt" timestamp, meals7d bigint, meals30d bigint, failed30d bigint, "totalMeals" bigint)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = '' AS $function$
  SELECT u.id, u.email::text, u."fullName"::text, u."tzIdentifier", u."subscriptionType"::text,
    m.last::timestamp, coalesce(m.n7, 0), coalesce(m.n30, 0), coalesce(o.failed, 0), coalesce(m.total, 0)
  FROM public."User" u
  LEFT JOIN LATERAL (SELECT max("createdAt") AS last,
      count(*) FILTER (WHERE "createdAt" > now() - interval '7 days') AS n7,
      count(*) FILTER (WHERE "createdAt" > now() - interval '30 days') AS n30, count(*) AS total
    FROM public."Message" WHERE "userId" = u.id AND "deletedAt" IS NULL) m ON true
  LEFT JOIN LATERAL (SELECT count(*) AS failed FROM public."MealOperation"
    WHERE "userId" = u.id AND state = 'failed' AND "createdAt" > now() - interval '30 days') o ON true
  WHERE p_query IS NULL OR u.email ILIKE '%' || p_query || '%' OR u."fullName" ILIKE '%' || p_query || '%'
    OR u.id::text = p_query
  ORDER BY m.last DESC NULLS LAST
  LIMIT least(greatest(p_limit, 1), 500);
$function$;

-- The meal log list: one row per user message with its latest create/replace operation (state, route, latency),
-- how often it was changed afterwards, its photos and the foods it logged. Newest first; every filter is optional.
CREATE OR REPLACE FUNCTION public.admin_meals(
  p_user_id uuid DEFAULT NULL, p_kind text DEFAULT NULL, p_state text DEFAULT NULL, p_route text DEFAULT NULL,
  p_query text DEFAULT NULL, p_from timestamptz DEFAULT NULL, p_to timestamptz DEFAULT NULL,
  p_date_field text DEFAULT 'created', p_deleted text DEFAULT 'hide', p_limit integer DEFAULT 50, p_offset integer DEFAULT 0
) RETURNS TABLE(id integer, "userId" uuid, email text, content text, "createdAt" timestamp, "consumedOn" timestamp,
  "resolvedAt" timestamp, "deletedAt" timestamp, status text, "hasImages" boolean, "isAudio" boolean,
  "opId" uuid, "opAction" text, "opState" text, route text, attempts integer, "errorCode" text, "durationMs" double precision,
  operations bigint, edits bigint, photos bigint, foods jsonb, kcal double precision, "itemCount" bigint)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = '' AS $function$
  SELECT m.id, m."userId", u.email::text, m.content, m."createdAt"::timestamp, m."consumedOn"::timestamp,
    m."resolvedAt"::timestamp, m."deletedAt"::timestamp, m.status::text, m.hasimages, m."isAudio",
    op.id, op.action, op.state, op.route, op.attempts, op."errorCode", op.ms,
    coalesce(ops.n, 0), coalesce(ops.edits, 0), coalesce(photos.n, 0), coalesce(items.foods, '[]'::jsonb), items.kcal,
    coalesce(items.n, 0)
  FROM public."Message" m
  JOIN public."User" u ON u.id = m."userId"
  LEFT JOIN LATERAL (SELECT o.id, o.action, o.state, o.attempts, o."errorCode", o.plan->'model'->>'id' AS route,
      extract(epoch FROM o."completedAt" - o."createdAt") * 1000 AS ms
    FROM public."MealOperation" o WHERE o."messageId" = m.id AND o.action IN ('create', 'replace')
    ORDER BY o.generation DESC LIMIT 1) op ON true
  LEFT JOIN LATERAL (SELECT count(*) AS n, count(*) FILTER (WHERE o.action <> 'create') AS edits
    FROM public."MealOperation" o WHERE o."messageId" = m.id) ops ON true
  LEFT JOIN LATERAL (SELECT count(*) AS n FROM public."UserMessageImages" i WHERE i."messageId" = m.id) photos ON true
  LEFT JOIN LATERAL (SELECT jsonb_agg(jsonb_build_object('id', l.id, 'foodId', l."foodItemId", 'name', f.name,
        'brand', f.brand, 'grams', l.grams, 'kcal', l.kcal, 'unit', l."loggedUnit", 'amount', l."servingAmount") ORDER BY l.id) AS foods,
      sum(l.kcal) AS kcal, count(*) AS n
    FROM public."LoggedFoodItem" l LEFT JOIN public."FoodItem" f ON f.id = l."foodItemId"
    WHERE l."messageId" = m.id AND l."deletedAt" IS NULL) items ON true
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
  ORDER BY CASE WHEN p_date_field = 'consumed' THEN m."consumedOn" ELSE m."createdAt" END DESC, m.id DESC
  LIMIT least(greatest(p_limit, 1), 200) OFFSET greatest(p_offset, 0);
$function$;

-- A food's usage: how often and by how many users it was logged, and when.
CREATE OR REPLACE FUNCTION public.admin_food_usage(p_food_id integer) RETURNS jsonb
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = '' AS $function$
  SELECT jsonb_build_object('logs', count(*), 'users', count(DISTINCT "userId"), 'first', min("consumedOn"),
    'last', max("consumedOn"), 'deleted', (SELECT count(*) FROM public."LoggedFoodItem" d
      WHERE d."foodItemId" = p_food_id AND d."deletedAt" IS NOT NULL),
    'avgGrams', avg(grams), 'last30d', count(*) FILTER (WHERE "consumedOn" > now() - interval '30 days'))
  FROM public."LoggedFoodItem" WHERE "foodItemId" = p_food_id AND "deletedAt" IS NULL;
$function$;

-- Foods nearest to a food by embedding (possible duplicates or variants).
CREATE OR REPLACE FUNCTION public.admin_similar_foods(p_food_id integer, p_limit integer DEFAULT 12)
RETURNS TABLE(id integer, name text, brand text, "foodInfoSource" text, "kcalPerServing" double precision,
  "defaultServingWeightGram" double precision, "privateToUserId" uuid, similarity double precision)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public, extensions AS $function$
  SELECT f.id, f.name, f.brand, f."foodInfoSource"::text, f."kcalPerServing", f."defaultServingWeightGram",
    f."privateToUserId", 1 - (f."bgeBaseEmbedding" <=> t."bgeBaseEmbedding")
  FROM public."FoodItem" t, public."FoodItem" f
  WHERE t.id = p_food_id AND t."bgeBaseEmbedding" IS NOT NULL AND f."bgeBaseEmbedding" IS NOT NULL AND f.id <> t.id
  ORDER BY f."bgeBaseEmbedding" <=> t."bgeBaseEmbedding"
  LIMIT least(greatest(p_limit, 1), 50);
$function$;

REVOKE ALL ON FUNCTION public.admin_meal_stats(timestamptz, timestamptz, uuid), public.admin_catalogue_stats(timestamptz, timestamptz),
  public.admin_overview(), public.admin_search_foods(text, text, text, text, integer, integer), public.admin_users(text, integer),
  public.admin_meals(uuid, text, text, text, text, timestamptz, timestamptz, text, text, integer, integer),
  public.admin_food_usage(integer), public.admin_similar_foods(integer, integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_meal_stats(timestamptz, timestamptz, uuid), public.admin_catalogue_stats(timestamptz, timestamptz),
  public.admin_overview(), public.admin_search_foods(text, text, text, text, integer, integer), public.admin_users(text, integer),
  public.admin_meals(uuid, text, text, text, text, timestamptz, timestamptz, text, text, integer, integer),
  public.admin_food_usage(integer), public.admin_similar_foods(integer, integer)
  TO service_role;
NOTIFY pgrst, 'reload schema';
