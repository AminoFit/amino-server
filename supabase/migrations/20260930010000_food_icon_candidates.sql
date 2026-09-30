-- Icons a new food can reuse: the closest by name embedding, for Jev to check. The first-generation flat line
-- drawings (files named *_(no_bg), ids 12970-13300) no longer match the app's icon style, so new foods don't reuse
-- them; the foods already linked to them keep them.
CREATE OR REPLACE FUNCTION public.food_icon_candidates(p_embedding_cache_id integer, p_limit integer DEFAULT 8)
RETURNS TABLE(food_image_id integer, image_description text, cosine_similarity double precision)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = '' AS $function$
  SELECT fi.id, fi."imageDescription", 1 - (fi."bgeBaseEmbedding" OPERATOR(extensions.<=>) e."bgeBaseEmbedding")
  FROM public."FoodImage" fi, public."foodEmbeddingCache" e
  WHERE e.id = p_embedding_cache_id
    AND fi."bgeBaseEmbedding" IS NOT NULL
    AND fi."pathToImage" !~ '\(no_bg\)'
  ORDER BY fi."bgeBaseEmbedding" OPERATOR(extensions.<=>) e."bgeBaseEmbedding"
  LIMIT least(greatest(p_limit, 1), 20)
$function$;

REVOKE ALL ON FUNCTION public.food_icon_candidates(integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.food_icon_candidates(integer, integer) TO service_role;
NOTIFY pgrst, 'reload schema';
