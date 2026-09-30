-- A16: foods users reported in the app (userSubmittedBug) that are still in the catalogue with clearly wrong values,
-- so the resolver could still pick them (scripts/report-replay.ts checked every reported food). Most reported foods
-- were fine or already fixed; these two are fixed in place, keeping their serving weight:
--
-- - "Coffee with Milk" (805): 8 kcal for a 237 g cup, which is black coffee. Rebuilt from USDA: 206 g brewed coffee
--   (1 kcal, 0.12 g protein, 0.02 g fat per 100 g) plus 31 g (2 tbsp) whole milk (61 kcal, 3.15 g protein, 4.8 g carb,
--   3.25 g fat, 1.87 g sat fat, 5.05 g sugar per 100 g): 21 kcal a cup.
-- - "Iced coffee Protein shake" (502, an old GPT-4 estimate): 32 kcal and 2 g protein for 237 g, far below any protein
--   shake. It takes a typical ready-to-drink coffee protein shake's values (Premier Protein Café Latte: 160 kcal, 30 g
--   protein, 4 g carb, 3 g fat, 1 g sat fat, 1 g sugar, 1 g fibre per 325 mL), scaled to its 237 g: 117 kcal.
--
-- Roasted Yellow Peppers (13860) stays: its 10 kcal with 0 g protein and fat per 30 g is label rounding, not an error.
-- Past logs of both foods take the corrected values (their grams are kept). Old rows and logs are backed up
-- (CatalogueAuditBackup 'A16_reported_foods', 'A16_recompute').
DO $a16$
DECLARE recomputed integer;
BEGIN
  INSERT INTO public."CatalogueAuditBackup"(audit, "tableName", "rowId", before)
    SELECT 'A16_reported_foods', 'FoodItem', f.id, pg_catalog.to_jsonb(f) - 'bgeBaseEmbedding' - 'adaEmbedding'
    FROM public."FoodItem" f WHERE f.id IN (805, 502);

  UPDATE public."FoodItem" SET "kcalPerServing" = 21, "proteinPerServing" = 1.23, "carbPerServing" = 1.49,
      "totalFatPerServing" = 1.05, "satFatPerServing" = 0.58, "transFatPerServing" = 0, "fiberPerServing" = 0,
      "sugarPerServing" = 1.57, "addedSugarPerServing" = 0,
      description = 'Brewed coffee with 2 tbsp whole milk (USDA brewed coffee and whole milk, 3.25%).', "lastUpdated" = now()
    WHERE id = 805 AND "defaultServingWeightGram" = 237;
  UPDATE public."FoodItem" SET "kcalPerServing" = 116.7, "proteinPerServing" = 21.9, "carbPerServing" = 2.9,
      "totalFatPerServing" = 2.2, "satFatPerServing" = 0.73, "transFatPerServing" = 0, "fiberPerServing" = 0.73,
      "sugarPerServing" = 0.73, "addedSugarPerServing" = 0,
      description = 'Ready-to-drink coffee protein shake (values of Premier Protein Café Latte, per 237 g).', "lastUpdated" = now()
    WHERE id = 502 AND "defaultServingWeightGram" = 237;
  IF (SELECT count(*) FROM public."FoodItem" WHERE id IN (805, 502) AND "lastUpdated" > now() - interval '1 minute') <> 2 THEN
    RAISE EXCEPTION 'A16: a food''s serving weight is not 237 g; values not applied';
  END IF;

  INSERT INTO public."CatalogueAuditBackup"(audit, "tableName", "rowId", before)
    SELECT 'A16_recompute', 'LoggedFoodItem', l.id, pg_catalog.jsonb_build_object('foodItemId', l."foodItemId", 'grams', l.grams,
      'kcal', l.kcal, 'proteinG', l."proteinG", 'carbG', l."carbG", 'totalFatG', l."totalFatG", 'satFatG', l."satFatG",
      'transFatG', l."transFatG", 'fiberG', l."fiberG", 'sugarG', l."sugarG", 'addedSugarG', l."addedSugarG")
    FROM public."LoggedFoodItem" l WHERE l."foodItemId" IN (805, 502);
  -- Recomputing a log's nutrition is catalogue maintenance, not a meal edit.
  PERFORM pg_catalog.set_config('app.meal_operation_write', 'true', true);
  UPDATE public."LoggedFoodItem" l SET
      kcal = l.grams * f."kcalPerServing" / f."defaultServingWeightGram",
      "proteinG" = l.grams * f."proteinPerServing" / f."defaultServingWeightGram",
      "carbG" = l.grams * f."carbPerServing" / f."defaultServingWeightGram",
      "totalFatG" = l.grams * f."totalFatPerServing" / f."defaultServingWeightGram",
      "satFatG" = l.grams * f."satFatPerServing" / f."defaultServingWeightGram",
      "transFatG" = l.grams * f."transFatPerServing" / f."defaultServingWeightGram",
      "fiberG" = l.grams * f."fiberPerServing" / f."defaultServingWeightGram",
      "sugarG" = l.grams * f."sugarPerServing" / f."defaultServingWeightGram",
      "addedSugarG" = l.grams * f."addedSugarPerServing" / f."defaultServingWeightGram"
    FROM public."FoodItem" f
    WHERE f.id = l."foodItemId" AND l."foodItemId" IN (805, 502) AND l.grams > 0;
  GET DIAGNOSTICS recomputed = ROW_COUNT;
  RAISE NOTICE 'A16: 2 foods fixed, % logs recomputed', recomputed;
END
$a16$;
NOTIFY pgrst, 'reload schema';
