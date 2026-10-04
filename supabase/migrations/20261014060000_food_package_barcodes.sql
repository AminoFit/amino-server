-- Package barcodes (2026-10-04-package-barcodes-plan.md): a food can carry more than one barcode, each a package of it
-- (fairlife chocolate 2% milk: the 8 fl oz bottle is FoodItem.gtin, the 14 fl oz bottle 00811620020398 a row here,
-- pointing at its 414 g "bottle" serving). Meal 30492 failed three times because a food held one barcode: the 14 oz
-- record was rightly the same product as food 15321, which already had the 8 oz barcode, so the scan could never be
-- placed. FoodItem.gtin stays the main barcode; this table holds the others. Lookups read both.
SET TimeZone = 'UTC';

CREATE TABLE IF NOT EXISTS public."FoodBarcode" (
  gtin text NOT NULL CHECK (gtin ~ '^[0-9]{14}$'),
  "foodItemId" integer NOT NULL REFERENCES public."FoodItem"(id) ON DELETE CASCADE,
  -- The package's serving ("bottle", 414 g) when the source says the package size; null otherwise.
  "servingId" integer REFERENCES public."Serving"(id) ON DELETE SET NULL,
  -- Who owns the food: null for the shared catalogue, else the user whose own food it is (copied from the food).
  "privateToUserId" uuid,
  source text NOT NULL,
  "createdAt" timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public."FoodBarcode" IS 'Barcodes of a food besides FoodItem.gtin: other package sizes of the same product.';
-- One barcode, one shared product; a user's own food may claim a barcode for that user.
CREATE UNIQUE INDEX IF NOT EXISTS "FoodBarcode_shared_gtin_key" ON public."FoodBarcode"(gtin) WHERE "privateToUserId" IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS "FoodBarcode_user_gtin_key" ON public."FoodBarcode"(gtin, "privateToUserId")
  WHERE "privateToUserId" IS NOT NULL;
CREATE INDEX IF NOT EXISTS "FoodBarcode_food_idx" ON public."FoodBarcode"("foodItemId");

ALTER TABLE public."FoodBarcode" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."FoodBarcode" FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public."FoodBarcode" TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public."FoodBarcode" TO service_role;
DROP POLICY IF EXISTS "Read shared barcodes and your own" ON public."FoodBarcode";
CREATE POLICY "Read shared barcodes and your own" ON public."FoodBarcode" FOR SELECT TO authenticated
  USING ("privateToUserId" IS NULL OR "privateToUserId" = (SELECT auth.uid()));
