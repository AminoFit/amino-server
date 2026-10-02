-- Amazon's everything bagel was two catalogue foods: "Everything Bagel" (Amazon Fresh, FatSecret, no barcode; 11 logs,
-- 5 users) and "Everything Bagels" (Amazon Grocery, the brand's new name, Open Food Facts, barcode 00842379166037;
-- created 2026-10-02 for meal 30419). Same product and values (270 kcal and 500 mg sodium per 102 g bagel); the
-- duplicate check missed it because the brand was renamed and the older food had no barcode. The newer one merges into
-- the older, which takes its barcode; past logs keep their own values (merge_catalogue_food backs everything up).
DO $merge$
BEGIN
  PERFORM pg_catalog.set_config('app.meal_operation_write', 'true', true);
  IF EXISTS (SELECT 1 FROM public."FoodItem" WHERE id = 15319 AND "archivedAt" IS NULL)
     AND EXISTS (SELECT 1 FROM public."FoodItem" WHERE id = 8886 AND "archivedAt" IS NULL) THEN
    PERFORM public.merge_catalogue_food(8886, 15319, 'amazon_bagel_merge');
  END IF;
END
$merge$;
