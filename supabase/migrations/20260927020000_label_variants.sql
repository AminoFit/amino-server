-- Label variants (owner decision B, 2026-09-27): a label photo that disagrees with an existing shared food may be a
-- regional variant, a new recipe or a misread photo, so the shared food stays unchanged and the user gets a private
-- copy with the label's values. p_variant (with p_private) skips shared foods in the existing-food lookup, so the
-- copy is created even though a shared food has the same identity; the user's own earlier copy is still reused.
--
-- p_private creates the food for p_user_id only. Lookups for an existing food (same identity, barcode or source record)
-- see the shared catalogue plus, for a private creation, that user's own foods: a shared creation never returns or
-- enriches someone's private food, and a private one reuses a shared food that already is the same.
DROP FUNCTION IF EXISTS public.create_catalogue_food(uuid, integer, jsonb, jsonb, boolean);
CREATE OR REPLACE FUNCTION public.create_catalogue_food(p_user_id uuid, p_message_id integer, p_food jsonb, p_servings jsonb,
  p_private boolean DEFAULT false, p_variant boolean DEFAULT false)
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
    ORDER BY (code IS NOT NULL AND f.gtin = code) DESC, (f."privateToUserId" IS NULL) DESC, f.id LIMIT 1;
  IF existing IS NOT NULL THEN
    RETURN QUERY SELECT existing, false, public.enrich_catalogue_food(existing, p_food, p_servings); RETURN;
  END IF;

  INSERT INTO public."FoodItem" (name, brand, "defaultServingWeightGram", "kcalPerServing",
    "proteinPerServing", "carbPerServing", "totalFatPerServing", "fiberPerServing",
    "sugarPerServing", "satFatPerServing", "isLiquid", "userId", "messageId",
    "foodInfoSource", "externalId", gtin, "UPC", "bgeBaseEmbedding", description, verified, "privateToUserId")
  VALUES (pg_catalog.btrim(p_food->>'name'), nullif(pg_catalog.btrim(p_food->>'brand'), ''),
    (p_food->>'defaultServingWeightGram')::float8, (p_food->>'kcal')::float8,
    (p_food->>'proteinG')::float8, (p_food->>'carbG')::float8, (p_food->>'totalFatG')::float8,
    (p_food->>'fiberG')::float8, (p_food->>'sugarG')::float8, (p_food->>'satFatG')::float8,
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
REVOKE ALL ON FUNCTION public.create_catalogue_food(uuid, integer, jsonb, jsonb, boolean, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_catalogue_food(uuid, integer, jsonb, jsonb, boolean, boolean) TO service_role;
NOTIFY pgrst, 'reload schema';
