-- Catalogue audit A8 (plan 2026-09-26): foods that could not be logged by weight. The meal agent computes no
-- nutrition for weightUnknown foods, which blocked popular items (a Big Mac, a protein shake, a hot dog).
-- 1. A food with no default weight but exactly one weighed single-unit serving takes that weight ("serving" 200 g).
-- 2. weightUnknown is cleared where the default weight gives plausible nutrition (<= 950 kcal/100 g and macros no
--    heavier than 115% of the food). Old rows go to CatalogueAuditBackup (A8_weight).
SET statement_timeout = '10min';

CREATE TEMP TABLE a8_weight ON COMMIT DROP AS
SELECT f.id, (array_agg(DISTINCT round((s."servingWeightGram")::numeric, 2)))[1] AS grams
FROM public."FoodItem" f JOIN public."Serving" s ON s."foodItemId" = f.id
WHERE NOT (coalesce(f."defaultServingWeightGram", 0) > 0) AND s."servingWeightGram" > 0 AND coalesce(s."defaultServingAmount", 1) = 1
GROUP BY f.id HAVING count(DISTINCT round((s."servingWeightGram")::numeric, 2)) = 1;

CREATE TEMP TABLE a8_changed ON COMMIT DROP AS
SELECT f.id FROM public."FoodItem" f LEFT JOIN a8_weight w USING (id)
WHERE (f."weightUnknown" OR w.id IS NOT NULL)
  AND coalesce(nullif(f."defaultServingWeightGram", 0), w.grams) > 0 AND f."kcalPerServing" IS NOT NULL
  AND f."kcalPerServing" * 100 / coalesce(nullif(f."defaultServingWeightGram", 0), w.grams) <= 950
  AND coalesce(f."proteinPerServing", 0) + coalesce(f."carbPerServing", 0) + coalesce(f."totalFatPerServing", 0)
      <= 1.15 * coalesce(nullif(f."defaultServingWeightGram", 0), w.grams);

INSERT INTO public."CatalogueAuditBackup"(audit, "tableName", "rowId", before)
SELECT 'A8_weight', 'FoodItem', f.id, to_jsonb(f) - 'bgeBaseEmbedding' FROM public."FoodItem" f JOIN a8_changed USING (id);

UPDATE public."FoodItem" f SET "defaultServingWeightGram" = coalesce(nullif(f."defaultServingWeightGram", 0), w.grams), "weightUnknown" = false
FROM a8_changed c LEFT JOIN a8_weight w USING (id) WHERE f.id = c.id;
