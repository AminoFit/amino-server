-- Multi-word catalogue searches took 0.9-1.5 s (one-word ones 30-110 ms): the branch matching words split between brand
-- and name ("fairlife" + "2% ... milk") ran food_identity_part twice on every row with no index (1.0 s of 1.3 s for
-- "fat free milk"). It now leads with the longest word through a trigram index on the same brand + name text: 60 ms,
-- identical results on 12 queries in four languages (2026-10-08). The app's search, the MCP search_foods tool and the
-- meal agent's findFood and per-food candidates all use this function (the app's typo pass runs it twice).
CREATE INDEX IF NOT EXISTS "FoodItem_name_brand_identity_trgm_idx" ON public."FoodItem"
  USING gin ((' ' || public.food_identity_part(name) || ' ' || public.food_identity_part(brand)) extensions.gin_trgm_ops)
  WHERE brand IS NOT NULL;

CREATE OR REPLACE FUNCTION public.search_meal_food_catalogue(p_query text, p_limit integer DEFAULT 20, p_offset integer DEFAULT 0, p_user_id uuid DEFAULT NULL::uuid, p_include_recipes boolean DEFAULT false, p_threshold real DEFAULT 0.45)
 RETURNS TABLE(id integer, name text, brand text, "knownAs" text[])
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
DECLARE q text := public.food_identity_part(p_query);
  recipes boolean := p_include_recipes OR public.user_flag_enabled('recipes_in_agent', p_user_id);
  words text[] := ARRAY(SELECT w FROM pg_catalog.unnest(pg_catalog.string_to_array(public.food_identity_part(p_query), ' ')) w
    WHERE length(w) >= 3 ORDER BY length(w) DESC);
  -- Every word that must appear, numbers of any length included ("2" in "fairlife 2").
  needed text[] := ARRAY(SELECT DISTINCT w FROM pg_catalog.unnest(pg_catalog.string_to_array(public.food_identity_part(p_query), ' ')) w
    WHERE length(w) >= 3 OR w ~ '^[0-9]');
  -- The longest needed word leads the brand + name branch, so its trigram index finds the few rows to check.
  longest text := (SELECT w FROM pg_catalog.unnest(needed) w ORDER BY length(w) DESC, w LIMIT 1);
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
          AND (' ' || public.food_identity_part(f.name) || ' ' || public.food_identity_part(f.brand)) LIKE '% ' || longest || '%'
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
