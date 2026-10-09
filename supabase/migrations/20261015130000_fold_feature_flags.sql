-- Flags folded into code (2026-10-09, owner: "a nightmare amount of flags by launch"). Every one of these was on for
-- every user (or, shared_foods_in_agent, off for everyone), so behaviour stays as it was:
--  * recipes_in_agent: the agent's own searches ask for recipes (p_include_recipes); the app passes its own choice,
--    which the flag used to override for flagged users (ingredient pickers showed recipes).
--  * shared_foods_in_agent (off): the agent's own-foods list stays the user's own foods; shared foods are still found
--    by catalogue search.
--  * expenditure_estimate: energy_expenditure answers every user.
-- meal_agent_sonnet stays, the one kill switch (remove after two weeks without needing it, about 2026-10-23).

CREATE OR REPLACE FUNCTION public.get_cosine_results(p_embedding_cache_id integer, amount_of_results integer DEFAULT 5, p_user_id uuid DEFAULT NULL::uuid, p_include_recipes boolean DEFAULT false)
 RETURNS TABLE(id integer, name text, brand text, "foodInfoSource" text, "externalId" text, embedding text, cosine_similarity double precision)
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public', 'extensions'
AS $function$
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
    AND (f."recipePortions" IS NULL OR p_include_recipes)
  ORDER BY x.distance
  LIMIT least(greatest(amount_of_results, 1), 50);
END;
$function$;

CREATE OR REPLACE FUNCTION public.search_food_catalogue_nearest(p_embedding_cache_id integer, p_limit integer DEFAULT 12, p_user_id uuid DEFAULT NULL::uuid, p_include_recipes boolean DEFAULT false)
 RETURNS TABLE(id integer, name text, brand text, "knownAs" text[])
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
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
    AND (f."recipePortions" IS NULL OR p_include_recipes)
  ORDER BY x.distance
  LIMIT least(greatest(p_limit, 1), 30);
END;
$function$;

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

CREATE OR REPLACE FUNCTION public.search_own_foods(p_text text, p_user_id uuid, p_limit integer DEFAULT 5)
 RETURNS TABLE(id integer, name text, brand text, score real)
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
  SELECT f.id, f.name, f.brand,
    extensions.word_similarity(public.food_identity_part(f.name), public.food_identity_part(p_text)) AS score
  FROM public."FoodItem" f
  WHERE p_user_id IS NOT NULL AND f."archivedAt" IS NULL
    AND f."privateToUserId" = p_user_id
    AND length(public.food_identity_part(p_text)) BETWEEN 1 AND 2000
    AND extensions.word_similarity(public.food_identity_part(f.name), public.food_identity_part(p_text)) >= 0.6
  ORDER BY score DESC, (f."privateToUserId" = p_user_id) DESC, f."lastUpdated" DESC, f.id DESC
  LIMIT least(greatest(p_limit, 1), 10)
$function$;

CREATE OR REPLACE FUNCTION public.energy_expenditure(p_days integer DEFAULT 28)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
DECLARE
  me uuid := auth.uid();
  zone text := public.mcp_user_timezone();
  last_day date;
  first_day date;
  ts float8[];
  ws float8[];
  kcals float8[];
  median_kcal float8;
  intake float8;
  complete int;
  logged int;
  need_weighings int;
  need_complete int;
  wt float8[];
  t_mean float8; w_mean float8; sxx float8; sxy float8; slope float8; intercept float8;
  scale float8; k float8; resid float8; sse float8; sw float8; se float8;
  n int;
BEGIN
  IF me IS NULL THEN RAISE EXCEPTION 'Not signed in' USING ERRCODE = '28000'; END IF;
  IF p_days IS NULL OR p_days NOT BETWEEN 14 AND 56 THEN RAISE EXCEPTION 'Invalid window' USING ERRCODE = '22023'; END IF;
  last_day := (pg_catalog.now() AT TIME ZONE zone)::date - 1;
  first_day := last_day - (p_days - 1);
  need_weighings := ceil(10.0 * p_days / 28);
  need_complete := ceil(18.0 * p_days / 28);

  SELECT array_agg((t.day - first_day)::float8 ORDER BY t.day), array_agg(t."weightKg"::float8 ORDER BY t.day)
  INTO ts, ws FROM public.weight_trend(first_day, last_day) t WHERE t."weightKg" IS NOT NULL;
  n := coalesce(array_length(ws, 1), 0);

  SELECT array_agg((d.totals->>'kcal')::float8) INTO kcals
  FROM public.nutrition_day_totals(first_day, last_day, zone) d
  WHERE d.foods > 0 AND (d.totals->>'kcal')::float8 > 0;
  logged := coalesce(array_length(kcals, 1), 0);
  SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY k0) INTO median_kcal FROM pg_catalog.unnest(kcals) k0;
  SELECT count(*), avg(k0) INTO complete, intake FROM pg_catalog.unnest(kcals) k0 WHERE k0 >= 0.6 * median_kcal;
  complete := coalesce(complete, 0);

  IF n < need_weighings OR complete < need_complete THEN
    RETURN pg_catalog.jsonb_build_object('from', first_day, 'to', last_day, 'weighings', n, 'loggedDays', logged, 'completeDays', complete,
      'insufficient', pg_catalog.jsonb_build_object(
        'weighInsNeeded', greatest(need_weighings - n, 0), 'completeDaysNeeded', greatest(need_complete - complete, 0)));
  END IF;

  -- Huber-weighted least squares, by iteratively reweighting: a clothed or misread weigh-in counts less.
  wt := array_fill(1::float8, ARRAY[n]);
  FOR iteration IN 1 .. 10 LOOP
    sw := 0; t_mean := 0; w_mean := 0;
    FOR i IN 1 .. n LOOP sw := sw + wt[i]; t_mean := t_mean + wt[i] * ts[i]; w_mean := w_mean + wt[i] * ws[i]; END LOOP;
    t_mean := t_mean / sw; w_mean := w_mean / sw;
    sxx := 0; sxy := 0;
    FOR i IN 1 .. n LOOP
      sxx := sxx + wt[i] * (ts[i] - t_mean) ^ 2; sxy := sxy + wt[i] * (ts[i] - t_mean) * (ws[i] - w_mean);
    END LOOP;
    slope := sxy / sxx; intercept := w_mean - slope * t_mean;
    SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY abs(ws[i] - (intercept + slope * ts[i]))) INTO scale
    FROM pg_catalog.generate_series(1, n) i;
    -- 1.4826 × MAD estimates the scatter; at least 0.1 kg so a few identical readings can't make every other an outlier.
    k := 1.345 * greatest(1.4826 * scale, 0.1);
    FOR i IN 1 .. n LOOP
      resid := abs(ws[i] - (intercept + slope * ts[i]));
      wt[i] := CASE WHEN resid <= k THEN 1 ELSE k / resid END;
    END LOOP;
  END LOOP;
  sse := 0; sw := 0;
  FOR i IN 1 .. n LOOP sse := sse + wt[i] * (ws[i] - (intercept + slope * ts[i])) ^ 2; sw := sw + wt[i]; END LOOP;
  se := sqrt(sse / greatest(sw - 2, 1) / sxx);

  RETURN pg_catalog.jsonb_build_object('from', first_day, 'to', last_day, 'weighings', n, 'loggedDays', logged, 'completeDays', complete,
    'kcalPerDay', round((intake - slope * 7700) / 10) * 10,
    'plusMinus', greatest(round(se * 7700 / 10) * 10, 10),
    'meanIntakeKcal', round(intake),
    'trendKgPerWeek', round((slope * 7)::numeric, 2));
END;
$function$;

DROP FUNCTION IF EXISTS public.my_flag_enabled(text);

DELETE FROM public."FeatureFlag" WHERE name IN ('mcp_server', 'meal_resolver_adopt', 'meal_text_fast_route',
  'meal_photo_fast_route', 'people', 'recipes_in_agent', 'mcp_writes', 'mcp_catalogue_adds', 'expenditure_estimate',
  'shared_foods_in_agent');
