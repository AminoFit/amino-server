-- Food search: a food known by the query as an alias ranks like one named it (2026-10-05). Wheat noodles (241) was given
-- the alias "Shanghai noodles", but the alias only made it a hit: with 20 other noodle hits ahead of it on similarity, it
-- never reached the page, so an agent logging Shanghai noodles chose cooked spaghetti instead.
SET TimeZone = 'UTC';

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
      WHERE (f."privateToUserId" IS NULL OR f."privateToUserId" = p_user_id)
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
