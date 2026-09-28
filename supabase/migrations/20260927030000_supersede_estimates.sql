-- Superseding estimates while logging (plan B5, 2026-09-27): when a verified source (USDA, a cited web page or a label
-- in the user's photo) is the same food as a catalogue estimate (GPT-era or AgentEstimate) but disagrees with it, the
-- estimate takes the source's serving weight and nutrients. Only estimate-grade foods can be superseded; verified foods
-- keep their values (a disagreeing label becomes the user's own copy instead). An agreeing source also supersedes, which
-- upgrades the estimate's provenance. The old row goes to CatalogueAuditBackup (B5_supersede) and a disagreement to
-- FoodItemConflict; logs keep their stored nutrients. Returns the food to log:
-- the superseded one, or the catalogue food that already carries the source's record.

CREATE OR REPLACE FUNCTION public.supersede_catalogue_estimate(p_food_id integer, p_food jsonb, p_servings jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $function$
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
    "satFatPerServing" = (p_food->>'satFatG')::float8,
    "foodInfoSource" = source, "externalId" = external, description = p_food->>'source', verified = (source::text = 'USDA')
  WHERE id = food.id;
  -- Barcode, servings and alias arrive through the usual enrichment, which now agrees with the food's values.
  RETURN jsonb_build_object('foodId', food.id, 'superseded', true,
    'enrichment', public.enrich_catalogue_food(food.id, p_food, p_servings));
END;
$function$;
REVOKE ALL ON FUNCTION public.supersede_catalogue_estimate(integer, jsonb, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.supersede_catalogue_estimate(integer, jsonb, jsonb) TO service_role;
NOTIFY pgrst, 'reload schema';
