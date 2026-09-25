-- Barcodes as normalised GTIN-14 text, and enrichment instead of duplication:
-- when a "new" food already exists, it gains the missing barcode, servings,
-- aliases and empty nutrients, and never has its calories or macros overwritten.

-- Leading zeros never change a GTIN check digit, so padding recovers codes that
-- lost them in the numeric UPC column.
CREATE OR REPLACE FUNCTION public.gtin14(p_code text) RETURNS text
LANGUAGE plpgsql IMMUTABLE PARALLEL SAFE SET search_path = '' AS $function$
DECLARE digits text := pg_catalog.regexp_replace(coalesce(p_code,''),'\D','','g'); total integer := 0; i integer;
BEGIN
  IF length(digits) NOT BETWEEN 8 AND 14 THEN RETURN NULL; END IF;
  digits := pg_catalog.lpad(digits,14,'0');
  FOR i IN 1..13 LOOP
    total := total + substr(digits,i,1)::integer * CASE WHEN i % 2 = 1 THEN 3 ELSE 1 END;
  END LOOP;
  IF (10 - total % 10) % 10 <> substr(digits,14,1)::integer THEN RETURN NULL; END IF;
  RETURN digits;
END;
$function$;

ALTER TABLE public."FoodItem" ADD COLUMN IF NOT EXISTS gtin text;
UPDATE public."FoodItem" SET gtin=public.gtin14("UPC"::text) WHERE "UPC" IS NOT NULL AND gtin IS NULL;
-- Not unique yet: ~285 legacy duplicate groups await a reviewed merge. Uniqueness
-- is enforced by the functions below until then.
CREATE INDEX IF NOT EXISTS "FoodItem_gtin_idx" ON public."FoodItem"(gtin) WHERE gtin IS NOT NULL;
CREATE INDEX IF NOT EXISTS "Serving_foodItemId_idx" ON public."Serving"("foodItemId");

CREATE TABLE IF NOT EXISTS public."FoodItemConflict" (
  id bigserial PRIMARY KEY,
  "foodItemId" integer NOT NULL REFERENCES public."FoodItem"(id) ON DELETE CASCADE,
  source text NOT NULL,
  existing jsonb NOT NULL,
  proposed jsonb NOT NULL,
  "createdAt" timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public."FoodItemConflict" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."FoodItemConflict" FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT ON public."FoodItemConflict" TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public."FoodItemConflict_id_seq" TO service_role;

CREATE OR REPLACE FUNCTION public.enrich_catalogue_food(p_food_id integer, p_food jsonb, p_servings jsonb)
RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $function$
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
      "satFatPerServing"=coalesce("satFatPerServing",(p_food->>'satFatG')::float8*food."defaultServingWeightGram"/grams)
    WHERE id=food.id AND (("fiberPerServing" IS NULL AND p_food ? 'fiberG') OR ("sugarPerServing" IS NULL AND p_food ? 'sugarG')
      OR ("satFatPerServing" IS NULL AND p_food ? 'satFatG'));
    IF FOUND THEN added := pg_catalog.array_append(added, 'nutrients'); END IF;
  END IF;
  SELECT count(*) INTO serving_count FROM public."Serving" WHERE "foodItemId"=food.id;
  FOR serving IN SELECT * FROM jsonb_array_elements(coalesce(p_servings,'[]'::jsonb)) LOOP
    EXIT WHEN serving_count>=30;
    CONTINUE WHEN length(pg_catalog.btrim(coalesce(serving->>'name','')))=0 OR coalesce((serving->>'grams')::float8,0)<=0;
    CONTINUE WHEN EXISTS (SELECT 1 FROM public."Serving" s WHERE s."foodItemId"=food.id AND
      public.food_identity_part(s."servingName")=public.food_identity_part(serving->>'name'));
    INSERT INTO public."Serving"("foodItemId","servingName","servingWeightGram","defaultServingAmount")
    VALUES (food.id, pg_catalog.btrim(serving->>'name'), (serving->>'grams')::float8, 1);
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

DROP FUNCTION IF EXISTS public.create_catalogue_food(uuid, integer, jsonb, jsonb);
CREATE FUNCTION public.create_catalogue_food(
  p_user_id uuid, p_message_id integer, p_food jsonb, p_servings jsonb
) RETURNS TABLE(food_id integer, created boolean, enrichment jsonb)
LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $function$
DECLARE
  identity text := public.food_identity_key(p_food->>'name', p_food->>'brand');
  source public."FoodInfoSource" := coalesce(p_food->>'foodInfoSource','Online')::public."FoodInfoSource";
  external text := nullif(pg_catalog.btrim(p_food->>'externalId'), '');
  code text := public.gtin14(p_food->>'gtin');
  existing integer;
  inserted integer;
BEGIN
  IF length(public.food_identity_part(p_food->>'name')) < 2 OR
     coalesce((p_food->>'defaultServingWeightGram')::float8, 0) <= 0 OR
     jsonb_typeof(p_servings) IS DISTINCT FROM 'array' OR jsonb_array_length(p_servings) > 10
  THEN RAISE EXCEPTION 'Invalid catalogue food' USING ERRCODE = '22023'; END IF;

  -- Serialize creators of the same identity (and barcode) so two workers cannot both insert.
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(identity, 0));
  IF code IS NOT NULL THEN PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('gtin:'||code, 0)); END IF;
  SELECT f.id INTO existing FROM public."FoodItem" f
    WHERE (code IS NOT NULL AND f.gtin = code)
       OR public.food_identity_key(f.name, f.brand) = identity
       OR (external IS NOT NULL AND f."externalId" = external AND f."foodInfoSource" = source)
    ORDER BY (code IS NOT NULL AND f.gtin = code) DESC, f.id LIMIT 1;
  IF existing IS NOT NULL THEN
    RETURN QUERY SELECT existing, false, public.enrich_catalogue_food(existing, p_food, p_servings); RETURN;
  END IF;

  INSERT INTO public."FoodItem" (name, brand, "defaultServingWeightGram", "kcalPerServing",
    "proteinPerServing", "carbPerServing", "totalFatPerServing", "fiberPerServing",
    "sugarPerServing", "satFatPerServing", "isLiquid", "userId", "messageId",
    "foodInfoSource", "externalId", gtin, "UPC", "bgeBaseEmbedding", description, verified)
  VALUES (pg_catalog.btrim(p_food->>'name'), nullif(pg_catalog.btrim(p_food->>'brand'), ''),
    (p_food->>'defaultServingWeightGram')::float8, (p_food->>'kcal')::float8,
    (p_food->>'proteinG')::float8, (p_food->>'carbG')::float8, (p_food->>'totalFatG')::float8,
    (p_food->>'fiberG')::float8, (p_food->>'sugarG')::float8, (p_food->>'satFatG')::float8,
    coalesce((p_food->>'isLiquid')::boolean, false), p_user_id, p_message_id,
    source, external, code, code::bigint, (p_food->>'bgeBaseEmbedding')::extensions.vector,
    p_food->>'source', source = 'USDA')
  RETURNING id INTO inserted;

  INSERT INTO public."Serving" ("foodItemId", "servingName", "servingWeightGram", "defaultServingAmount")
  SELECT inserted, pg_catalog.btrim(s->>'name'), (s->>'grams')::float8, 1
    FROM jsonb_array_elements(p_servings) s
    WHERE length(pg_catalog.btrim(coalesce(s->>'name',''))) > 0 AND (s->>'grams')::float8 > 0;

  RETURN QUERY SELECT inserted, true, NULL::jsonb;
END;
$function$;

REVOKE ALL ON FUNCTION public.create_catalogue_food(uuid, integer, jsonb, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.enrich_catalogue_food(integer, jsonb, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_catalogue_food(uuid, integer, jsonb, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.enrich_catalogue_food(integer, jsonb, jsonb) TO service_role;
NOTIFY pgrst, 'reload schema';
