-- Nutrient completeness (Sep 29 - Oct 2 review):
--  - Day totals say how many of the day's foods each total comes from. A total sums the foods that record a nutrient,
--    so 1.36 mg of zinc from 8 of 20 foods read as low intake rather than as missing data. Computed, never stored.
--  - A recipe's values are its ingredients' sum, recomputed when an ingredient changes (refresh_recipe_values). Recipe
--    15315 was priced while its ingredients were macros-only and then only filled, never recomputed, so it kept vitamin
--    A from the chicken alone (60.8 µg of 334.3) after the sauce and tomatoes gained theirs. Its earlier logs keep the
--    values they were logged with: the backup is not a FoodItem row, so the hourly reprice never touches them.

DROP FUNCTION IF EXISTS public.nutrition_day_totals(date, date, text);
-- The signed-in user's meals per local day in [p_from, p_to] (the meals MCP counts: mcp_is_meal), with how many
-- foods were logged, each nutrient summed over the foods that record it, and per nutrient how many foods record it.
-- Callers bound the range.
CREATE FUNCTION public.nutrition_day_totals(p_from date, p_to date, p_zone text)
RETURNS TABLE(day date, meals integer, foods integer, totals jsonb, coverage jsonb)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = '' AS $function$
  WITH meals AS (
    SELECT m.id, ((coalesce(m."consumedOn", m."createdAt") AT TIME ZONE 'UTC') AT TIME ZONE p_zone)::date AS day
    FROM public."Message" m
    WHERE m."userId" = auth.uid() AND m."deletedAt" IS NULL AND public.mcp_is_meal(m)
      AND coalesce(m."consumedOn", m."createdAt") >= (p_from::timestamp AT TIME ZONE p_zone) AT TIME ZONE 'UTC'
      AND coalesce(m."consumedOn", m."createdAt") < ((p_to + 1)::timestamp AT TIME ZONE p_zone) AT TIME ZONE 'UTC'),
  items AS (
    SELECT meals.day, l.* FROM meals JOIN public."LoggedFoodItem" l ON l."messageId" = meals.id AND l."deletedAt" IS NULL),
  sums AS (
    SELECT i.day, kv.key, sum((kv.value #>> '{}')::float8) AS total, count(*) AS known
    FROM items i CROSS JOIN LATERAL jsonb_each(to_jsonb(i)) kv
    WHERE kv.key = ANY(public.nutrition_keys()) AND jsonb_typeof(kv.value) = 'number'
    GROUP BY i.day, kv.key)
  SELECT d.day, d.meals,
    (SELECT count(*) FROM items i WHERE i.day = d.day)::integer,
    coalesce((SELECT jsonb_object_agg(s.key, public.nutrition_round(s.key, s.total)) FROM sums s WHERE s.day = d.day), '{}'::jsonb),
    coalesce((SELECT jsonb_object_agg(s.key, s.known) FROM sums s WHERE s.day = d.day), '{}'::jsonb)
  FROM (SELECT meals.day, count(*)::integer AS meals FROM meals GROUP BY meals.day) d
  ORDER BY d.day;
$function$;
REVOKE ALL ON FUNCTION public.nutrition_day_totals(date, date, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.nutrition_day_totals(date, date, text) TO authenticated, service_role;

-- MCP get_daily_summary: the core totals, and with p_all every other nutrient under "nutrients". Each day says how
-- many foods it has, and "incomplete" lists every total shown that not all of them record, with how many do
-- ({"zincMg": "8 of 20 foods"}): such a total is a lower bound, not the day's intake. A nutrient no food records is
-- absent, never 0.
CREATE OR REPLACE FUNCTION public.mcp_daily_summary(p_from date, p_to date, p_all boolean DEFAULT false) RETURNS jsonb
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = '' AS $function$
  WITH tz AS (SELECT public.mcp_user_timezone() AS name),
  core AS (SELECT ARRAY['kcal', 'proteinG', 'carbG', 'totalFatG', 'satFatG', 'fiberG', 'sugarG', 'sodiumMg', 'alcoholG',
    'caffeineMg', 'waterMl'] AS keys)
  SELECT jsonb_build_object('timezone', (SELECT name FROM tz), 'days', coalesce(jsonb_agg(
    jsonb_build_object('date', d.day, 'meals', d.meals, 'foods', d.foods)
      || (SELECT coalesce(jsonb_object_agg(e.key, e.value), '{}'::jsonb) FROM jsonb_each(d.totals) e, core WHERE e.key = ANY(core.keys))
      || CASE WHEN p_all THEN jsonb_build_object('nutrients',
        (SELECT coalesce(jsonb_object_agg(e.key, e.value), '{}'::jsonb) FROM jsonb_each(d.totals) e, core WHERE NOT e.key = ANY(core.keys)))
        ELSE '{}'::jsonb END
      || coalesce((SELECT jsonb_build_object('incomplete', jsonb_object_agg(c.key, (c.value #>> '{}') || ' of ' || d.foods || ' foods'))
        FROM jsonb_each(d.coverage) c, core
        WHERE (c.value #>> '{}')::integer < d.foods AND (p_all OR c.key = ANY(core.keys))
        HAVING count(*) > 0), '{}'::jsonb)
    ORDER BY d.day), '[]'::jsonb))
  FROM public.nutrition_day_totals(p_from, least(p_to, p_from + 365), (SELECT name FROM tz)) d;
$function$;

-- The web dashboard's days: those with food logged, energy and macros (always recorded) and fibre when known.
-- Unchanged; recreated because nutrition_day_totals was.
CREATE OR REPLACE FUNCTION public.web_days(p_from date, p_to date) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $function$
DECLARE
  zone text;
  result jsonb;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not signed in' USING ERRCODE = '28000'; END IF;
  IF p_from IS NULL OR p_to IS NULL OR p_to < p_from OR p_to - p_from > 400 THEN
    RAISE EXCEPTION 'Invalid range' USING ERRCODE = '22023'; END IF;
  SELECT w.tz INTO zone FROM public.web_me() w;
  SELECT coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object('date', d.day, 'meals', d.meals,
      'kcal', coalesce(d.totals->'kcal', '0'), 'proteinG', coalesce(d.totals->'proteinG', '0'),
      'carbG', coalesce(d.totals->'carbG', '0'), 'totalFatG', coalesce(d.totals->'totalFatG', '0'),
      'fiberG', d.totals->'fiberG')) ORDER BY d.day), '[]'::jsonb)
  INTO result FROM public.nutrition_day_totals(p_from, p_to, zone) d WHERE d.foods > 0;
  RETURN result;
END;
$function$;

-- A recipe's values recomputed from its ingredients (src/userFoods/recipeRefresh.ts prices them): its nutrient
-- columns and Nutrient rows replaced in place, the previous ones backed up first. Weights and servings don't change
-- (an ingredient's grams are the recipe's). Server only.
CREATE OR REPLACE FUNCTION public.refresh_recipe_values(p_food_id integer, p_food jsonb, p_nutrients jsonb) RETURNS boolean
LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $function$
BEGIN
  IF jsonb_typeof(p_food) IS DISTINCT FROM 'object' OR jsonb_typeof(p_nutrients) IS DISTINCT FROM 'array' OR
     jsonb_array_length(p_nutrients) > 60 OR (p_food->>'kcal')::float8 IS NULL OR (p_food->>'kcal')::float8 < 0 THEN
    RAISE EXCEPTION 'Invalid recipe values' USING ERRCODE = '22023'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public."FoodItem" WHERE id = p_food_id AND "recipePortions" IS NOT NULL) THEN RETURN false; END IF;
  INSERT INTO public."CatalogueAuditBackup"(audit, "tableName", "rowId", before)
  SELECT 'recipe_values', 'RecipeValues', f.id, jsonb_build_object(
    'kcalPerServing', f."kcalPerServing", 'proteinPerServing', f."proteinPerServing", 'carbPerServing', f."carbPerServing",
    'totalFatPerServing', f."totalFatPerServing", 'fiberPerServing', f."fiberPerServing", 'sugarPerServing', f."sugarPerServing",
    'addedSugarPerServing', f."addedSugarPerServing", 'satFatPerServing', f."satFatPerServing", 'transFatPerServing', f."transFatPerServing",
    'Nutrient', (SELECT coalesce(jsonb_agg(jsonb_build_object('nutrientName', n."nutrientName", 'nutrientUnit', n."nutrientUnit",
      'nutrientAmountPerDefaultServing', n."nutrientAmountPerDefaultServing") ORDER BY n.id), '[]'::jsonb)
      FROM public."Nutrient" n WHERE n."foodItemId" = f.id))
  FROM public."FoodItem" f WHERE f.id = p_food_id;
  UPDATE public."FoodItem" SET "kcalPerServing" = (p_food->>'kcal')::float8,
    "proteinPerServing" = coalesce((p_food->>'proteinG')::float8, 0), "carbPerServing" = coalesce((p_food->>'carbG')::float8, 0),
    "totalFatPerServing" = coalesce((p_food->>'totalFatG')::float8, 0), "fiberPerServing" = (p_food->>'fiberG')::float8,
    "sugarPerServing" = (p_food->>'sugarG')::float8, "addedSugarPerServing" = (p_food->>'addedSugarG')::float8,
    "satFatPerServing" = (p_food->>'satFatG')::float8, "transFatPerServing" = (p_food->>'transFatG')::float8,
    "lastUpdated" = now()
  WHERE id = p_food_id;
  DELETE FROM public."Nutrient" WHERE "foodItemId" = p_food_id;
  INSERT INTO public."Nutrient" ("foodItemId", "nutrientName", "nutrientUnit", "nutrientAmountPerDefaultServing")
  SELECT p_food_id, n->>'name', n->>'unit', (n->>'amount')::float8 FROM jsonb_array_elements(p_nutrients) n
  WHERE (n->>'amount')::float8 >= 0;
  RETURN true;
END;
$function$;
REVOKE ALL ON FUNCTION public.refresh_recipe_values(integer, jsonb, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.refresh_recipe_values(integer, jsonb, jsonb) TO service_role;
