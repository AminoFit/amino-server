-- A19 (owner's agent audit F4 and V1, 2026-10-04): two sushi rolls with values that can't all be true.
--
-- 7206 Sushi Avenue rainbow roll (USDA branded 2215080, barcode 00881122810643, never logged): USDA's record has no
-- total fat at all (stored as 0) while listing 2 g saturated and 2 g trans fat, and its macros explain 160 of its
-- 250 kcal. No label for the product was found. Total fat is taken from the label's own energy, (250 - 4x5 - 4x35) / 9
-- = 10 g; the 2 g of trans fat (equal to the saturated value, implausible in sushi) becomes unknown.
--
-- 238 tuna sushi roll (generic, Nutritionix, 10 logs): its water, vitamins and most minerals equal USDA FNDDS 2708965
-- "Sushi roll tuna" exactly, but its energy, macros, sodium, potassium and cholesterol came from elsewhere (15 g protein
-- per 100 g against FNDDS's 7.4, which with 75.6 g water came to more than 100 g). Those take FNDDS's values per 100 g,
-- scaled to the food's 159.5 g roll. Past meals keep the values they were logged with.
-- Rows backed up in CatalogueAuditBackup 'A19_sushi_roll_values'.
DO $a19$
DECLARE roll constant numeric := 159.5 / 100.0;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public."FoodItem" WHERE id = 7206 AND "totalFatPerServing" = 0)
     OR NOT EXISTS (SELECT 1 FROM public."FoodItem" WHERE id = 238 AND "defaultServingWeightGram" = 159.5 AND "proteinPerServing" > 20) THEN
    RAISE NOTICE 'A19: foods already corrected or changed; nothing to do';
    RETURN;
  END IF;
  INSERT INTO public."CatalogueAuditBackup"(audit, "tableName", "rowId", before)
    SELECT 'A19_sushi_roll_values', 'FoodItem', f.id, pg_catalog.to_jsonb(f) - 'bgeBaseEmbedding' - 'adaEmbedding'
    FROM public."FoodItem" f WHERE f.id IN (7206, 238);
  INSERT INTO public."CatalogueAuditBackup"(audit, "tableName", "rowId", before)
    SELECT 'A19_sushi_roll_values', 'Nutrient', n.id, pg_catalog.to_jsonb(n)
    FROM public."Nutrient" n WHERE n."foodItemId" = 238 AND lower(n."nutrientName") IN ('sodium', 'potassium', 'cholesterol');

  UPDATE public."FoodItem" SET "totalFatPerServing" = 10, "transFatPerServing" = NULL, "lastUpdated" = now() WHERE id = 7206;

  UPDATE public."FoodItem" SET
    "kcalPerServing" = round(97 * roll, 1), "proteinPerServing" = round(7.4 * roll, 2),
    "carbPerServing" = round(15.3 * roll, 2), "totalFatPerServing" = round(0.26 * roll, 2),
    "satFatPerServing" = round(0.069 * roll, 3), "transFatPerServing" = NULL,
    "sugarPerServing" = round(0.92 * roll, 2), "fiberPerServing" = round(0.7 * roll, 2), "lastUpdated" = now()
  WHERE id = 238;
  UPDATE public."Nutrient" SET "nutrientAmountPerDefaultServing" = round(342 * roll, 1) WHERE "foodItemId" = 238 AND lower("nutrientName") = 'sodium';
  UPDATE public."Nutrient" SET "nutrientAmountPerDefaultServing" = round(119 * roll, 1) WHERE "foodItemId" = 238 AND lower("nutrientName") = 'potassium';
  UPDATE public."Nutrient" SET "nutrientAmountPerDefaultServing" = round(10 * roll, 2) WHERE "foodItemId" = 238 AND lower("nutrientName") = 'cholesterol';
END
$a19$;
