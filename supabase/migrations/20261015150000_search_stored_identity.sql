-- Food search reads stored identity text (2026-10-10). After 20261015140000 common words were still slow ("chicken"
-- 530 ms, "chicken breast" 850 ms): every candidate's name and brand went through food_identity_part (unaccent and a
-- regexp, ~0.05 ms a call) several times, in the index rechecks, the all-words checks and the scoring, and a function
-- result can't be reused across rows. FoodItem now stores them as generated columns, kept in step on every insert and
-- update, and the search's indexes are on those columns. Same values as before (food_identity_part(NULL) is '' and
-- food_identity_parts(NULL) is '{}', as the search used them), so the same results; checked on 24 queries in English,
-- French, Spanish and German. Every insert into FoodItem names its columns, so none writes the generated ones. The old
-- expression indexes stay for the other functions that filter on food_identity_part.

ALTER TABLE public."FoodItem"
  ADD COLUMN IF NOT EXISTS "nameIdentity" text GENERATED ALWAYS AS (public.food_identity_part(name)) STORED,
  ADD COLUMN IF NOT EXISTS "brandIdentity" text GENERATED ALWAYS AS (public.food_identity_part(brand)) STORED,
  ADD COLUMN IF NOT EXISTS "knownAsIdentity" text[] GENERATED ALWAYS AS (public.food_identity_parts("knownAs")) STORED;

CREATE INDEX IF NOT EXISTS "FoodItem_nameIdentity_trgm_idx" ON public."FoodItem"
  USING gin ("nameIdentity" extensions.gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "FoodItem_brandIdentity_idx" ON public."FoodItem" ("brandIdentity") WHERE brand IS NOT NULL;
CREATE INDEX IF NOT EXISTS "FoodItem_knownAsIdentity_idx" ON public."FoodItem" USING gin ("knownAsIdentity");
CREATE INDEX IF NOT EXISTS "FoodItem_nameBrandIdentity_trgm_idx" ON public."FoodItem"
  USING gin ((' ' || "nameIdentity" || ' ' || "brandIdentity") extensions.gin_trgm_ops) WHERE brand IS NOT NULL;

CREATE OR REPLACE FUNCTION public.search_meal_food_catalogue(p_query text, p_limit integer DEFAULT 20, p_offset integer DEFAULT 0, p_user_id uuid DEFAULT NULL::uuid, p_include_recipes boolean DEFAULT false, p_threshold real DEFAULT 0.45)
 RETURNS TABLE(id integer, name text, brand text, "knownAs" text[])
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
DECLARE q text := public.food_identity_part(p_query);
  recipes boolean := p_include_recipes;
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
      SELECT f.id FROM public."FoodItem" f WHERE q OPERATOR(extensions.<%) f."nameIdentity"
      UNION SELECT f.id FROM public."FoodItem" f WHERE f.brand IS NOT NULL AND f."brandIdentity" = q
      UNION SELECT f.id FROM public."FoodItem" f WHERE f."knownAsIdentity" OPERATOR(pg_catalog.@>) ARRAY[q]
      UNION SELECT f.id FROM public."FoodItem" f
        WHERE pg_catalog.cardinality(words) > 0 AND f."nameIdentity" LIKE '%' || words[1] || '%'
          AND NOT EXISTS (SELECT 1 FROM pg_catalog.unnest(words) w WHERE f."nameIdentity" NOT LIKE '%' || w || '%')
      -- Words split between brand and name ("fairlife" + "2% ... milk").
      UNION SELECT f.id FROM public."FoodItem" f
        WHERE pg_catalog.cardinality(needed) > 1 AND f.brand IS NOT NULL
          AND (' ' || f."nameIdentity" || ' ' || f."brandIdentity") LIKE '% ' || longest || '%'
          AND NOT EXISTS (SELECT 1 FROM pg_catalog.unnest(needed) w
            WHERE (' ' || f."nameIdentity" || ' ' || f."brandIdentity") NOT LIKE '% ' || w || '%')),
    found AS (
      SELECT f.id, f.name, f.brand, f."knownAs",
        f."nameIdentity" AS n, f."brandIdentity" AS b, f."knownAsIdentity" OPERATOR(pg_catalog.@>) ARRAY[q] AS alias
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
