-- Nutrition consistency (amino-mobile docs/micronutrients-plan.md; the audit of how values are calculated):
--  - The nutrient keys a logged food records, once (src/nutrition/spec.ts HISTORY_NUTRIENTS; a test keeps them equal).
--  - A logged food's empty fibre, sugars and fats fill from its food too, not only vitamins and minerals.
--  - Added sugars and trans fat are kept when a catalogue food is created, enriched or supersedes an estimate.
--  - A superseded estimate's vitamin and mineral rows are backed up and removed (the source's replace them).
--  - Day totals in one place, for the web dashboard and MCP: the same meals, null-aware sums (a nutrient no food
--    records is absent, not 0) and one rounding rule.

CREATE OR REPLACE FUNCTION public.nutrition_keys() RETURNS text[]
LANGUAGE sql IMMUTABLE PARALLEL SAFE SET search_path = '' AS $function$
  SELECT ARRAY['kcal', 'totalFatG', 'satFatG', 'transFatG', 'unsatFatG', 'polyunsatFatG', 'monounsatFatG', 'carbG',
    'fiberG', 'sugarG', 'addedSugarG', 'proteinG', 'waterMl', 'vitaminAMcg', 'vitaminCMg', 'vitaminDMcg',
    'vitaminEMg', 'vitaminKMcg', 'vitaminB1Mg', 'vitaminB2Mg', 'vitaminB3Mg', 'vitaminB5Mg', 'vitaminB6Mg',
    'vitaminB7Mcg', 'vitaminB9Mcg', 'vitaminB12Mcg', 'calciumMg', 'ironMg', 'magnesiumMg', 'phosphorusMg',
    'potassiumMg', 'sodiumMg', 'zincMg', 'copperMg', 'manganeseMg', 'seleniumMcg', 'iodineMcg',
    'cholesterolMg', 'omega3Mg', 'omega6Mg', 'caffeineMg', 'alcoholG'];
$function$;
-- Every key but energy and the three macros, which a logged food always has.
CREATE OR REPLACE FUNCTION public.nutrition_fill_keys() RETURNS text[]
LANGUAGE sql IMMUTABLE PARALLEL SAFE SET search_path = '' AS $function$
  SELECT array_agg(k ORDER BY n) FROM unnest(public.nutrition_keys()) WITH ORDINALITY AS t(k, n)
  WHERE k NOT IN ('kcal', 'proteinG', 'carbG', 'totalFatG');
$function$;

-- One rounding rule for totals: kcal and mL whole; grams to 0.1; mg and µg to three significant figures (2.43 µg
-- of B12, 0.91 mg of copper, 2,310 mg of sodium).
CREATE OR REPLACE FUNCTION public.nutrition_round(p_key text, p_value float8) RETURNS numeric
LANGUAGE sql IMMUTABLE PARALLEL SAFE SET search_path = '' AS $function$
  SELECT CASE
    WHEN p_value IS NULL OR p_value = 'NaN'::float8 OR p_value IN ('Infinity'::float8, '-Infinity'::float8) THEN NULL
    WHEN p_key = 'kcal' OR p_key LIKE '%Ml' THEN round(p_value::numeric)
    WHEN p_key LIKE '%G' THEN pg_catalog.trim_scale(round(p_value::numeric, 1))
    WHEN abs(p_value) < 0.0005 THEN 0
    ELSE pg_catalog.trim_scale(round(p_value::numeric, greatest(0, least(3, 2 - floor(log(abs(p_value)))::int))))
  END;
$function$;

-- The signed-in user's meals per local day in [p_from, p_to] (the meals MCP counts: mcp_is_meal), with how many
-- foods were logged and each nutrient summed over the foods that record it. Callers bound the range.
CREATE OR REPLACE FUNCTION public.nutrition_day_totals(p_from date, p_to date, p_zone text)
RETURNS TABLE(day date, meals integer, foods integer, totals jsonb)
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
    SELECT i.day, kv.key, sum((kv.value #>> '{}')::float8) AS total
    FROM items i CROSS JOIN LATERAL jsonb_each(to_jsonb(i)) kv
    WHERE kv.key = ANY(public.nutrition_keys()) AND jsonb_typeof(kv.value) = 'number'
    GROUP BY i.day, kv.key)
  SELECT d.day, d.meals,
    (SELECT count(*) FROM items i WHERE i.day = d.day)::integer,
    coalesce((SELECT jsonb_object_agg(s.key, public.nutrition_round(s.key, s.total)) FROM sums s WHERE s.day = d.day), '{}'::jsonb)
  FROM (SELECT meals.day, count(*)::integer AS meals FROM meals GROUP BY meals.day) d
  ORDER BY d.day;
$function$;
REVOKE ALL ON FUNCTION public.nutrition_day_totals(date, date, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.nutrition_day_totals(date, date, text) TO authenticated, service_role;

-- MCP get_daily_summary: the core totals, and with p_all every other nutrient under "nutrients".
CREATE OR REPLACE FUNCTION public.mcp_daily_summary(p_from date, p_to date, p_all boolean DEFAULT false) RETURNS jsonb
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = '' AS $function$
  WITH tz AS (SELECT public.mcp_user_timezone() AS name),
  core AS (SELECT ARRAY['kcal', 'proteinG', 'carbG', 'totalFatG', 'satFatG', 'fiberG', 'sugarG', 'sodiumMg', 'alcoholG',
    'caffeineMg', 'waterMl'] AS keys)
  SELECT jsonb_build_object('timezone', (SELECT name FROM tz), 'days', coalesce(jsonb_agg(
    jsonb_build_object('date', d.day, 'meals', d.meals)
      || (SELECT coalesce(jsonb_object_agg(e.key, e.value), '{}'::jsonb) FROM jsonb_each(d.totals) e, core WHERE e.key = ANY(core.keys))
      || CASE WHEN p_all THEN jsonb_build_object('nutrients',
        (SELECT coalesce(jsonb_object_agg(e.key, e.value), '{}'::jsonb) FROM jsonb_each(d.totals) e, core WHERE NOT e.key = ANY(core.keys)))
        ELSE '{}'::jsonb END
    ORDER BY d.day), '[]'::jsonb))
  FROM public.nutrition_day_totals(p_from, least(p_to, p_from + 365), (SELECT name FROM tz)) d;
$function$;

-- The web dashboard's days: those with food logged, energy and macros (always recorded) and fibre when known.
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

-- Logged foods' empty nutrients fill from their food: every nutrient but energy and the macros (fibre, sugars and
-- fats too, so a food corrected to know its sugar passes it to its logs).
-- p_rows: [{"id": <LoggedFoodItem id>, "values": {"magnesiumMg": 31.9, ...}}], at most 500. Returns the rows changed.
CREATE OR REPLACE FUNCTION public.fill_logged_micronutrients(p_rows jsonb) RETURNS integer
LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $function$
DECLARE
  item jsonb;
  v jsonb;
  changed integer := 0;
  filled jsonb;
  current_row public."LoggedFoodItem"%ROWTYPE;
  key text;
  keys constant text[] := public.nutrition_fill_keys();
BEGIN
  IF jsonb_typeof(p_rows) IS DISTINCT FROM 'array' OR jsonb_array_length(p_rows) > 500 THEN
    RAISE EXCEPTION 'invalid_rows' USING ERRCODE = '22023';
  END IF;
  -- This is a sanctioned write to operation-owned meals, for this transaction only.
  PERFORM pg_catalog.set_config('app.meal_operation_write', 'true', true);
  FOR item IN SELECT value FROM jsonb_array_elements(p_rows) LOOP
    v := item->'values';
    SELECT * INTO current_row FROM public."LoggedFoodItem" WHERE id = (item->>'id')::integer AND "deletedAt" IS NULL FOR UPDATE;
    IF NOT FOUND OR jsonb_typeof(v) IS DISTINCT FROM 'object' THEN CONTINUE; END IF;
    -- Only keys that are empty on the row now and have a finite, non-negative value.
    SELECT coalesce(jsonb_object_agg(e.key, e.value), '{}'::jsonb) INTO filled
    FROM jsonb_each(v) e
    WHERE e.key = ANY(keys) AND jsonb_typeof(e.value) = 'number' AND (e.value #>> '{}')::float8 >= 0
      AND to_jsonb(current_row)->e.key = 'null'::jsonb;
    IF filled = '{}'::jsonb THEN CONTINUE; END IF;
    INSERT INTO public."LoggedFoodItemMicroFill"("loggedFoodItemId", filled) VALUES (current_row.id, filled);
    UPDATE public."LoggedFoodItem" l SET
      "satFatG" = coalesce(l."satFatG", (filled->>'satFatG')::float8),
      "transFatG" = coalesce(l."transFatG", (filled->>'transFatG')::float8),
      "unsatFatG" = coalesce(l."unsatFatG", (filled->>'unsatFatG')::float8),
      "polyunsatFatG" = coalesce(l."polyunsatFatG", (filled->>'polyunsatFatG')::float8),
      "monounsatFatG" = coalesce(l."monounsatFatG", (filled->>'monounsatFatG')::float8),
      "fiberG" = coalesce(l."fiberG", (filled->>'fiberG')::float8),
      "sugarG" = coalesce(l."sugarG", (filled->>'sugarG')::float8),
      "addedSugarG" = coalesce(l."addedSugarG", (filled->>'addedSugarG')::float8),
      "waterMl" = coalesce(l."waterMl", (filled->>'waterMl')::float8),
      "vitaminAMcg" = coalesce(l."vitaminAMcg", (filled->>'vitaminAMcg')::float8),
      "vitaminCMg" = coalesce(l."vitaminCMg", (filled->>'vitaminCMg')::float8),
      "vitaminDMcg" = coalesce(l."vitaminDMcg", (filled->>'vitaminDMcg')::float8),
      "vitaminEMg" = coalesce(l."vitaminEMg", (filled->>'vitaminEMg')::float8),
      "vitaminKMcg" = coalesce(l."vitaminKMcg", (filled->>'vitaminKMcg')::float8),
      "vitaminB1Mg" = coalesce(l."vitaminB1Mg", (filled->>'vitaminB1Mg')::float8),
      "vitaminB2Mg" = coalesce(l."vitaminB2Mg", (filled->>'vitaminB2Mg')::float8),
      "vitaminB3Mg" = coalesce(l."vitaminB3Mg", (filled->>'vitaminB3Mg')::float8),
      "vitaminB5Mg" = coalesce(l."vitaminB5Mg", (filled->>'vitaminB5Mg')::float8),
      "vitaminB6Mg" = coalesce(l."vitaminB6Mg", (filled->>'vitaminB6Mg')::float8),
      "vitaminB7Mcg" = coalesce(l."vitaminB7Mcg", (filled->>'vitaminB7Mcg')::float8),
      "vitaminB9Mcg" = coalesce(l."vitaminB9Mcg", (filled->>'vitaminB9Mcg')::float8),
      "vitaminB12Mcg" = coalesce(l."vitaminB12Mcg", (filled->>'vitaminB12Mcg')::float8),
      "calciumMg" = coalesce(l."calciumMg", (filled->>'calciumMg')::float8),
      "ironMg" = coalesce(l."ironMg", (filled->>'ironMg')::float8),
      "magnesiumMg" = coalesce(l."magnesiumMg", (filled->>'magnesiumMg')::float8),
      "phosphorusMg" = coalesce(l."phosphorusMg", (filled->>'phosphorusMg')::float8),
      "potassiumMg" = coalesce(l."potassiumMg", (filled->>'potassiumMg')::float8),
      "sodiumMg" = coalesce(l."sodiumMg", (filled->>'sodiumMg')::float8),
      "zincMg" = coalesce(l."zincMg", (filled->>'zincMg')::float8),
      "copperMg" = coalesce(l."copperMg", (filled->>'copperMg')::float8),
      "manganeseMg" = coalesce(l."manganeseMg", (filled->>'manganeseMg')::float8),
      "seleniumMcg" = coalesce(l."seleniumMcg", (filled->>'seleniumMcg')::float8),
      "iodineMcg" = coalesce(l."iodineMcg", (filled->>'iodineMcg')::float8),
      "cholesterolMg" = coalesce(l."cholesterolMg", (filled->>'cholesterolMg')::float8),
      "omega3Mg" = coalesce(l."omega3Mg", (filled->>'omega3Mg')::float8),
      "omega6Mg" = coalesce(l."omega6Mg", (filled->>'omega6Mg')::float8),
      "caffeineMg" = coalesce(l."caffeineMg", (filled->>'caffeineMg')::float8),
      "alcoholG" = coalesce(l."alcoholG", (filled->>'alcoholG')::float8)
    WHERE l.id = current_row.id;
    changed := changed + 1;
  END LOOP;
  RETURN changed;
END;
$function$;
REVOKE ALL ON FUNCTION public.fill_logged_micronutrients(jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fill_logged_micronutrients(jsonb) TO service_role;

CREATE OR REPLACE FUNCTION public.create_catalogue_food(p_user_id uuid, p_message_id integer, p_food jsonb, p_servings jsonb, p_private boolean DEFAULT false, p_variant boolean DEFAULT false)
 RETURNS TABLE(food_id integer, created boolean, enrichment jsonb)
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE
  identity text := public.food_identity_key(p_food->>'name', p_food->>'brand');
  source public."FoodInfoSource" := coalesce(p_food->>'foodInfoSource','Online')::public."FoodInfoSource";
  external text := nullif(pg_catalog.btrim(p_food->>'externalId'), '');
  code text := public.gtin14(p_food->>'gtin');
  owner uuid := CASE WHEN p_private THEN p_user_id END;
  existing integer;
  inserted integer;
BEGIN
  IF length(public.food_identity_part(p_food->>'name')) < 2 OR
     coalesce((p_food->>'defaultServingWeightGram')::float8, 0) <= 0 OR
     jsonb_typeof(p_servings) IS DISTINCT FROM 'array' OR jsonb_array_length(p_servings) > 10
  THEN RAISE EXCEPTION 'Invalid catalogue food' USING ERRCODE = '22023'; END IF;
  IF p_private AND p_user_id IS NULL THEN RAISE EXCEPTION 'A private food needs its owner' USING ERRCODE = '22023'; END IF;

  -- Serialize creators of the same identity (and barcode) so two workers cannot both insert.
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(identity || coalesce(':' || owner::text, ''), 0));
  IF code IS NOT NULL THEN PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('gtin:'||code, 0)); END IF;
  SELECT f.id INTO existing FROM public."FoodItem" f
    WHERE ((code IS NOT NULL AND f.gtin = code)
       OR public.food_identity_key(f.name, f.brand) = identity
       OR (external IS NOT NULL AND f."externalId" = external AND f."foodInfoSource" = source))
      AND ((f."privateToUserId" IS NULL AND NOT (p_private AND p_variant)) OR f."privateToUserId" = owner)
      AND f."archivedAt" IS NULL AND f."recipePortions" IS NULL
    ORDER BY (code IS NOT NULL AND f.gtin = code) DESC, (f."privateToUserId" IS NULL) DESC, f.id LIMIT 1;
  IF existing IS NOT NULL THEN
    RETURN QUERY SELECT existing, false, public.enrich_catalogue_food(existing, p_food, p_servings); RETURN;
  END IF;

  INSERT INTO public."FoodItem" (name, brand, "defaultServingWeightGram", "kcalPerServing",
    "proteinPerServing", "carbPerServing", "totalFatPerServing", "fiberPerServing",
    "sugarPerServing", "satFatPerServing", "addedSugarPerServing", "transFatPerServing", "isLiquid", "userId", "messageId",
    "foodInfoSource", "externalId", gtin, "UPC", "bgeBaseEmbedding", description, verified, "privateToUserId")
  VALUES (pg_catalog.btrim(p_food->>'name'), nullif(pg_catalog.btrim(p_food->>'brand'), ''),
    (p_food->>'defaultServingWeightGram')::float8, (p_food->>'kcal')::float8,
    (p_food->>'proteinG')::float8, (p_food->>'carbG')::float8, (p_food->>'totalFatG')::float8,
    (p_food->>'fiberG')::float8, (p_food->>'sugarG')::float8, (p_food->>'satFatG')::float8,
    (p_food->>'addedSugarG')::float8, (p_food->>'transFatG')::float8,
    coalesce((p_food->>'isLiquid')::boolean, false), p_user_id, p_message_id,
    source, external, code, code::bigint, (p_food->>'bgeBaseEmbedding')::extensions.vector,
    p_food->>'source', source = 'USDA', owner)
  RETURNING id INTO inserted;

  INSERT INTO public."Serving" ("foodItemId", "servingName", "servingWeightGram", "defaultServingAmount")
  SELECT inserted, pg_catalog.btrim(s->>'name'), (s->>'grams')::float8, coalesce(nullif((s->>'amount')::numeric,0),1)
    FROM jsonb_array_elements(p_servings) s
    WHERE length(pg_catalog.btrim(coalesce(s->>'name',''))) > 0 AND (s->>'grams')::float8 > 0;

  RETURN QUERY SELECT inserted, true, NULL::jsonb;
END;
$function$;

CREATE OR REPLACE FUNCTION public.enrich_catalogue_food(p_food_id integer, p_food jsonb, p_servings jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE
  food public."FoodItem"%ROWTYPE;
  code text := public.gtin14(p_food->>'gtin');
  grams float8 := (p_food->>'defaultServingWeightGram')::float8;
  existing_density float8; proposed_density float8;
  added text[] := ARRAY[]::text[];
  serving jsonb; serving_count integer; alias text := pg_catalog.btrim(p_food->>'name');
BEGIN
  SELECT * INTO food FROM public."FoodItem" WHERE id=p_food_id FOR UPDATE;
  IF food.id IS NULL THEN RAISE EXCEPTION 'Catalogue food unavailable' USING ERRCODE='42704'; END IF;
  IF coalesce(grams,0)>0 AND coalesce(food."defaultServingWeightGram",0)>0 AND (p_food->>'kcal') IS NOT NULL THEN
    existing_density := food."kcalPerServing"/food."defaultServingWeightGram"*100;
    proposed_density := (p_food->>'kcal')::float8/grams*100;
    -- Disagreeing energy density means the match or the source is wrong: record, change nothing.
    IF abs(existing_density-proposed_density) > greatest(10, 0.10*greatest(existing_density,proposed_density)) THEN
      INSERT INTO public."FoodItemConflict"("foodItemId",source,existing,proposed)
      VALUES (food.id, coalesce(p_food->>'source','unknown'),
        jsonb_build_object('kcalPer100g',existing_density,'name',food.name,'brand',food.brand),
        p_food || jsonb_build_object('kcalPer100g',proposed_density));
      RETURN jsonb_build_object('foodId',food.id,'added',to_jsonb(added),'conflict',true);
    END IF;
  END IF;
  IF code IS NOT NULL AND food.gtin IS NULL AND NOT EXISTS
      (SELECT 1 FROM public."FoodItem" other WHERE other.gtin=code AND other.id<>food.id) THEN
    UPDATE public."FoodItem" SET gtin=code,"UPC"=coalesce("UPC",code::bigint) WHERE id=food.id;
    added := pg_catalog.array_append(added, 'gtin');
  END IF;
  -- Fill only empty optional nutrients, scaled to this food's serving basis.
  IF coalesce(grams,0)>0 AND coalesce(food."defaultServingWeightGram",0)>0 THEN
    UPDATE public."FoodItem" SET
      "fiberPerServing"=coalesce("fiberPerServing",(p_food->>'fiberG')::float8*food."defaultServingWeightGram"/grams),
      "sugarPerServing"=coalesce("sugarPerServing",(p_food->>'sugarG')::float8*food."defaultServingWeightGram"/grams),
      "satFatPerServing"=coalesce("satFatPerServing",(p_food->>'satFatG')::float8*food."defaultServingWeightGram"/grams),
      "addedSugarPerServing"=coalesce("addedSugarPerServing",(p_food->>'addedSugarG')::float8*food."defaultServingWeightGram"/grams),
      "transFatPerServing"=coalesce("transFatPerServing",(p_food->>'transFatG')::float8*food."defaultServingWeightGram"/grams)
    WHERE id=food.id AND (("fiberPerServing" IS NULL AND p_food->>'fiberG' IS NOT NULL)
      OR ("sugarPerServing" IS NULL AND p_food->>'sugarG' IS NOT NULL)
      OR ("satFatPerServing" IS NULL AND p_food->>'satFatG' IS NOT NULL)
      OR ("addedSugarPerServing" IS NULL AND p_food->>'addedSugarG' IS NOT NULL)
      OR ("transFatPerServing" IS NULL AND p_food->>'transFatG' IS NOT NULL));
    IF FOUND THEN added := pg_catalog.array_append(added, 'nutrients'); END IF;
  END IF;
  SELECT count(*) INTO serving_count FROM public."Serving" WHERE "foodItemId"=food.id;
  FOR serving IN SELECT * FROM jsonb_array_elements(coalesce(p_servings,'[]'::jsonb)) LOOP
    EXIT WHEN serving_count>=30;
    CONTINUE WHEN length(pg_catalog.btrim(coalesce(serving->>'name','')))=0 OR coalesce((serving->>'grams')::float8,0)<=0;
    -- Same unit name, or the same weight for the same amount, is the serving it already has.
    CONTINUE WHEN EXISTS (SELECT 1 FROM public."Serving" s WHERE s."foodItemId"=food.id AND
      (public.food_identity_part(s."servingName")=public.food_identity_part(serving->>'name') OR
       (abs(s."servingWeightGram"-(serving->>'grams')::float8) <= 0.02*greatest(s."servingWeightGram",(serving->>'grams')::float8)
        AND coalesce(s."defaultServingAmount",1)=coalesce(nullif((serving->>'amount')::numeric,0),1))));
    INSERT INTO public."Serving"("foodItemId","servingName","servingWeightGram","defaultServingAmount")
    VALUES (food.id, pg_catalog.btrim(serving->>'name'), (serving->>'grams')::float8,
      coalesce(nullif((serving->>'amount')::numeric,0),1));
    serving_count := serving_count+1; added := pg_catalog.array_append(added, ('serving:'||pg_catalog.btrim(serving->>'name')));
  END LOOP;
  IF alias IS NOT NULL AND public.food_identity_part(alias)<>public.food_identity_part(food.name) AND
     NOT EXISTS (SELECT 1 FROM pg_catalog.unnest(coalesce(food."knownAs",ARRAY[]::text[])) a
       WHERE public.food_identity_part(a)=public.food_identity_part(alias)) AND
     coalesce(array_length(food."knownAs",1),0)<10 THEN
    UPDATE public."FoodItem" SET "knownAs"=coalesce("knownAs",ARRAY[]::text[]) || alias WHERE id=food.id;
    added := pg_catalog.array_append(added, 'alias');
  END IF;
  RETURN jsonb_build_object('foodId',food.id,'added',to_jsonb(added),'conflict',false);
END;
$function$;

CREATE OR REPLACE FUNCTION public.supersede_catalogue_estimate(p_food_id integer, p_food jsonb, p_servings jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE
  food public."FoodItem"%ROWTYPE;
  source public."FoodInfoSource" := (p_food->>'foodInfoSource')::public."FoodInfoSource";
  external text := nullif(pg_catalog.btrim(p_food->>'externalId'), '');
  grams float8 := (p_food->>'defaultServingWeightGram')::float8;
  twin integer;
BEGIN
  IF source::text NOT IN ('USDA', 'Online', 'Label') OR coalesce(grams, 0) <= 0 OR (p_food->>'kcal') IS NULL THEN
    RAISE EXCEPTION 'Only a verified source with a serving can supersede an estimate' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO food FROM public."FoodItem" WHERE id = p_food_id FOR UPDATE;
  IF food.id IS NULL THEN RAISE EXCEPTION 'Catalogue food unavailable' USING ERRCODE = '42704'; END IF;
  IF food."foodInfoSource"::text NOT IN ('GPT4', 'AgentEstimate') THEN
    RETURN jsonb_build_object('foodId', food.id, 'superseded', false, 'reason', 'not_an_estimate');
  END IF;
  -- A private food is the user's own (their recipe or their label's values): a shared source never overwrites it.
  IF food."privateToUserId" IS NOT NULL THEN
    RETURN jsonb_build_object('foodId', food.id, 'superseded', false, 'reason', 'private_food');
  END IF;
  -- A source record already in the catalogue as another food is that food.
  IF external IS NOT NULL THEN
    SELECT f.id INTO twin FROM public."FoodItem" f
    WHERE f."externalId" = external AND f."foodInfoSource" = source AND f.id <> food.id
      AND (f."privateToUserId" IS NULL OR f."privateToUserId" = food."privateToUserId") LIMIT 1;
    IF twin IS NOT NULL THEN RETURN jsonb_build_object('foodId', twin, 'superseded', false, 'reason', 'source_is_another_food'); END IF;
  END IF;

  INSERT INTO public."CatalogueAuditBackup"(audit, "tableName", "rowId", before)
  VALUES ('B5_supersede', 'FoodItem', food.id, to_jsonb(food) - 'bgeBaseEmbedding');
  -- A disagreement (energy density more than 10% apart) is recorded; an agreeing source only upgrades provenance.
  IF abs(food."kcalPerServing" / nullif(food."defaultServingWeightGram", 0) * 100 - (p_food->>'kcal')::float8 / grams * 100)
       > greatest(5, 0.10 * (p_food->>'kcal')::float8 / grams * 100) OR food."kcalPerServing" IS NULL OR coalesce(food."defaultServingWeightGram", 0) <= 0 THEN
  INSERT INTO public."FoodItemConflict"("foodItemId", source, existing, proposed)
  VALUES (food.id, coalesce(p_food->>'source', source::text),
    jsonb_build_object('kcalPer100g', food."kcalPerServing" / nullif(food."defaultServingWeightGram", 0) * 100, 'grams', food."defaultServingWeightGram",
      'name', food.name, 'source', food."foodInfoSource"),
    jsonb_build_object('kcalPer100g', (p_food->>'kcal')::float8 / grams * 100, 'grams', grams, 'name', p_food->>'name',
      'resolution', 'estimate superseded while logging (B5)'));
  END IF;
  UPDATE public."FoodItem" SET
    "defaultServingWeightGram" = grams, "weightUnknown" = false,
    "kcalPerServing" = (p_food->>'kcal')::float8, "proteinPerServing" = (p_food->>'proteinG')::float8,
    "carbPerServing" = (p_food->>'carbG')::float8, "totalFatPerServing" = (p_food->>'totalFatG')::float8,
    "fiberPerServing" = (p_food->>'fiberG')::float8, "sugarPerServing" = (p_food->>'sugarG')::float8,
    "satFatPerServing" = (p_food->>'satFatG')::float8, "addedSugarPerServing" = (p_food->>'addedSugarG')::float8,
    "transFatPerServing" = (p_food->>'transFatG')::float8,
    "foodInfoSource" = source, "externalId" = external, description = p_food->>'source', verified = (source::text = 'USDA')
  WHERE id = food.id;
  -- The estimate's vitamins and minerals were estimated too: backed up and removed, so the source's fill them
  -- (fillMicros runs after this) instead of the estimate's surviving beside the source's values.
  INSERT INTO public."CatalogueAuditBackup"(audit, "tableName", "rowId", before)
  SELECT 'B5_supersede', 'Nutrient', n.id, to_jsonb(n) FROM public."Nutrient" n WHERE n."foodItemId" = food.id;
  DELETE FROM public."Nutrient" WHERE "foodItemId" = food.id;
  -- Barcode, servings and alias arrive through the usual enrichment, which now agrees with the food's values.
  RETURN jsonb_build_object('foodId', food.id, 'superseded', true,
    'enrichment', public.enrich_catalogue_food(food.id, p_food, p_servings));
END;
$function$;
