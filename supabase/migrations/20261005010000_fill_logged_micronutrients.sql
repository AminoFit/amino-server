-- The vitamins and minerals backfill (docs/micronutrients-plan.md in amino-mobile): fills a logged food's empty
-- micronutrient columns, never one that has a value. Every value it fills is recorded first, so a fill can be undone
-- (set those columns back to null). The meals' change rows are written by the usual trigger, so MCP clients re-sync
-- them, and updatedAt moves, so the phone pulls the new values (and re-sends them to Apple Health).
CREATE TABLE IF NOT EXISTS public."LoggedFoodItemMicroFill"(
  id bigserial PRIMARY KEY,
  "loggedFoodItemId" integer NOT NULL,
  filled jsonb NOT NULL,
  "createdAt" timestamptz NOT NULL DEFAULT now());
ALTER TABLE public."LoggedFoodItemMicroFill" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."LoggedFoodItemMicroFill" FROM PUBLIC, anon, authenticated;
-- Foods the backfill gave vitamins and minerals: which nutrients it added (as Nutrient rows) and from where.
CREATE TABLE IF NOT EXISTS public."FoodMicroFill"(
  id bigserial PRIMARY KEY,
  "foodItemId" integer NOT NULL,
  keys text[] NOT NULL,
  source text NOT NULL,
  "createdAt" timestamptz NOT NULL DEFAULT now());
ALTER TABLE public."FoodMicroFill" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."FoodMicroFill" FROM PUBLIC, anon, authenticated;

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
  keys constant text[] := ARRAY['polyunsatFatG', 'monounsatFatG', 'waterMl', 'vitaminAMcg', 'vitaminCMg', 'vitaminDMcg',
    'vitaminEMg', 'vitaminKMcg', 'vitaminB1Mg', 'vitaminB2Mg', 'vitaminB3Mg', 'vitaminB5Mg', 'vitaminB6Mg', 'vitaminB7Mcg',
    'vitaminB9Mcg', 'vitaminB12Mcg', 'calciumMg', 'ironMg', 'magnesiumMg', 'phosphorusMg', 'potassiumMg', 'sodiumMg', 'zincMg',
    'copperMg', 'manganeseMg', 'seleniumMcg', 'iodineMcg', 'cholesterolMg', 'omega3Mg', 'omega6Mg', 'caffeineMg', 'alcoholG'];
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
      "polyunsatFatG" = coalesce(l."polyunsatFatG", (filled->>'polyunsatFatG')::float8),
      "monounsatFatG" = coalesce(l."monounsatFatG", (filled->>'monounsatFatG')::float8),
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
