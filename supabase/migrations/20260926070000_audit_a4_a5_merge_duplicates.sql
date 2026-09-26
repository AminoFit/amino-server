-- Catalogue audit A4/A5 (plan 2026-09-26): merge duplicate foods, keeping the most-logged one.
-- A4: foods sharing a barcode. A5: foods with the same name and brand (ignoring accents, case and punctuation).
-- Only members whose energy density is within 15% of the kept food's are merged: the same name can be different
-- foods ("chicken breast" raw vs cooked), and a barcode on the wrong product must not pull it in.
-- Every reference moves to the kept food (logs, favourites, bug reports, conflicts, icon requests); servings move
-- or join the kept food's identical serving (logs and favourites follow, so no favourite cascades away). Old rows
-- go to CatalogueAuditBackup. Logs keep their stored nutrients.

SET statement_timeout = '15min';

-- Merging looks up logs, favourites and nutrients by food and serving; these were unindexed.
CREATE INDEX IF NOT EXISTS "LoggedFoodItem_foodItemId_idx" ON public."LoggedFoodItem"("foodItemId");
CREATE INDEX IF NOT EXISTS "LoggedFoodItem_servingId_idx" ON public."LoggedFoodItem"("servingId");
CREATE INDEX IF NOT EXISTS "Nutrient_foodItemId_idx" ON public."Nutrient"("foodItemId");
CREATE INDEX IF NOT EXISTS "UserFavoriteFoodItem_foodItemId_idx" ON public."UserFavoriteFoodItem"("foodItemId");

CREATE OR REPLACE FUNCTION public.merge_catalogue_food(p_keep integer, p_drop integer, p_audit text)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $function$
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
      DELETE FROM public."Serving" WHERE id = serving.id;
      joined := joined + 1;
    ELSE
      UPDATE public."Serving" SET "foodItemId" = p_keep WHERE id = serving.id;
      moved := moved + 1;
    END IF;
  END LOOP;

  UPDATE public."LoggedFoodItem" SET "foodItemId" = p_keep WHERE "foodItemId" = p_drop;
  UPDATE public."UserFavoriteFoodItem" SET "foodItemId" = p_keep WHERE "foodItemId" = p_drop;
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
REVOKE ALL ON FUNCTION public.merge_catalogue_food(integer, integer, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.merge_catalogue_food(integer, integer, text) TO service_role;

DO $merge$
DECLARE
  pass text;
  pair record;
BEGIN
  FOREACH pass IN ARRAY ARRAY['A4_barcode_merge', 'A5_identity_merge'] LOOP
    FOR pair IN
      WITH uses AS (SELECT "foodItemId" AS id, count(*) AS n FROM public."LoggedFoodItem" WHERE "foodItemId" IS NOT NULL GROUP BY 1),
      stats AS (
        SELECT f.id, f.gtin,
          public.food_identity_part(f.name) || '|' || coalesce(public.food_identity_part(f.brand), '') AS ident,
          public.food_identity_part(f.name) AS name_key,
          f."kcalPerServing" * 100 / nullif(f."defaultServingWeightGram", 0) AS density,
          coalesce(u.n, 0) AS uses,
          CASE f."foodInfoSource" WHEN 'Label' THEN 1 WHEN 'Online' THEN 2 WHEN 'USDA' THEN 3 WHEN 'NUTRITIONIX' THEN 4
            WHEN 'FATSECRET' THEN 5 WHEN 'User' THEN 6 ELSE 7 END AS source_rank
        FROM public."FoodItem" f LEFT JOIN uses u ON u.id = f.id),
      grouped AS (
        SELECT s.*, CASE WHEN pass = 'A4_barcode_merge' THEN s.gtin ELSE s.ident END AS grp FROM stats s
        WHERE CASE WHEN pass = 'A4_barcode_merge' THEN s.gtin IS NOT NULL ELSE s.name_key <> '' END),
      ranked AS (
        SELECT g.*, first_value(g.id) OVER w AS keep_id, first_value(g.density) OVER w AS keep_density,
          count(*) OVER (PARTITION BY g.grp) AS members
        FROM grouped g
        WINDOW w AS (PARTITION BY g.grp ORDER BY g.uses DESC, g.source_rank, g.id))
      SELECT keep_id, id AS drop_id FROM ranked
      WHERE members > 1 AND id <> keep_id AND density IS NOT NULL AND keep_density IS NOT NULL
        AND abs(density - keep_density) <= greatest(5, 0.15 * greatest(density, keep_density))
    LOOP
      -- An earlier merge in this pass may have removed either side.
      IF EXISTS (SELECT 1 FROM public."FoodItem" WHERE id = pair.keep_id) AND EXISTS (SELECT 1 FROM public."FoodItem" WHERE id = pair.drop_id) THEN
        PERFORM public.merge_catalogue_food(pair.keep_id, pair.drop_id, pass);
      END IF;
    END LOOP;
  END LOOP;
  -- Duplicates whose own values were wrong merge into the correct food rather than the most-logged one:
  -- A2 "espresso with crema" (138 kcal/100 g) is Coffee, Espresso (9); A3 found four impossible foods whose
  -- source is already in the catalogue (McDouble 45 g / 400 kcal, a granola bar, black seed oil, pork ramen).
  FOR pair IN SELECT * FROM (VALUES (8713, 1917, 'A2_duplicate_merge'), (8006, 793, 'A3_duplicate_merge'),
      (10381, 10380, 'A3_duplicate_merge'), (11590, 11592, 'A3_duplicate_merge'), (4298, 14644, 'A3_duplicate_merge')) v(keep_id, drop_id, audit)
  LOOP
    IF EXISTS (SELECT 1 FROM public."FoodItem" WHERE id = pair.keep_id) AND EXISTS (SELECT 1 FROM public."FoodItem" WHERE id = pair.drop_id) THEN
      PERFORM public.merge_catalogue_food(pair.keep_id, pair.drop_id, pair.audit);
    END IF;
  END LOOP;
END
$merge$;
NOTIFY pgrst, 'reload schema';
