-- Catalogue foods nearest a query by meaning (name and brand embeddings), for the blended catalogue search. Only the
-- columns the search needs (get_cosine_results also returns each embedding as text).
CREATE OR REPLACE FUNCTION public.search_food_catalogue_nearest(p_embedding_cache_id integer, p_limit integer DEFAULT 12,
  p_user_id uuid DEFAULT NULL)
RETURNS TABLE(id integer, name text, brand text, "knownAs" text[])
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = '' AS $function$
  SELECT f.id, f.name, f.brand, f."knownAs"
  FROM public."FoodItem" f, public."foodEmbeddingCache" c
  WHERE c.id = p_embedding_cache_id AND f."bgeBaseEmbedding" IS NOT NULL
    AND (f."privateToUserId" IS NULL OR f."privateToUserId" = p_user_id)
  ORDER BY f."bgeBaseEmbedding" OPERATOR(extensions.<=>) c."bgeBaseEmbedding"
  LIMIT least(greatest(p_limit, 1), 30)
$function$;

REVOKE ALL ON FUNCTION public.search_food_catalogue_nearest(integer, integer, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.search_food_catalogue_nearest(integer, integer, uuid) TO service_role;
NOTIFY pgrst, 'reload schema';
