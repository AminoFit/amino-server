-- The bge-large-en-v1.5 vectors (1024-d) on 288k USDA rows (~1.2 GB) haven't been read or written since search moved to
-- bge-base: no function, view, index or code uses the column. Dropping it is a catalogue change only; the space comes
-- back as the rows are rewritten (or with a repack).
SET lock_timeout = '3s';
ALTER TABLE public."UsdaFoodItemEmbedding" DROP COLUMN IF EXISTS "bgeLargeEmbedding";
