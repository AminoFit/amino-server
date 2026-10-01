-- Fast food search (food-search-plan.md, step 0), for the app's search and the meal agent.
--
-- Vector search: the query vector came from a join, so the planner ignored the HNSW index and computed the distance
-- for every food (~120-650 ms; get_cosine_results also turned every embedding into text). Now the nearest foods come
-- from the index first (the vector is a scalar subquery, which the index can use), then the visibility rules filter
-- them; pgvector 0.5.1 has no filtered index scans, so it takes more than asked for. The user's own foods are a
-- handful of rows, searched exactly and merged in. hnsw.ef_search is raised (at run time: Supabase refuses it as a
-- function setting) so the index returns enough candidates.
--
-- Text search: the OR of name, brand and alias matches defeated the trigram index (~460 ms). Each part is now its own
-- indexed query (name: trigram; brand: an expression index; aliases: a GIN index over their identity forms).
--
-- Recipes: p_include_recipes lets the app's search show the user's recipes whatever the agent flag says; the agent
-- keeps recipes_in_agent.

CREATE INDEX IF NOT EXISTS "FoodItem_brand_identity_idx"
  ON public."FoodItem" (public.food_identity_part(brand)) WHERE brand IS NOT NULL;

CREATE OR REPLACE FUNCTION public.food_identity_parts(p_values text[]) RETURNS text[]
LANGUAGE sql IMMUTABLE PARALLEL SAFE SET search_path = '' AS $function$
  SELECT coalesce(pg_catalog.array_agg(public.food_identity_part(v)), ARRAY[]::text[]) FROM pg_catalog.unnest(p_values) v
$function$;
CREATE INDEX IF NOT EXISTS "FoodItem_alias_identity_idx"
  ON public."FoodItem" USING gin (public.food_identity_parts("knownAs"));

DROP FUNCTION IF EXISTS public.search_meal_food_catalogue(text, integer, integer, uuid);
CREATE FUNCTION public.search_meal_food_catalogue(
  p_query text, p_limit integer DEFAULT 20, p_offset integer DEFAULT 0, p_user_id uuid DEFAULT NULL,
  p_include_recipes boolean DEFAULT false
) RETURNS TABLE(id integer, name text, brand text, "knownAs" text[])
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = '' AS $function$
DECLARE q text := public.food_identity_part(p_query);
  recipes boolean := p_include_recipes OR public.user_flag_enabled('recipes_in_agent', p_user_id);
BEGIN
  IF p_query IS NULL OR length(trim(p_query)) NOT BETWEEN 1 AND 100 OR
    p_limit NOT BETWEEN 1 AND 50 OR p_offset NOT BETWEEN 0 AND 500 OR q = ''
  THEN RAISE EXCEPTION 'Invalid food search' USING ERRCODE='22023'; END IF;
  PERFORM pg_catalog.set_config('pg_trgm.word_similarity_threshold', '0.45', true);
  RETURN QUERY
    WITH hits AS (
      SELECT f.id FROM public."FoodItem" f WHERE q OPERATOR(extensions.<%) public.food_identity_part(f.name)
      UNION SELECT f.id FROM public."FoodItem" f WHERE f.brand IS NOT NULL AND public.food_identity_part(f.brand) = q
      UNION SELECT f.id FROM public."FoodItem" f WHERE public.food_identity_parts(f."knownAs") OPERATOR(pg_catalog.@>) ARRAY[q])
    SELECT f.id, f.name, f.brand, f."knownAs"
    FROM hits JOIN public."FoodItem" f ON f.id = hits.id
    WHERE (f."privateToUserId" IS NULL OR f."privateToUserId" = p_user_id)
      AND f."archivedAt" IS NULL AND (f."recipePortions" IS NULL OR recipes)
    ORDER BY (public.food_identity_part(f.name) = q) DESC,
      extensions.word_similarity(q, public.food_identity_part(f.name)) DESC, f.id
    LIMIT p_limit OFFSET p_offset;
END;
$function$;
REVOKE ALL ON FUNCTION public.search_meal_food_catalogue(text, integer, integer, uuid, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.search_meal_food_catalogue(text, integer, integer, uuid, boolean) TO service_role;

-- The embedding column stays in the result for older callers but is always NULL now: nothing reads it.
DROP FUNCTION IF EXISTS public.get_cosine_results(integer, integer, uuid);
CREATE FUNCTION public.get_cosine_results(p_embedding_cache_id integer, amount_of_results integer DEFAULT 5,
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
  WHERE x.distance IS NOT NULL AND (f."privateToUserId" IS NULL OR f."privateToUserId" = p_user_id) AND f."archivedAt" IS NULL
    AND (f."recipePortions" IS NULL OR p_include_recipes OR public.user_flag_enabled('recipes_in_agent', p_user_id))
  ORDER BY x.distance
  LIMIT least(greatest(amount_of_results, 1), 50);
END;
$function$;
REVOKE ALL ON FUNCTION public.get_cosine_results(integer, integer, uuid, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_cosine_results(integer, integer, uuid, boolean) TO service_role;

DROP FUNCTION IF EXISTS public.search_food_catalogue_nearest(integer, integer, uuid);
CREATE FUNCTION public.search_food_catalogue_nearest(p_embedding_cache_id integer, p_limit integer DEFAULT 12,
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
  WHERE x.distance IS NOT NULL AND (f."privateToUserId" IS NULL OR f."privateToUserId" = p_user_id) AND f."archivedAt" IS NULL
    AND (f."recipePortions" IS NULL OR p_include_recipes OR public.user_flag_enabled('recipes_in_agent', p_user_id))
  ORDER BY x.distance
  LIMIT least(greatest(p_limit, 1), 30);
END;
$function$;
REVOKE ALL ON FUNCTION public.search_food_catalogue_nearest(integer, integer, uuid, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.search_food_catalogue_nearest(integer, integer, uuid, boolean) TO service_role;

-- The food indexes stay in memory: shared buffers are 256 MB and the 1.8 GB USDA index pushes the 58 MB food vector
-- index out, after which each new search reads it from disk (400-800 ms instead of 1-13 ms). Every 5 minutes the food
-- search indexes and table are read back in; it costs nothing while they are still cached. (The USDA index is too big
-- to keep warm on this compute; halfvec would halve it but needs pgvector 0.7, production has 0.5.1.)
CREATE EXTENSION IF NOT EXISTS pg_prewarm WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_cron;
SELECT cron.schedule('warm-food-search', '*/5 * * * *', $warm$
  SELECT extensions.pg_prewarm('public."FoodItem_bgeBaseEmbedding_idx"'), extensions.pg_prewarm('public."FoodItem_name_trgm_idx"'),
    extensions.pg_prewarm('public."FoodItem_brand_identity_idx"'), extensions.pg_prewarm('public."FoodItem_alias_identity_idx"'),
    extensions.pg_prewarm('public."FoodItem"')
$warm$);

-- foodEmbeddingCache and UsdaFoodItemEmbedding had never been analysed (the planner thought they held 1,518 and 0 rows).
ANALYZE public."FoodItem";
ANALYZE public."foodEmbeddingCache";
ANALYZE public."UsdaFoodItemEmbedding";

NOTIFY pgrst, 'reload schema';
