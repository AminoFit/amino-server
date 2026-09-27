-- Catalogue audit (A6 follow-up, 2026-09-27): placeholder servings. Old importers left a 10 g serving next to the real
-- one with the exact same item name ("Burrito" 10 g next to "Burrito" 185 g); the app keeps the lighter one, so
-- "1 burrito" logged 10 g. Measurement units are excluded: there the light serving can be the real one ("fl oz"
-- 25 g beside a whole bottle mislabelled "fl oz"). Logs and favourites on a placeholder move to the real same-name
-- serving, then the placeholder is deleted. Old rows go to CatalogueAuditBackup (A6_placeholder).
SET statement_timeout = '10min';

CREATE TEMP TABLE placeholder ON COMMIT DROP AS
WITH sv AS (
  SELECT s.id, s."foodItemId", lower(btrim(s."servingName")) AS exact,
    s."servingWeightGram" / nullif(s."defaultServingAmount", 0) AS per
  FROM public."Serving" s WHERE s."servingWeightGram" > 0 AND s."defaultServingAmount" > 0)
SELECT DISTINCT ON (a.id) a.id, b.id AS real_id
FROM sv a JOIN sv b ON b."foodItemId" = a."foodItemId" AND b.exact = a.exact AND b.id <> a.id AND b.per >= 5 * a.per
WHERE a.per BETWEEN 9.5 AND 10.5
  AND regexp_replace(a.exact, '[^a-z ]', '', 'g') NOT IN ('g','gram','grams','oz','ounce','ounces','fl oz','floz','fluid ounce','ml','l',
    'cup','cups','tbsp','tablespoon','tsp','teaspoon','lb','piece','pieces','slice','slices')
ORDER BY a.id, b.per DESC, b.id;

INSERT INTO public."CatalogueAuditBackup"(audit, "tableName", "rowId", before)
SELECT 'A6_placeholder', 'Serving', s.id, to_jsonb(s) || jsonb_build_object('replacedBy', p.real_id)
FROM public."Serving" s JOIN placeholder p USING (id);

UPDATE public."LoggedFoodItem" l SET "servingId" = p.real_id FROM placeholder p WHERE l."servingId" = p.id;
UPDATE public."UserFavoriteFoodItem" u SET "servingId" = p.real_id FROM placeholder p WHERE u."servingId" = p.id;
DELETE FROM public."Serving" s USING placeholder p WHERE s.id = p.id;
