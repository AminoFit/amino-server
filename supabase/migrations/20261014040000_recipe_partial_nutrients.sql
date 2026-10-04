-- Recipes keep which nutrients only some of their ingredients record (owner's agent audit F1, 2026-10-04). A recipe's
-- values are its ingredients' sum, so beef without B12 in a bowl of rice and broccoli made the bowl's B12 a plain 0,
-- and a day of that bowl showed 0 µg with no warning. FoodItem."partialNutrients" ({"vitaminB12Mcg": [7, 10]}:
-- ingredients that record it, ingredients) is set when a recipe is saved or recomputed. Day totals still add a
-- recipe's partial values, but the recipe no longer counts as recording them, so the day says the total is partial;
-- a meal's foods say which of their values are partial, and the meal which totals are.
SET TimeZone = 'UTC';

ALTER TABLE public."FoodItem" ADD COLUMN IF NOT EXISTS "partialNutrients" jsonb;
COMMENT ON COLUMN public."FoodItem"."partialNutrients" IS 'Recipes: nutrients only some ingredients record, as [recording, ingredients].';

CREATE OR REPLACE FUNCTION public.nutrition_day_totals(p_from date, p_to date, p_zone text)
RETURNS TABLE(day date, meals integer, foods integer, totals jsonb, coverage jsonb)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = '' AS $function$
  WITH meals AS (
    SELECT m.id, ((coalesce(m."consumedOn", m."createdAt") AT TIME ZONE 'UTC') AT TIME ZONE p_zone)::date AS day
    FROM public."Message" m
    WHERE m."userId" = auth.uid() AND m."deletedAt" IS NULL AND public.mcp_is_meal(m)
      AND coalesce(m."consumedOn", m."createdAt") >= (p_from::timestamp AT TIME ZONE p_zone) AT TIME ZONE 'UTC'
      AND coalesce(m."consumedOn", m."createdAt") < ((p_to + 1)::timestamp AT TIME ZONE p_zone) AT TIME ZONE 'UTC'),
  items AS (
    SELECT meals.day, l.*, f."partialNutrients" AS partial_nutrients FROM meals
    JOIN public."LoggedFoodItem" l ON l."messageId" = meals.id AND l."deletedAt" IS NULL
    LEFT JOIN public."FoodItem" f ON f.id = l."foodItemId"),
  sums AS (
    -- A recipe that knows a nutrient from only some ingredients adds to the total but doesn't count as recording it.
    SELECT i.day, kv.key, sum((kv.value #>> '{}')::float8) AS total,
      count(*) FILTER (WHERE NOT coalesce(i.partial_nutrients ? kv.key, false)) AS known
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

CREATE OR REPLACE FUNCTION public.mcp_meal_json(m public."Message", p_tz text, p_all boolean) RETURNS jsonb
LANGUAGE sql STABLE SET search_path = '' AS $function$
  WITH keys AS (
    SELECT key, ord FROM unnest(CASE WHEN p_all THEN ARRAY['kcal', 'proteinG', 'carbG', 'totalFatG', 'satFatG',
      'transFatG', 'unsatFatG', 'polyunsatFatG', 'monounsatFatG', 'fiberG', 'sugarG', 'addedSugarG', 'waterMl',
      'vitaminAMcg', 'vitaminCMg', 'vitaminDMcg', 'vitaminEMg', 'vitaminKMcg', 'vitaminB1Mg', 'vitaminB2Mg',
      'vitaminB3Mg', 'vitaminB5Mg', 'vitaminB6Mg', 'vitaminB7Mcg', 'vitaminB9Mcg', 'vitaminB12Mcg', 'calciumMg',
      'ironMg', 'magnesiumMg', 'phosphorusMg', 'potassiumMg', 'sodiumMg', 'zincMg', 'copperMg', 'manganeseMg',
      'seleniumMcg', 'iodineMcg', 'cholesterolMg', 'omega3Mg', 'omega6Mg', 'caffeineMg', 'alcoholG']
      ELSE ARRAY['kcal', 'proteinG', 'carbG', 'totalFatG', 'satFatG', 'fiberG', 'sugarG', 'sodiumMg'] END)
      WITH ORDINALITY AS k(key, ord)
  ), foods AS (
    SELECT l.id, l."foodItemId" AS food_id, f.name, f.brand, l."servingAmount" AS amount,
      coalesce(l."loggedUnit", s."servingName") AS unit, l.grams, to_jsonb(l) AS row, f."partialNutrients" AS partial
    FROM public."LoggedFoodItem" l
    LEFT JOIN public."FoodItem" f ON f.id = l."foodItemId"
    LEFT JOIN public."Serving" s ON s.id = l."servingId"
    WHERE l."messageId" = m.id AND l."deletedAt" IS NULL
  ), eaten AS (
    SELECT coalesce(m."consumedOn", m."createdAt")::timestamp AS utc
  )
  SELECT jsonb_strip_nulls(jsonb_build_object(
    'id', m.id,
    'eatenAt', to_char(e.utc, 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
    'localDate', to_char((e.utc AT TIME ZONE 'UTC') AT TIME ZONE p_tz, 'YYYY-MM-DD'),
    'localTime', to_char((e.utc AT TIME ZONE 'UTC') AT TIME ZONE p_tz, 'HH24:MI'),
    'text', nullif(btrim(m.content), ''),
    'input', CASE WHEN m."agentClientId" IS NOT NULL THEN 'agent'
      WHEN m.hasimages THEN CASE WHEN btrim(coalesce(m.content, '')) <> '' THEN 'photo+text' ELSE 'photo' END
      WHEN m."isAudio" THEN 'voice' ELSE 'text' END,
    'loggedBy', CASE WHEN m."agentClientId" IS NOT NULL THEN coalesce(m."agentName", 'an AI agent') END,
    'status', CASE m.status::text WHEN 'RESOLVED' THEN 'logged' WHEN 'FAILED' THEN 'failed' ELSE 'processing' END,
    'totals', (SELECT jsonb_object_agg(t.key, t.total ORDER BY t.ord) FROM (
        SELECT k.key, k.ord, pg_catalog.trim_scale(round(sum((f.row->>k.key)::numeric), 2)) AS total
        FROM keys k CROSS JOIN foods f GROUP BY k.key, k.ord) t WHERE t.total IS NOT NULL),
    'items', coalesce((SELECT jsonb_agg(jsonb_strip_nulls(jsonb_build_object('id', f.id, 'foodId', f.food_id, 'food', f.name,
        'brand', f.brand, 'amount', f.amount, 'unit', f.unit, 'grams', pg_catalog.trim_scale(round(f.grams::numeric, 1))))
        || coalesce((SELECT jsonb_object_agg(k.key, pg_catalog.trim_scale(round((f.row->>k.key)::numeric, 2))
          ORDER BY k.ord) FROM keys k WHERE f.row->>k.key IS NOT NULL), '{}'::jsonb)
        -- A recipe's values that only some of its ingredients record: lower bounds, not the food's amount.
        || coalesce((SELECT jsonb_build_object('partial', jsonb_object_agg(k.key,
            (f.partial->k.key->>0) || ' of ' || (f.partial->k.key->>1) || ' ingredients' ORDER BY k.ord))
          FROM keys k WHERE f.row->>k.key IS NOT NULL AND f.partial ? k.key HAVING count(*) > 0), '{}'::jsonb)
      ORDER BY f.id) FROM foods f), '[]'::jsonb),
    -- The meal's totals that only some of its foods (or their ingredients) record.
    'incomplete', (SELECT jsonb_object_agg(k.key, c.known || ' of ' || c.total || ' foods') FROM keys k
        CROSS JOIN LATERAL (SELECT count(*) AS total,
          count(*) FILTER (WHERE f.row->>k.key IS NOT NULL AND NOT coalesce(f.partial ? k.key, false)) AS known,
          count(*) FILTER (WHERE f.row->>k.key IS NOT NULL) AS shown FROM foods f) c
        WHERE c.shown > 0 AND c.known < c.total)))
  FROM eaten e;
$function$;
