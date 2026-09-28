-- Icon thumbnails (2026-09-27): the app shows icons at 36-80 pt, but pathToImage pointed at 1024 px PNGs of about
-- 800 KB (a "?width=" query is ignored on storage object URLs), so every log row downloaded the full image.
-- pathToImage now points at a 256 px WebP (about 6 KB) stored with a one-year immutable cache lifetime; the full image
-- stays in originalPath.
ALTER TABLE public."FoodImage" ADD COLUMN IF NOT EXISTS "originalPath" text;
COMMENT ON COLUMN public."FoodImage"."originalPath" IS 'Full-size source image; pathToImage is the 256 px thumbnail the app shows.';
