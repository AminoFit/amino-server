-- A18 (owner's agent audit F3, 2026-10-04): legacy Nutritionix servings kept their label quantity in
-- servingAlternateAmount ("0.5 cup" = 40.5 g) but were stored as amount 1, so one food could offer three "cup"
-- servings of 81, 40.5 and 27 g (dry oats 70, 177, rolled oats 112) and two "tbsp" of 27.6 and 13.8 g (garlic butter
-- sauce 11949): picking "1 cup" could log a third or a half of a cup. The source amount is restored where the data
-- proves it: the food has another serving with the same unit, and with the source amounts they all agree on grams per
-- unit (within 5%). 153 servings; the ~36 whose siblings disagree and the ~400 without a sibling are left for review.
--
-- Past logs keep their grams (and nutrition). A log whose amount counted servings the old way (grams = amount x the
-- serving's weight) is restated in the unit's real amount (amount x the source amount), so "1 cup" of the 40.5 g serving
-- reads "0.5 cup"; a log already in real units (0.5 cup = 40.5 g, 1 tbsp = 14.5 g) is left alone. Servings and logs
-- are backed up (CatalogueAuditBackup 'A18_serving_source_amounts').
SET TimeZone = 'UTC';

CREATE TEMP TABLE a18_servings ON COMMIT DROP AS
SELECT b.id, b."foodItemId", b."servingWeightGram" AS w, b."servingAlternateAmount" AS alt
FROM public."Serving" b
WHERE b."servingAlternateAmount" > 0 AND b."servingWeightGram" > 0 AND b."defaultServingAmount" = 1
  AND abs(b."servingAlternateAmount" - 1) > 0.005
  AND lower(btrim(b."servingAlternateUnit")) = lower(btrim(b."servingName"))
  AND EXISTS (SELECT 1 FROM public."Serving" o WHERE o."foodItemId" = b."foodItemId" AND o.id <> b.id
    AND lower(btrim(o."servingName")) = lower(btrim(b."servingName")))
  AND (SELECT bool_and(abs((o."servingWeightGram" / coalesce(nullif(o."servingAlternateAmount", 0), 1))
        / (b."servingWeightGram" / b."servingAlternateAmount") - 1) < 0.05)
       FROM public."Serving" o WHERE o."foodItemId" = b."foodItemId" AND o.id <> b.id
         AND lower(btrim(o."servingName")) = lower(btrim(b."servingName"))
         AND lower(btrim(o."servingAlternateUnit")) = lower(btrim(b."servingName")));

-- Logs counted in the old way (and not already in real units).
CREATE TEMP TABLE a18_logs ON COMMIT DROP AS
SELECT l.id, a.alt FROM public."LoggedFoodItem" l JOIN a18_servings a ON a.id = l."servingId"
WHERE l."servingAmount" > 0 AND l.grams > 0
  AND abs(l.grams - l."servingAmount" * a.w) <= greatest(0.5, 0.02 * l.grams)
  AND NOT abs(l.grams - l."servingAmount" * a.w / a.alt) <= greatest(0.5, 0.02 * l.grams);

INSERT INTO public."CatalogueAuditBackup"(audit, "tableName", "rowId", before)
SELECT 'A18_serving_source_amounts', 'Serving', s.id, to_jsonb(s) FROM public."Serving" s JOIN a18_servings USING (id);
INSERT INTO public."CatalogueAuditBackup"(audit, "tableName", "rowId", before)
SELECT 'A18_serving_source_amounts', 'LoggedFoodItem', l.id,
  jsonb_build_object('servingId', l."servingId", 'servingAmount', l."servingAmount", 'grams', l.grams)
FROM public."LoggedFoodItem" l JOIN a18_logs USING (id);

-- Restating a log's amount is catalogue maintenance: its grams and nutrition don't change.
SELECT pg_catalog.set_config('app.meal_operation_write', 'true', true);
UPDATE public."LoggedFoodItem" l SET "servingAmount" = round((l."servingAmount" * a.alt)::numeric, 3)
FROM a18_logs a WHERE l.id = a.id;
UPDATE public."Serving" s SET "defaultServingAmount" = round(a.alt::numeric, 2) FROM a18_servings a WHERE s.id = a.id;
-- The phone's catalogue mirror and the user's own-food pull follow lastUpdated.
UPDATE public."FoodItem" f SET "lastUpdated" = now() WHERE f.id IN (SELECT DISTINCT "foodItemId" FROM a18_servings);
