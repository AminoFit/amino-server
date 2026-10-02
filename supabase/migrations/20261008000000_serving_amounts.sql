-- Legacy Nutritionix servings (eggs' large/medium/jumbo, avocado oil's tsp/tbsp, ghee, blueberries, water…) stored the
-- serving's amount in servingAlternateAmount and left defaultServingAmount empty. Meal resolution only offers servings
-- with an amount (usableServing), so these foods looked like they had none: meal 30449's "1tsp avocado oil" took
-- Chosen Foods' avocado oil for its Tbsp serving over the generic one the user always logs. The amount is copied over
-- where the serving has a weight (0.5 grapefruit = 123 g is 246 g a fruit; 50 berries = 68 g); rows backed up first,
-- and the foods' lastUpdated bumped so the app's catalogue copy picks the servings up.

CREATE TEMP TABLE amountless_servings ON COMMIT DROP AS
SELECT id, "foodItemId" FROM public."Serving"
WHERE "defaultServingAmount" IS NULL AND "servingAlternateAmount" > 0 AND "servingWeightGram" > 0;

INSERT INTO public."CatalogueAuditBackup"(audit, "tableName", "rowId", before)
SELECT 'serving_amount', 'Serving', s.id, to_jsonb(s)
FROM public."Serving" s JOIN amountless_servings USING (id);

UPDATE public."Serving" s SET "defaultServingAmount" = s."servingAlternateAmount"
FROM amountless_servings a WHERE s.id = a.id;

UPDATE public."FoodItem" f SET "lastUpdated" = now()
WHERE f.id IN (SELECT DISTINCT "foodItemId" FROM amountless_servings);
