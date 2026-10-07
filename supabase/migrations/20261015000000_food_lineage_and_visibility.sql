-- People and sharing, phase 0 (2026-10-07, plan: 2026-10-07-people-and-sharing-plan.md): food lineages and one rule
-- for who can see a food. No behaviour changes yet.
--
-- Lineage: editing a private food that past logs or recipes use makes a new row and archives the old one
-- (save_user_food), so a share can't point at a row. Every version of a private food carries the id of its first
-- version in "lineageId". Catalogue foods never get versions (FoodItem_user_food_shape), so they have none.
--
-- Visibility: "catalogue, or mine" was copied into every search and log function. They now all call
-- public.food_visible, the one place sharing will widen (FoodAccess, phase 3). It is plain SQL with no SET clause,
-- so the planner inlines it and the searches keep their plans.

ALTER TABLE public."FoodItem" ADD COLUMN IF NOT EXISTS "lineageId" integer;
ALTER TABLE public."FoodItem" ADD COLUMN IF NOT EXISTS "copiedFromLineageId" integer;
COMMENT ON COLUMN public."FoodItem"."lineageId" IS 'A private food''s first version: shared by all its versions. NULL for catalogue foods.';
COMMENT ON COLUMN public."FoodItem"."copiedFromLineageId" IS 'The lineage this private food was copied from (a copy link or keeping a shared food). Not a foreign key.';

-- Each version points back to the one it replaced; walk to the first.
WITH RECURSIVE chain AS (
  SELECT f.id, f.id AS root FROM public."FoodItem" f
    WHERE f."privateToUserId" IS NOT NULL AND f."previousVersionId" IS NULL
  UNION ALL
  SELECT f.id, c.root FROM public."FoodItem" f JOIN chain c ON f."previousVersionId" = c.id
)
UPDATE public."FoodItem" f SET "lineageId" = c.root FROM chain c WHERE f.id = c.id AND f."lineageId" IS DISTINCT FROM c.root;
-- A private version whose predecessor became catalogue (or is gone) starts its own lineage.
UPDATE public."FoodItem" SET "lineageId" = coalesce("previousVersionId", id)
  WHERE "privateToUserId" IS NOT NULL AND "lineageId" IS NULL;

CREATE OR REPLACE FUNCTION public.set_food_lineage() RETURNS trigger
LANGUAGE plpgsql SET search_path = '' AS $function$
BEGIN
  IF NEW."privateToUserId" IS NULL THEN
    NEW."lineageId" := NULL;
  ELSIF NEW."lineageId" IS NULL THEN
    NEW."lineageId" := coalesce(
      (SELECT p."lineageId" FROM public."FoodItem" p WHERE p.id = NEW."previousVersionId"), NEW."previousVersionId", NEW.id);
  END IF;
  RETURN NEW;
END;
$function$;
REVOKE ALL ON FUNCTION public.set_food_lineage() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS "FoodItem_lineage" ON public."FoodItem";
CREATE TRIGGER "FoodItem_lineage" BEFORE INSERT OR UPDATE OF "privateToUserId", "previousVersionId", "lineageId"
  ON public."FoodItem" FOR EACH ROW EXECUTE FUNCTION public.set_food_lineage();

ALTER TABLE public."FoodItem" DROP CONSTRAINT IF EXISTS "FoodItem_private_lineage";
ALTER TABLE public."FoodItem" ADD CONSTRAINT "FoodItem_private_lineage"
  CHECK (("privateToUserId" IS NULL) = ("lineageId" IS NULL));
CREATE INDEX IF NOT EXISTS "FoodItem_lineageId_idx" ON public."FoodItem"("lineageId") WHERE "lineageId" IS NOT NULL;

-- Who can see a food. Phase 3 adds: OR it was shared with them (FoodAccess by lineage).
CREATE OR REPLACE FUNCTION public.food_visible(p_user_id uuid, p_private_to uuid, p_lineage_id integer) RETURNS boolean
LANGUAGE sql STABLE AS $function$
  SELECT p_private_to IS NULL OR p_private_to = p_user_id
$function$;
COMMENT ON FUNCTION public.food_visible(uuid, uuid, integer) IS
  'The one rule for who can see a food (RLS, searches, logging). Mirrored by src/userFoods/visibility.ts.';
GRANT EXECUTE ON FUNCTION public.food_visible(uuid, uuid, integer) TO authenticated, service_role;

DROP POLICY IF EXISTS "Read shared foods and your own private foods" ON public."FoodItem";
DROP POLICY IF EXISTS "Read foods you can see" ON public."FoodItem";
CREATE POLICY "Read foods you can see" ON public."FoodItem" FOR SELECT
  USING (public.food_visible(auth.uid(), "privateToUserId", "lineageId"));

-- The search and log functions, unchanged except for the visibility rule.

CREATE OR REPLACE FUNCTION public.search_meal_food_catalogue(p_query text, p_limit integer DEFAULT 20, p_offset integer DEFAULT 0,
  p_user_id uuid DEFAULT NULL::uuid, p_include_recipes boolean DEFAULT false, p_threshold real DEFAULT 0.45)
RETURNS TABLE(id integer, name text, brand text, "knownAs" text[])
LANGUAGE plpgsql STABLE SET search_path TO '' AS $function$
DECLARE q text := public.food_identity_part(p_query);
  recipes boolean := p_include_recipes OR public.user_flag_enabled('recipes_in_agent', p_user_id);
  words text[] := ARRAY(SELECT w FROM pg_catalog.unnest(pg_catalog.string_to_array(public.food_identity_part(p_query), ' ')) w
    WHERE length(w) >= 3 ORDER BY length(w) DESC);
  -- Every word that must appear, numbers of any length included ("2" in "fairlife 2").
  needed text[] := ARRAY(SELECT DISTINCT w FROM pg_catalog.unnest(pg_catalog.string_to_array(public.food_identity_part(p_query), ' ')) w
    WHERE length(w) >= 3 OR w ~ '^[0-9]');
BEGIN
  IF p_query IS NULL OR length(trim(p_query)) NOT BETWEEN 1 AND 100 OR
    p_limit NOT BETWEEN 1 AND 50 OR p_offset NOT BETWEEN 0 AND 500 OR q = '' OR p_threshold NOT BETWEEN 0.2 AND 1
  THEN RAISE EXCEPTION 'Invalid food search' USING ERRCODE='22023'; END IF;
  PERFORM pg_catalog.set_config('pg_trgm.word_similarity_threshold', p_threshold::text, true);
  RETURN QUERY
    WITH hits AS (
      SELECT f.id FROM public."FoodItem" f WHERE q OPERATOR(extensions.<%) public.food_identity_part(f.name)
      UNION SELECT f.id FROM public."FoodItem" f WHERE f.brand IS NOT NULL AND public.food_identity_part(f.brand) = q
      UNION SELECT f.id FROM public."FoodItem" f WHERE public.food_identity_parts(f."knownAs") OPERATOR(pg_catalog.@>) ARRAY[q]
      UNION SELECT f.id FROM public."FoodItem" f
        WHERE pg_catalog.cardinality(words) > 0 AND public.food_identity_part(f.name) LIKE '%' || words[1] || '%'
          AND NOT EXISTS (SELECT 1 FROM pg_catalog.unnest(words) w WHERE public.food_identity_part(f.name) NOT LIKE '%' || w || '%')
      -- Words split between brand and name ("fairlife" + "2% ... milk").
      UNION SELECT f.id FROM public."FoodItem" f
        WHERE pg_catalog.cardinality(needed) > 1 AND f.brand IS NOT NULL
          AND NOT EXISTS (SELECT 1 FROM pg_catalog.unnest(needed) w
            WHERE (' ' || public.food_identity_part(f.name) || ' ' || public.food_identity_part(f.brand)) NOT LIKE '% ' || w || '%')),
    found AS (
      SELECT f.id, f.name, f.brand, f."knownAs",
        public.food_identity_part(f.name) AS n, public.food_identity_part(coalesce(f.brand, '')) AS b,
        public.food_identity_parts(f."knownAs") OPERATOR(pg_catalog.@>) ARRAY[q] AS alias
      FROM hits JOIN public."FoodItem" f ON f.id = hits.id
      WHERE public.food_visible(p_user_id, f."privateToUserId", f."lineageId")
        AND f."archivedAt" IS NULL AND (f."recipePortions" IS NULL OR recipes))
    SELECT found.id, found.name, found.brand, found."knownAs" FROM found
    ORDER BY (found.n = q OR found.alias) DESC,
      (pg_catalog.cardinality(needed) > 0 AND NOT EXISTS (SELECT 1 FROM pg_catalog.unnest(needed) w
        WHERE (' ' || found.n || ' ' || found.b) NOT LIKE '% ' || w || '%')) DESC,
      extensions.similarity(q, btrim(found.n || ' ' || found.b)) DESC,
      extensions.word_similarity(q, found.n) DESC, found.id
    LIMIT p_limit OFFSET p_offset;
END;
$function$;


CREATE OR REPLACE FUNCTION public.get_cosine_results(p_embedding_cache_id integer, amount_of_results integer DEFAULT 5,
  p_user_id uuid DEFAULT NULL, p_include_recipes boolean DEFAULT false)
RETURNS TABLE(id integer, name text, brand text, "foodInfoSource" text, "externalId" text, embedding text, cosine_similarity double precision)
LANGUAGE plpgsql STABLE SET search_path = public, extensions AS $function$
BEGIN
  PERFORM pg_catalog.set_config('hnsw.ef_search', '200', true);
  RETURN QUERY
  WITH nearest AS (
    SELECT f.id, f."bgeBaseEmbedding" <=> (SELECT c."bgeBaseEmbedding" FROM "foodEmbeddingCache" c WHERE c.id = p_embedding_cache_id) AS distance
    FROM "FoodItem" f
    ORDER BY f."bgeBaseEmbedding" <=> (SELECT c."bgeBaseEmbedding" FROM "foodEmbeddingCache" c WHERE c.id = p_embedding_cache_id)
    LIMIT greatest(least(amount_of_results, 50) * 4, 60)),
  own AS (
    SELECT f.id, f."bgeBaseEmbedding" <=> (SELECT c."bgeBaseEmbedding" FROM "foodEmbeddingCache" c WHERE c.id = p_embedding_cache_id) AS distance
    FROM "FoodItem" f WHERE p_user_id IS NOT NULL AND f."privateToUserId" = p_user_id AND f."bgeBaseEmbedding" IS NOT NULL)
  SELECT f.id, f.name, f.brand, f."foodInfoSource"::text, f."externalId", NULL::text, 1 - x.distance
  FROM (SELECT * FROM nearest UNION SELECT * FROM own) x JOIN "FoodItem" f ON f.id = x.id
  WHERE x.distance IS NOT NULL AND public.food_visible(p_user_id, f."privateToUserId", f."lineageId") AND f."archivedAt" IS NULL
    AND (f."recipePortions" IS NULL OR p_include_recipes OR public.user_flag_enabled('recipes_in_agent', p_user_id))
  ORDER BY x.distance
  LIMIT least(greatest(amount_of_results, 1), 50);
END;
$function$;
REVOKE ALL ON FUNCTION public.get_cosine_results(integer, integer, uuid, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_cosine_results(integer, integer, uuid, boolean) TO service_role;

CREATE OR REPLACE FUNCTION public.search_food_catalogue_nearest(p_embedding_cache_id integer, p_limit integer DEFAULT 12,
  p_user_id uuid DEFAULT NULL, p_include_recipes boolean DEFAULT false)
RETURNS TABLE(id integer, name text, brand text, "knownAs" text[])
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = '' AS $function$
BEGIN
  PERFORM pg_catalog.set_config('hnsw.ef_search', '200', true);
  RETURN QUERY
  WITH nearest AS (
    SELECT f.id, f."bgeBaseEmbedding" OPERATOR(extensions.<=>)
      (SELECT c."bgeBaseEmbedding" FROM public."foodEmbeddingCache" c WHERE c.id = p_embedding_cache_id) AS distance
    FROM public."FoodItem" f
    ORDER BY f."bgeBaseEmbedding" OPERATOR(extensions.<=>)
      (SELECT c."bgeBaseEmbedding" FROM public."foodEmbeddingCache" c WHERE c.id = p_embedding_cache_id)
    LIMIT greatest(least(p_limit, 30) * 4, 60)),
  own AS (
    SELECT f.id, f."bgeBaseEmbedding" OPERATOR(extensions.<=>)
      (SELECT c."bgeBaseEmbedding" FROM public."foodEmbeddingCache" c WHERE c.id = p_embedding_cache_id) AS distance
    FROM public."FoodItem" f WHERE p_user_id IS NOT NULL AND f."privateToUserId" = p_user_id AND f."bgeBaseEmbedding" IS NOT NULL)
  SELECT f.id, f.name, f.brand, f."knownAs"
  FROM (SELECT * FROM nearest UNION SELECT * FROM own) x JOIN public."FoodItem" f ON f.id = x.id
  WHERE x.distance IS NOT NULL AND public.food_visible(p_user_id, f."privateToUserId", f."lineageId") AND f."archivedAt" IS NULL
    AND (f."recipePortions" IS NULL OR p_include_recipes OR public.user_flag_enabled('recipes_in_agent', p_user_id))
  ORDER BY x.distance
  LIMIT least(greatest(p_limit, 1), 30);
END;
$function$;
REVOKE ALL ON FUNCTION public.search_food_catalogue_nearest(integer, integer, uuid, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.search_food_catalogue_nearest(integer, integer, uuid, boolean) TO service_role;

CREATE OR REPLACE FUNCTION public.log_food_as_meal(p_user_id uuid, p_local_id uuid, p_consumed_on timestamp,
  p_content text, p_item jsonb)
RETURNS TABLE(message_id integer, logged_food_item_id integer, created boolean)
LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $function$
DECLARE meal integer;
  row_id integer;
BEGIN
  IF p_user_id IS NULL OR p_local_id IS NULL OR p_consumed_on IS NULL OR coalesce((p_item->>'grams')::float8, 0) <= 0
  THEN RAISE EXCEPTION 'Invalid meal' USING ERRCODE = '22023'; END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('meal_local:' || p_local_id::text, 0));
  SELECT m.id INTO meal FROM public."Message" m WHERE m.local_id = p_local_id::text AND m."userId" = p_user_id;
  IF meal IS NOT NULL THEN
    RETURN QUERY SELECT meal, (SELECT l.id FROM public."LoggedFoodItem" l WHERE l."messageId" = meal ORDER BY l.id LIMIT 1), false;
    RETURN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public."FoodItem" f WHERE f.id = (p_item->>'foodItemId')::integer AND f."archivedAt" IS NULL
      AND public.food_visible(p_user_id, f."privateToUserId", f."lineageId"))
  THEN RAISE EXCEPTION 'food_unavailable' USING ERRCODE = 'P0002'; END IF;
  INSERT INTO public."Message" (content, role, "messageType", status, "userId", "consumedOn", "createdAt", "resolvedAt",
    "itemsToProcess", "itemsProcessed", hasimages, local_id)
  VALUES (left(coalesce(p_content, ''), 8000), 'User', 'FOOD_LOG_REQUEST', 'RESOLVED', p_user_id, p_consumed_on,
    (now() AT TIME ZONE 'utc'), (now() AT TIME ZONE 'utc'), 1, 1, false, p_local_id::text)
  RETURNING id INTO meal;
  row_id := public.insert_priced_food_row(p_user_id, meal, p_consumed_on, 0, p_local_id, p_item);
  RETURN QUERY SELECT meal, row_id, true;
END;
$function$;
REVOKE ALL ON FUNCTION public.log_food_as_meal(uuid, uuid, timestamp, text, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.log_food_as_meal(uuid, uuid, timestamp, text, jsonb) TO service_role;

CREATE OR REPLACE FUNCTION public.replace_meal_with_food(p_user_id uuid, p_message_id integer,
  p_expected_item_ids integer[], p_item jsonb) RETURNS integer
LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $function$
DECLARE meal public."Message"%ROWTYPE;
  current_ids integer[];
  consumed timestamp;
BEGIN
  SELECT * INTO meal FROM public."Message" m WHERE m.id = p_message_id AND m."userId" = p_user_id AND m."deletedAt" IS NULL
    FOR UPDATE;
  IF meal.id IS NULL THEN RAISE EXCEPTION 'meal_unavailable' USING ERRCODE = 'P0002'; END IF;
  IF meal.status <> 'RESOLVED' OR meal."operationOwned" OR meal."activeOperationId" IS NOT NULL
  THEN RAISE EXCEPTION 'meal_busy' USING ERRCODE = '55000'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public."FoodItem" f WHERE f.id = (p_item->>'foodItemId')::integer AND f."archivedAt" IS NULL
      AND public.food_visible(p_user_id, f."privateToUserId", f."lineageId"))
  THEN RAISE EXCEPTION 'food_unavailable' USING ERRCODE = 'P0002'; END IF;
  SELECT array_agg(l.id ORDER BY l.id), min(l."consumedOn") INTO current_ids, consumed FROM public."LoggedFoodItem" l
    WHERE l."messageId" = p_message_id AND l."deletedAt" IS NULL;
  IF current_ids IS DISTINCT FROM (SELECT array_agg(x ORDER BY x) FROM unnest(p_expected_item_ids) x)
  THEN RAISE EXCEPTION 'meal_changed' USING ERRCODE = '40001'; END IF;
  UPDATE public."LoggedFoodItem" SET "deletedAt" = now() WHERE id = ANY (current_ids);
  UPDATE public."Message" SET "itemsToProcess" = 1, "itemsProcessed" = 1 WHERE id = p_message_id;
  -- The row joins the meal's published revision, so the app's revision check keeps it.
  RETURN public.insert_priced_food_row(p_user_id, p_message_id, coalesce(meal."consumedOn", consumed),
    meal."publishedRevision", NULL, p_item);
END;
$function$;
REVOKE ALL ON FUNCTION public.replace_meal_with_food(uuid, integer, integer[], jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.replace_meal_with_food(uuid, integer, integer[], jsonb) TO service_role;

CREATE OR REPLACE FUNCTION public.log_foods_as_meal(p_user_id uuid, p_local_id uuid, p_consumed_on timestamp,
  p_content text, p_items jsonb)
RETURNS TABLE(message_id integer, logged_food_item_ids integer[], created boolean)
LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $function$
DECLARE meal integer;
  item jsonb;
  item_index integer := 0;
  ids integer[] := '{}';
  item_count integer := coalesce(pg_catalog.jsonb_array_length(p_items), 0);
BEGIN
  IF p_user_id IS NULL OR p_local_id IS NULL OR p_consumed_on IS NULL OR pg_catalog.jsonb_typeof(p_items) <> 'array'
    OR item_count = 0 OR item_count > 50
  THEN RAISE EXCEPTION 'Invalid meal' USING ERRCODE = '22023'; END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('meal_local:' || p_local_id::text, 0));
  SELECT m.id INTO meal FROM public."Message" m WHERE m.local_id = p_local_id::text AND m."userId" = p_user_id;
  IF meal IS NOT NULL THEN
    RETURN QUERY SELECT meal, (SELECT coalesce(array_agg(l.id ORDER BY l.id), '{}') FROM public."LoggedFoodItem" l
      WHERE l."messageId" = meal), false;
    RETURN;
  END IF;
  FOR item IN SELECT value FROM pg_catalog.jsonb_array_elements(p_items) LOOP
    IF coalesce((item->>'grams')::float8, 0) <= 0 THEN RAISE EXCEPTION 'Invalid meal' USING ERRCODE = '22023'; END IF;
    IF NOT EXISTS (SELECT 1 FROM public."FoodItem" f WHERE f.id = (item->>'foodItemId')::integer AND f."archivedAt" IS NULL
        AND public.food_visible(p_user_id, f."privateToUserId", f."lineageId"))
    THEN RAISE EXCEPTION 'food_unavailable' USING ERRCODE = 'P0002'; END IF;
  END LOOP;
  INSERT INTO public."Message" (content, role, "messageType", status, "userId", "consumedOn", "createdAt", "resolvedAt",
    "itemsToProcess", "itemsProcessed", hasimages, local_id)
  VALUES (left(coalesce(p_content, ''), 8000), 'User', 'FOOD_LOG_REQUEST', 'RESOLVED', p_user_id, p_consumed_on,
    (now() AT TIME ZONE 'utc'), (now() AT TIME ZONE 'utc'), item_count, item_count, false, p_local_id::text)
  RETURNING id INTO meal;
  FOR item IN SELECT value FROM pg_catalog.jsonb_array_elements(p_items) LOOP
    -- Each row gets its own stable local id, derived from the meal's.
    ids := ids || public.insert_priced_food_row(p_user_id, meal, p_consumed_on, 0,
      pg_catalog.md5(p_local_id::text || ':' || item_index)::uuid, item);
    item_index := item_index + 1;
  END LOOP;
  RETURN QUERY SELECT meal, ids, true;
END;
$function$;
REVOKE ALL ON FUNCTION public.log_foods_as_meal(uuid, uuid, timestamp, text, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.log_foods_as_meal(uuid, uuid, timestamp, text, jsonb) TO service_role;

CREATE OR REPLACE FUNCTION public.agent_add_meal_foods(p_user_id uuid, p_message_id integer, p_items jsonb)
RETURNS integer[]
LANGUAGE plpgsql SET search_path = '' AS $function$
DECLARE meal public."Message";
  item jsonb;
  ids integer[] := '{}';
  item_count integer := coalesce(pg_catalog.jsonb_array_length(p_items), 0);
BEGIN
  IF pg_catalog.jsonb_typeof(p_items) <> 'array' OR item_count = 0 OR item_count > 50 THEN
    RAISE EXCEPTION 'invalid_meal' USING ERRCODE = '22023'; END IF;
  meal := public.agent_editable_meal(p_user_id, p_message_id);
  FOR item IN SELECT value FROM pg_catalog.jsonb_array_elements(p_items) LOOP
    IF coalesce((item->>'grams')::float8, 0) <= 0 THEN RAISE EXCEPTION 'invalid_meal' USING ERRCODE = '22023'; END IF;
    IF NOT EXISTS (SELECT 1 FROM public."FoodItem" f WHERE f.id = (item->>'foodItemId')::integer AND f."archivedAt" IS NULL
        AND public.food_visible(p_user_id, f."privateToUserId", f."lineageId"))
    THEN RAISE EXCEPTION 'food_unavailable' USING ERRCODE = 'P0002'; END IF;
    ids := ids || public.insert_priced_food_row(p_user_id, p_message_id, coalesce(meal."consumedOn", meal."createdAt"), 0,
      gen_random_uuid(), item);
  END LOOP;
  UPDATE public."Message" SET "itemsToProcess" = coalesce("itemsToProcess", 0) + item_count,
    "itemsProcessed" = coalesce("itemsProcessed", 0) + item_count WHERE id = p_message_id;
  RETURN ids;
END;
$function$;


CREATE OR REPLACE FUNCTION public.save_user_food(p_user_id uuid, p_food_id integer, p_food jsonb, p_servings jsonb,
  p_nutrients jsonb, p_ingredients jsonb)
RETURNS TABLE(food_id integer, created boolean, versioned boolean, previous_id integer)
LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $function$
DECLARE
  is_recipe boolean := p_ingredients IS NOT NULL AND jsonb_typeof(p_ingredients) <> 'null';
  identity text := public.food_identity_key(p_food->>'name', p_food->>'brand');
  old_row public."FoodItem"%ROWTYPE;
  in_use boolean := false;
  target integer;
  bad integer;
BEGIN
  IF p_user_id IS NULL OR length(public.food_identity_part(p_food->>'name')) < 2 OR
     length(coalesce(p_food->>'name', '')) > 120 OR length(coalesce(p_food->>'brand', '')) > 120 OR
     coalesce((p_food->>'defaultServingWeightGram')::float8, 0) <= 0 OR (p_food->>'defaultServingWeightGram')::float8 > 20000 OR
     coalesce((p_food->>'kcal')::float8, -1) < 0 OR
     jsonb_typeof(p_servings) IS DISTINCT FROM 'array' OR jsonb_array_length(p_servings) > 10 OR
     jsonb_typeof(p_nutrients) IS DISTINCT FROM 'array' OR jsonb_array_length(p_nutrients) > 60 OR
     (is_recipe AND (jsonb_typeof(p_ingredients) <> 'array' OR jsonb_array_length(p_ingredients) NOT BETWEEN 1 AND 50 OR
       coalesce((p_food->>'recipePortions')::numeric, 0) <= 0 OR (p_food->>'recipePortions')::numeric > 1000)) OR
     (NOT is_recipe AND (p_food->>'recipePortions' IS NOT NULL OR p_food->>'cookedWeightGram' IS NOT NULL))
  THEN RAISE EXCEPTION 'Invalid food' USING ERRCODE = '22023'; END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('user_food:' || p_user_id::text, 0));
  IF p_food_id IS NOT NULL THEN
    SELECT * INTO old_row FROM public."FoodItem" f
      WHERE f.id = p_food_id AND f."privateToUserId" = p_user_id AND f."archivedAt" IS NULL FOR UPDATE;
    IF old_row.id IS NULL OR (old_row."recipePortions" IS NOT NULL) <> is_recipe
    THEN RAISE EXCEPTION 'food_unavailable' USING ERRCODE = 'P0002'; END IF;
  END IF;

  -- One name per thing the user owns, across foods and recipes, so "Chili" in the Foods tab is never ambiguous. Only
  -- checked when the name is new: the agent may since have made a private estimate with a recipe's name (recipes have
  -- their own index), and that must not stop the user editing their recipe.
  IF (p_food_id IS NULL OR public.food_identity_key(old_row.name, old_row.brand) <> identity) AND
     EXISTS (SELECT 1 FROM public."FoodItem" f WHERE f."privateToUserId" = p_user_id AND f."archivedAt" IS NULL
      AND public.food_identity_key(f.name, f.brand) = identity AND f.id IS DISTINCT FROM p_food_id)
  THEN RAISE EXCEPTION 'name_taken' USING ERRCODE = '23505'; END IF;

  IF is_recipe THEN
    -- Ingredients: foods this user can see, never a recipe (no nesting in v1), never the recipe itself, and a serving
    -- only of that food.
    SELECT count(*) INTO bad FROM jsonb_array_elements(p_ingredients) i
      LEFT JOIN public."FoodItem" f ON f.id = (i->>'foodItemId')::integer
      LEFT JOIN public."Serving" s ON s.id = (i->>'servingId')::integer
      WHERE f.id IS NULL OR f."recipePortions" IS NOT NULL OR f.id IS NOT DISTINCT FROM p_food_id
        OR NOT public.food_visible(p_user_id, f."privateToUserId", f."lineageId")
        OR coalesce((i->>'grams')::float8, 0) <= 0 OR (i->>'grams')::float8 > 20000
        OR (i->>'servingId' IS NOT NULL AND (s.id IS NULL OR s."foodItemId" <> f.id));
    IF bad > 0 THEN RAISE EXCEPTION 'ingredient_unavailable' USING ERRCODE = '42501'; END IF;
  END IF;

  IF p_food_id IS NOT NULL THEN
    in_use := EXISTS (SELECT 1 FROM public."LoggedFoodItem" l WHERE l."foodItemId" = p_food_id AND l."deletedAt" IS NULL)
      OR EXISTS (SELECT 1 FROM public."RecipeIngredient" r WHERE r."foodItemId" = p_food_id);
  END IF;

  IF p_food_id IS NOT NULL AND NOT in_use THEN
    target := p_food_id;
    UPDATE public."FoodItem" SET name = pg_catalog.btrim(p_food->>'name'), brand = nullif(pg_catalog.btrim(p_food->>'brand'), ''),
      "defaultServingWeightGram" = (p_food->>'defaultServingWeightGram')::float8,
      "defaultServingLiquidMl" = (p_food->>'defaultServingLiquidMl')::float8,
      "kcalPerServing" = (p_food->>'kcal')::float8, "proteinPerServing" = coalesce((p_food->>'proteinG')::float8, 0),
      "carbPerServing" = coalesce((p_food->>'carbG')::float8, 0), "totalFatPerServing" = coalesce((p_food->>'totalFatG')::float8, 0),
      "fiberPerServing" = (p_food->>'fiberG')::float8, "sugarPerServing" = (p_food->>'sugarG')::float8,
      "addedSugarPerServing" = (p_food->>'addedSugarG')::float8, "satFatPerServing" = (p_food->>'satFatG')::float8,
      "transFatPerServing" = (p_food->>'transFatG')::float8, "isLiquid" = coalesce((p_food->>'isLiquid')::boolean, false),
      "recipePortions" = (p_food->>'recipePortions')::numeric, "cookedWeightGram" = (p_food->>'cookedWeightGram')::float8,
      "bgeBaseEmbedding" = coalesce((p_food->>'bgeBaseEmbedding')::extensions.vector, "bgeBaseEmbedding"),
      description = coalesce(p_food->>'description', description), "weightUnknown" = false, "lastUpdated" = now()
    WHERE id = target;
    -- A favourite keeps its food; a serving that goes away leaves it on the default serving.
    UPDATE public."UserFavoriteFoodItem" SET "servingId" = NULL
      WHERE "servingId" IN (SELECT id FROM public."Serving" WHERE "foodItemId" = target);
    DELETE FROM public."Serving" WHERE "foodItemId" = target;
    DELETE FROM public."Nutrient" WHERE "foodItemId" = target;
    DELETE FROM public."RecipeIngredient" WHERE "recipeFoodItemId" = target;
  ELSE
    -- A new food, or a new version of one that past logs (or recipes) point at. The old version is archived first so
    -- the new one can keep its name.
    IF p_food_id IS NOT NULL THEN
      UPDATE public."FoodItem" SET "archivedAt" = now(), "lastUpdated" = now() WHERE id = p_food_id;
    END IF;
    INSERT INTO public."FoodItem" (name, brand, "defaultServingWeightGram", "defaultServingLiquidMl", "kcalPerServing",
      "proteinPerServing", "carbPerServing", "totalFatPerServing", "fiberPerServing", "sugarPerServing",
      "addedSugarPerServing", "satFatPerServing", "transFatPerServing", "isLiquid", "userId", "foodInfoSource",
      "bgeBaseEmbedding", description, verified, "privateToUserId", "recipePortions", "cookedWeightGram",
      "previousVersionId", "lastUpdated", gtin, "UPC")
    VALUES (pg_catalog.btrim(p_food->>'name'), nullif(pg_catalog.btrim(p_food->>'brand'), ''),
      (p_food->>'defaultServingWeightGram')::float8, (p_food->>'defaultServingLiquidMl')::float8, (p_food->>'kcal')::float8,
      coalesce((p_food->>'proteinG')::float8, 0), coalesce((p_food->>'carbG')::float8, 0),
      coalesce((p_food->>'totalFatG')::float8, 0), (p_food->>'fiberG')::float8, (p_food->>'sugarG')::float8,
      (p_food->>'addedSugarG')::float8, (p_food->>'satFatG')::float8, (p_food->>'transFatG')::float8,
      coalesce((p_food->>'isLiquid')::boolean, false), p_user_id, 'User',
      coalesce((p_food->>'bgeBaseEmbedding')::extensions.vector, old_row."bgeBaseEmbedding"),
      coalesce(p_food->>'description', old_row.description), false, p_user_id,
      (p_food->>'recipePortions')::numeric, (p_food->>'cookedWeightGram')::float8, p_food_id, now(),
      old_row.gtin, old_row."UPC")  -- a barcode moves to the new version; searches skip archived rows
    RETURNING id INTO target;
    IF p_food_id IS NOT NULL THEN
      -- The new version keeps the icon while its name is the same food; a renamed food gets its own from the queue.
      IF public.food_identity_key(old_row.name, old_row.brand) = identity THEN
        INSERT INTO public."FoodItemImages" ("foodItemId", "foodImageId", similarity)
        SELECT target, i."foodImageId", i.similarity FROM public."FoodItemImages" i WHERE i."foodItemId" = p_food_id;
      END IF;
      UPDATE public."UserFavoriteFoodItem" SET "foodItemId" = target, "servingId" = NULL
        WHERE "foodItemId" = p_food_id AND "userId" = p_user_id;
    END IF;
  END IF;

  INSERT INTO public."Serving" ("foodItemId", "servingName", "servingWeightGram", "defaultServingAmount")
  SELECT target, pg_catalog.btrim(s->>'name'), (s->>'grams')::float8, coalesce(nullif((s->>'amount')::numeric, 0), 1)
    FROM jsonb_array_elements(p_servings) s
    WHERE length(pg_catalog.btrim(coalesce(s->>'name', ''))) > 0 AND (s->>'grams')::float8 > 0;
  INSERT INTO public."Nutrient" ("foodItemId", "nutrientName", "nutrientUnit", "nutrientAmountPerDefaultServing")
  SELECT target, n->>'name', n->>'unit', (n->>'amount')::float8 FROM jsonb_array_elements(p_nutrients) n
    WHERE length(coalesce(n->>'name', '')) > 0 AND (n->>'amount')::float8 >= 0;
  IF is_recipe THEN
    INSERT INTO public."RecipeIngredient" ("recipeFoodItemId", "foodItemId", grams, "servingId", "servingAmount",
      "loggedUnit", position)
    SELECT target, (i->>'foodItemId')::integer, (i->>'grams')::float8, (i->>'servingId')::integer,
      (i->>'servingAmount')::float8, nullif(i->>'loggedUnit', ''), (o - 1)::smallint
      FROM jsonb_array_elements(p_ingredients) WITH ORDINALITY AS e(i, o);
  END IF;

  RETURN QUERY SELECT target, p_food_id IS NULL, p_food_id IS NOT NULL AND in_use, p_food_id;
END;
$function$;
REVOKE ALL ON FUNCTION public.save_user_food(uuid, integer, jsonb, jsonb, jsonb, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.save_user_food(uuid, integer, jsonb, jsonb, jsonb, jsonb) TO service_role;

NOTIFY pgrst, 'reload schema';
