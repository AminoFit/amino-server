-- Food search, continued (food-search-plan.md). Partial words ("pas sau" for "Pasta Sauce") share too few trigrams with
-- the name to pass word similarity, so names containing every query word are a fourth branch (the trigram index serves
-- the longest word; the rest are checked on those rows). p_threshold lowers the word-similarity bar for a second,
-- typo-tolerant pass ("chiken brest"), used only when the first finds little.
DROP FUNCTION IF EXISTS public.search_meal_food_catalogue(text, integer, integer, uuid, boolean);
CREATE FUNCTION public.search_meal_food_catalogue(
  p_query text, p_limit integer DEFAULT 20, p_offset integer DEFAULT 0, p_user_id uuid DEFAULT NULL,
  p_include_recipes boolean DEFAULT false, p_threshold real DEFAULT 0.45
) RETURNS TABLE(id integer, name text, brand text, "knownAs" text[])
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = '' AS $function$
DECLARE q text := public.food_identity_part(p_query);
  recipes boolean := p_include_recipes OR public.user_flag_enabled('recipes_in_agent', p_user_id);
  words text[] := ARRAY(SELECT w FROM pg_catalog.unnest(pg_catalog.string_to_array(public.food_identity_part(p_query), ' ')) w
    WHERE length(w) >= 3 ORDER BY length(w) DESC);
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
          AND NOT EXISTS (SELECT 1 FROM pg_catalog.unnest(words) w WHERE public.food_identity_part(f.name) NOT LIKE '%' || w || '%'))
    SELECT f.id, f.name, f.brand, f."knownAs"
    FROM hits JOIN public."FoodItem" f ON f.id = hits.id
    WHERE (f."privateToUserId" IS NULL OR f."privateToUserId" = p_user_id)
      AND f."archivedAt" IS NULL AND (f."recipePortions" IS NULL OR recipes)
    ORDER BY (public.food_identity_part(f.name) = q) DESC,
      extensions.word_similarity(q, public.food_identity_part(f.name)) DESC, f.id
    LIMIT p_limit OFFSET p_offset;
END;
$function$;
REVOKE ALL ON FUNCTION public.search_meal_food_catalogue(text, integer, integer, uuid, boolean, real) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.search_meal_food_catalogue(text, integer, integer, uuid, boolean, real) TO service_role;
NOTIFY pgrst, 'reload schema';
