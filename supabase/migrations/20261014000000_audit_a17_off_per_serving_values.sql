-- A17: fairlife Chocolate Reduced Fat Ultra-filtered Milk (15321, barcode 00856312002795) came from an Open Food Facts
-- record whose per-100 g fields hold the bottle's per-serving label values (140 kcal, 13 g protein, 13 g carbs, 4.5 g fat
-- per 240 ml), so Amino's 240 g serving read 336 kcal. Every value (macros and the Nutrient rows: calcium 912 mg against
-- the label's 380) is 240/100 too high: all are scaled by 100/240. Reported by the owner's agent, 2026-10-04; never
-- logged. The row and its Nutrient rows are backed up (CatalogueAuditBackup 'A17_off_per_serving').
DO $a17$
DECLARE factor constant numeric := 100.0 / 240.0;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public."FoodItem" WHERE id = 15321 AND "kcalPerServing" = 336) THEN
    RAISE NOTICE 'A17: food 15321 already corrected or changed; nothing to do';
    RETURN;
  END IF;
  INSERT INTO public."CatalogueAuditBackup"(audit, "tableName", "rowId", before)
    SELECT 'A17_off_per_serving', 'FoodItem', f.id, pg_catalog.to_jsonb(f) - 'bgeBaseEmbedding' - 'adaEmbedding'
    FROM public."FoodItem" f WHERE f.id = 15321;
  INSERT INTO public."CatalogueAuditBackup"(audit, "tableName", "rowId", before)
    SELECT 'A17_off_per_serving', 'Nutrient', n.id, pg_catalog.to_jsonb(n)
    FROM public."Nutrient" n WHERE n."foodItemId" = 15321;

  UPDATE public."FoodItem" SET
    "kcalPerServing" = round("kcalPerServing"::numeric * factor, 1),
    "proteinPerServing" = round("proteinPerServing"::numeric * factor, 2),
    "carbPerServing" = round("carbPerServing"::numeric * factor, 2),
    "totalFatPerServing" = round("totalFatPerServing"::numeric * factor, 2),
    "fiberPerServing" = round("fiberPerServing"::numeric * factor, 2),
    "sugarPerServing" = round("sugarPerServing"::numeric * factor, 2),
    "addedSugarPerServing" = round("addedSugarPerServing"::numeric * factor, 2),
    "satFatPerServing" = round("satFatPerServing"::numeric * factor, 2),
    "transFatPerServing" = round("transFatPerServing"::numeric * factor, 2),
    -- The phone's catalogue mirror pulls foods by lastUpdated.
    "lastUpdated" = now()
  WHERE id = 15321;
  UPDATE public."Nutrient" SET "nutrientAmountPerDefaultServing" = round("nutrientAmountPerDefaultServing"::numeric * factor, 3)
  WHERE "foodItemId" = 15321;
END
$a17$;
