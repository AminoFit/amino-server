-- A barcode belongs to one branded product. Shared catalogue foods with no brand that carry one (meal 30399's 7D Dried
-- Mangoes barcode on the generic "dried mango"; a placeholder 00123456789012 on "Brat & Sausage Rolls") answer every
-- scan of that product with a generic food. Their barcodes are cleared (backed up first), so the next scan fetches the
-- real product from USDA or Open Food Facts. Logs keep their food and values.

CREATE TEMP TABLE generic_barcodes ON COMMIT DROP AS
SELECT id FROM public."FoodItem"
WHERE gtin IS NOT NULL AND coalesce(btrim(brand), '') = '' AND "privateToUserId" IS NULL;

INSERT INTO public."CatalogueAuditBackup"(audit, "tableName", "rowId", before)
SELECT 'generic_barcode', 'FoodItem', f.id, to_jsonb(f) - 'bgeBaseEmbedding'
FROM public."FoodItem" f JOIN generic_barcodes USING (id);

UPDATE public."FoodItem" f SET gtin = NULL, "UPC" = NULL FROM generic_barcodes g WHERE f.id = g.id;
