-- Enrichment treats a serving with the same weight and amount as one the food already has,
-- whatever its name ("cup" vs "1 cup (37 g)").
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
NOTIFY pgrst, 'reload schema';
