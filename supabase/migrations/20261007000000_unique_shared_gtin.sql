-- One live shared food per barcode. Every writer already checks first (create_catalogue_food and enrich_catalogue_food
-- lock on the barcode); 18 barcodes were each on two foods from 2024 USDA imports, merged on 2026-10-02
-- (scripts/fix-same-barcode-2026-10-02.ts). A merge now clears the dropped food's barcode before the kept food takes it.

CREATE OR REPLACE FUNCTION public.merge_catalogue_food(p_keep integer, p_drop integer, p_audit text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE
  keep_row public."FoodItem"%ROWTYPE;
  drop_row public."FoodItem"%ROWTYPE;
  serving record;
  twin integer;
  moved integer := 0;
  joined integer := 0;
BEGIN
  IF p_keep = p_drop THEN RAISE EXCEPTION 'Cannot merge a food into itself' USING ERRCODE = '22023'; END IF;
  SELECT * INTO keep_row FROM public."FoodItem" WHERE id = p_keep FOR UPDATE;
  SELECT * INTO drop_row FROM public."FoodItem" WHERE id = p_drop FOR UPDATE;
  IF keep_row.id IS NULL OR drop_row.id IS NULL THEN RAISE EXCEPTION 'Catalogue food unavailable' USING ERRCODE = '42704'; END IF;
  IF keep_row."recipePortions" IS NOT NULL OR drop_row."recipePortions" IS NOT NULL
  THEN RAISE EXCEPTION 'Recipes are never merged' USING ERRCODE = '22023'; END IF;

  INSERT INTO public."CatalogueAuditBackup"(audit, "tableName", "rowId", before)
  VALUES (p_audit, 'FoodItem', p_drop, (to_jsonb(drop_row) - 'bgeBaseEmbedding') || jsonb_build_object('mergedInto', p_keep));

  FOR serving IN SELECT * FROM public."Serving" WHERE "foodItemId" = p_drop LOOP
    INSERT INTO public."CatalogueAuditBackup"(audit, "tableName", "rowId", before)
    VALUES (p_audit, 'Serving', serving.id, to_jsonb(serving) || jsonb_build_object('mergedInto', p_keep));
    twin := NULL;
    SELECT k.id INTO twin FROM public."Serving" k
    WHERE k."foodItemId" = p_keep
      AND public.food_identity_part(k."servingName") = public.food_identity_part(serving."servingName")
      AND ((k."servingWeightGram" IS NULL AND serving."servingWeightGram" IS NULL) OR
           abs(k."servingWeightGram" / nullif(k."defaultServingAmount", 0) - serving."servingWeightGram" / nullif(serving."defaultServingAmount", 0))
             <= 0.02 * greatest(k."servingWeightGram" / nullif(k."defaultServingAmount", 0), serving."servingWeightGram" / nullif(serving."defaultServingAmount", 0)))
    ORDER BY k.id LIMIT 1;
    IF twin IS NOT NULL THEN
      UPDATE public."LoggedFoodItem" SET "servingId" = twin WHERE "servingId" = serving.id;
      UPDATE public."UserFavoriteFoodItem" SET "servingId" = twin WHERE "servingId" = serving.id;
      UPDATE public."RecipeIngredient" SET "servingId" = twin WHERE "servingId" = serving.id;
      DELETE FROM public."Serving" WHERE id = serving.id;
      joined := joined + 1;
    ELSE
      UPDATE public."Serving" SET "foodItemId" = p_keep WHERE id = serving.id;
      moved := moved + 1;
    END IF;
  END LOOP;

  UPDATE public."LoggedFoodItem" SET "foodItemId" = p_keep WHERE "foodItemId" = p_drop;
  UPDATE public."UserFavoriteFoodItem" SET "foodItemId" = p_keep WHERE "foodItemId" = p_drop;
  UPDATE public."RecipeIngredient" SET "foodItemId" = p_keep WHERE "foodItemId" = p_drop;
  UPDATE public."FoodItem" SET "previousVersionId" = p_keep WHERE "previousVersionId" = p_drop;
  UPDATE public."userSubmittedBug" SET food_item_id = p_keep WHERE food_item_id = p_drop;
  UPDATE public."FoodItemConflict" SET "foodItemId" = p_keep WHERE "foodItemId" = p_drop;
  UPDATE public."IconQueue" SET requested_food_item_id = p_keep WHERE requested_food_item_id = p_drop;

  INSERT INTO public."CatalogueAuditBackup"(audit, "tableName", "rowId", before)
  SELECT p_audit, 'Nutrient', n.id, to_jsonb(n) FROM public."Nutrient" n WHERE n."foodItemId" = p_drop;
  DELETE FROM public."Nutrient" WHERE "foodItemId" = p_drop;

  -- The kept food keeps its icon; it takes the dropped food's only when it has none.
  IF NOT EXISTS (SELECT 1 FROM public."FoodItemImages" WHERE "foodItemId" = p_keep) THEN
    UPDATE public."FoodItemImages" SET "foodItemId" = p_keep WHERE "foodItemId" = p_drop;
  END IF;

  IF keep_row.gtin IS NULL AND drop_row.gtin IS NOT NULL THEN
    -- One live shared food per barcode (FoodItem_shared_gtin_key): the dropped food lets go of it first.
    UPDATE public."FoodItem" SET gtin = NULL, "UPC" = NULL WHERE id = p_drop;
    UPDATE public."FoodItem" SET gtin = drop_row.gtin, "UPC" = coalesce("UPC", drop_row."UPC") WHERE id = p_keep;
  END IF;
  IF public.food_identity_part(drop_row.name) <> public.food_identity_part(keep_row.name)
     AND NOT EXISTS (SELECT 1 FROM pg_catalog.unnest(coalesce(keep_row."knownAs", ARRAY[]::text[])) a
                     WHERE public.food_identity_part(a) = public.food_identity_part(drop_row.name))
     AND coalesce(array_length(keep_row."knownAs", 1), 0) < 10 THEN
    UPDATE public."FoodItem" SET "knownAs" = coalesce("knownAs", ARRAY[]::text[]) || drop_row.name WHERE id = p_keep;
  END IF;

  DELETE FROM public."FoodItem" WHERE id = p_drop;
  RETURN jsonb_build_object('keep', p_keep, 'drop', p_drop, 'servingsMoved', moved, 'servingsJoined', joined);
END;
$function$;

CREATE UNIQUE INDEX IF NOT EXISTS "FoodItem_shared_gtin_key" ON public."FoodItem" (gtin)
  WHERE gtin IS NOT NULL AND "archivedAt" IS NULL AND "privateToUserId" IS NULL;
