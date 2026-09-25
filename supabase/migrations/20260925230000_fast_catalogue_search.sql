-- Fast catalogue retrieval for the meal agent, the legacy matcher and app search.
-- get_cosine_results scanned every FoodItem (~4 s) because there was no vector
-- index and it ordered by a computed alias. Same signature and results, now
-- ordered by the indexed distance operator.
CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA extensions;

CREATE INDEX IF NOT EXISTS "FoodItem_bgeBaseEmbedding_idx" ON public."FoodItem"
  USING hnsw ("bgeBaseEmbedding" extensions.vector_cosine_ops) WITH (m = 16, ef_construction = 128);

CREATE OR REPLACE FUNCTION public.get_cosine_results(p_embedding_cache_id integer, amount_of_results integer DEFAULT 5)
RETURNS TABLE(id integer, name text, brand text, "foodInfoSource" text, "externalId" text, embedding text,
  cosine_similarity double precision)
LANGUAGE plpgsql STABLE SET search_path = public, extensions AS $function$
DECLARE query_vector extensions.vector;
BEGIN
  SELECT c."bgeBaseEmbedding" INTO query_vector FROM public."foodEmbeddingCache" c WHERE c.id = p_embedding_cache_id;
  IF query_vector IS NULL THEN RETURN; END IF;
  RETURN QUERY
    SELECT f.id, f.name, f.brand, f."foodInfoSource"::text, f."externalId", f."bgeBaseEmbedding"::text,
      1 - (f."bgeBaseEmbedding" <=> query_vector)
    FROM public."FoodItem" f
    WHERE f."bgeBaseEmbedding" IS NOT NULL
    ORDER BY f."bgeBaseEmbedding" <=> query_vector
    LIMIT amount_of_results;
END;
$function$;

-- Typo-tolerant name search: exact and alias hits first, then trigram word
-- similarity on the same accent/case/punctuation-insensitive form used for
-- duplicate detection.
CREATE INDEX IF NOT EXISTS "FoodItem_name_trgm_idx" ON public."FoodItem"
  USING gin (public.food_identity_part(name) extensions.gin_trgm_ops);

CREATE OR REPLACE FUNCTION public.search_meal_food_catalogue(
  p_query text, p_limit integer DEFAULT 20, p_offset integer DEFAULT 0
) RETURNS TABLE(id integer, name text, brand text, "knownAs" text[])
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = '' AS $function$
DECLARE q text := public.food_identity_part(p_query);
BEGIN
  IF p_query IS NULL OR length(trim(p_query)) NOT BETWEEN 1 AND 100 OR
    p_limit NOT BETWEEN 1 AND 20 OR p_offset NOT BETWEEN 0 AND 200 OR q = ''
  THEN RAISE EXCEPTION 'Invalid food search' USING ERRCODE='22023'; END IF;
  PERFORM pg_catalog.set_config('pg_trgm.word_similarity_threshold', '0.45', true);
  RETURN QUERY
    SELECT f.id, f.name, f.brand, f."knownAs"
    FROM public."FoodItem" f
    WHERE q OPERATOR(extensions.<%) public.food_identity_part(f.name)
       OR public.food_identity_part(f.brand) = q
       OR EXISTS (SELECT 1 FROM pg_catalog.unnest(coalesce(f."knownAs", ARRAY[]::text[])) alias
                  WHERE public.food_identity_part(alias) = q)
    ORDER BY (public.food_identity_part(f.name) = q) DESC,
      extensions.word_similarity(q, public.food_identity_part(f.name)) DESC, f.id
    LIMIT p_limit OFFSET p_offset;
END;
$function$;

REVOKE ALL ON FUNCTION public.search_meal_food_catalogue(text, integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.search_meal_food_catalogue(text, integer, integer) TO service_role;
NOTIFY pgrst, 'reload schema';
