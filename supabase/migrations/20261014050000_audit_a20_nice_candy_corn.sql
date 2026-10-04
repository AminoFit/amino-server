-- A20: Nice! Candy Corn (15362, Walgreens, barcode 049022834323) was created from USDA branded record 2291236, which
-- lists only energy (0 kcal) and protein (0 g): no carbohydrate or fat at all, read as 0, so 24 pieces (41 g) of candy
-- logged 0 kcal (meal 30491). Values from the label (Prospre, 24 pieces = 41 g): 160 kcal, 39 g carbohydrate, 32 g
-- sugars, 0 g fat, 0 g protein (39 x 4 = 156 kcal). Backed up in CatalogueAuditBackup 'A20_nice_candy_corn'.
DO $a20$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public."FoodItem" WHERE id = 15362 AND "kcalPerServing" = 0) THEN
    RAISE NOTICE 'A20: food 15362 already corrected or changed; nothing to do';
    RETURN;
  END IF;
  INSERT INTO public."CatalogueAuditBackup"(audit, "tableName", "rowId", before)
    SELECT 'A20_nice_candy_corn', 'FoodItem', f.id, pg_catalog.to_jsonb(f) - 'bgeBaseEmbedding' - 'adaEmbedding'
    FROM public."FoodItem" f WHERE f.id = 15362;
  UPDATE public."FoodItem" SET "kcalPerServing" = 160, "carbPerServing" = 39, "sugarPerServing" = 32,
    "totalFatPerServing" = 0, "proteinPerServing" = 0, gtin = coalesce(gtin, '00049022834323'), "lastUpdated" = now()
  WHERE id = 15362 AND "defaultServingWeightGram" = 41;
END
$a20$;
