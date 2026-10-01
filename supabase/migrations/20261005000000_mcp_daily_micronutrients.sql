-- MCP get_daily_summary with allNutrients: each day also totals its vitamins and minerals (docs/micronutrients-plan.md in
-- amino-mobile). A total sums the foods that have the value; foods without it add nothing.
DROP FUNCTION IF EXISTS public.mcp_daily_summary(date, date);
CREATE OR REPLACE FUNCTION public.mcp_daily_summary(p_from date, p_to date, p_all boolean DEFAULT false) RETURNS jsonb
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = '' AS $function$
  WITH tz AS (SELECT public.mcp_user_timezone() AS name),
  bounds AS (SELECT tz.name, (p_from::timestamp AT TIME ZONE tz.name) AT TIME ZONE 'UTC' AS lo,
    ((least(p_to, p_from + 365) + 1)::timestamp AT TIME ZONE tz.name) AT TIME ZONE 'UTC' AS hi FROM tz),
  meals AS (
    SELECT m.id, ((coalesce(m."consumedOn", m."createdAt")::timestamp AT TIME ZONE 'UTC') AT TIME ZONE b.name)::date AS day
    FROM public."Message" m, bounds b
    WHERE m."userId" = auth.uid() AND m."deletedAt" IS NULL AND public.mcp_is_meal(m)
      AND coalesce(m."consumedOn", m."createdAt") >= b.lo AND coalesce(m."consumedOn", m."createdAt") < b.hi),
  days AS (
    SELECT meals.day, count(DISTINCT meals.id) AS meals, sum(l.kcal) AS kcal, sum(l."proteinG") AS protein,
      sum(l."carbG") AS carb, sum(l."totalFatG") AS fat, sum(l."satFatG") AS sat_fat, sum(l."fiberG") AS fiber,
      sum(l."sugarG") AS sugar, sum(l."sodiumMg") AS sodium, sum(l."alcoholG") AS alcohol,
      sum(l."caffeineMg") AS caffeine, sum(l."waterMl") AS water
    FROM meals LEFT JOIN public."LoggedFoodItem" l ON l."messageId" = meals.id AND l."deletedAt" IS NULL
    GROUP BY meals.day),
  micro AS (
    SELECT x.day, jsonb_object_agg(x.key, pg_catalog.trim_scale(round(x.total::numeric, 2))) AS nutrients
    FROM (SELECT meals.day, kv.key, sum((kv.value #>> '{}')::float8) AS total
      FROM meals JOIN public."LoggedFoodItem" l ON l."messageId" = meals.id AND l."deletedAt" IS NULL
      CROSS JOIN LATERAL jsonb_each(to_jsonb(l)) kv
      WHERE p_all AND jsonb_typeof(kv.value) = 'number' AND kv.key = ANY(ARRAY['transFatG', 'polyunsatFatG',
        'monounsatFatG', 'addedSugarG', 'cholesterolMg', 'omega3Mg', 'omega6Mg', 'vitaminAMcg', 'vitaminCMg', 'vitaminDMcg',
        'vitaminEMg', 'vitaminKMcg', 'vitaminB1Mg', 'vitaminB2Mg', 'vitaminB3Mg', 'vitaminB5Mg', 'vitaminB6Mg', 'vitaminB7Mcg',
        'vitaminB9Mcg', 'vitaminB12Mcg', 'calciumMg', 'ironMg', 'magnesiumMg', 'phosphorusMg', 'potassiumMg', 'zincMg',
        'copperMg', 'manganeseMg', 'seleniumMcg', 'iodineMcg'])
      GROUP BY meals.day, kv.key) x
    GROUP BY x.day)
  SELECT jsonb_build_object('timezone', (SELECT name FROM tz), 'days', coalesce(jsonb_agg(jsonb_strip_nulls(
    jsonb_build_object('date', d.day, 'meals', d.meals,
      'kcal', pg_catalog.trim_scale(round(d.kcal::numeric, 1)),
      'proteinG', pg_catalog.trim_scale(round(d.protein::numeric, 1)),
      'carbG', pg_catalog.trim_scale(round(d.carb::numeric, 1)),
      'totalFatG', pg_catalog.trim_scale(round(d.fat::numeric, 1)),
      'satFatG', pg_catalog.trim_scale(round(d.sat_fat::numeric, 1)),
      'fiberG', pg_catalog.trim_scale(round(d.fiber::numeric, 1)),
      'sugarG', pg_catalog.trim_scale(round(d.sugar::numeric, 1)),
      'sodiumMg', pg_catalog.trim_scale(round(d.sodium::numeric, 0)),
      'alcoholG', pg_catalog.trim_scale(round(d.alcohol::numeric, 1)),
      'caffeineMg', pg_catalog.trim_scale(round(d.caffeine::numeric, 0)),
      'waterMl', pg_catalog.trim_scale(round(d.water::numeric, 0)),
      'nutrients', CASE WHEN p_all THEN coalesce(mi.nutrients, '{}'::jsonb) END)) ORDER BY d.day), '[]'::jsonb))
  FROM days d LEFT JOIN micro mi ON mi.day = d.day;
$function$;
REVOKE ALL ON FUNCTION public.mcp_daily_summary(date, date, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mcp_daily_summary(date, date, boolean) TO authenticated, service_role;
