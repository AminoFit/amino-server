-- Catalogue audit A1 (plan 2026-09-26): servings whose size was stored as the amount weigh about a gram per
-- unit ("240 ml" x240, "1 cup" 240 g x240), so "1 cup" logged 1 g. Each becomes one unit of its named portion
-- (amount 1, weight unchanged): "1 cup" = 240 g, "355 ml" = 355 g. Displayed totals are unchanged; logs keep
-- their stored grams. Old values are kept in CatalogueAuditBackup so the step can be reversed.

CREATE TABLE IF NOT EXISTS public."CatalogueAuditBackup" (
  id bigserial PRIMARY KEY,
  audit text NOT NULL,
  "tableName" text NOT NULL,
  "rowId" integer NOT NULL,
  before jsonb NOT NULL,
  "createdAt" timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public."CatalogueAuditBackup" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."CatalogueAuditBackup" FROM anon, authenticated;
CREATE INDEX IF NOT EXISTS "CatalogueAuditBackup_audit_idx" ON public."CatalogueAuditBackup"(audit);

CREATE TEMP TABLE a1_servings ON COMMIT DROP AS
WITH parsed AS (
  SELECT s.id, s."servingWeightGram" AS w, s."defaultServingAmount"::numeric AS a,
    regexp_match(s."servingName", '^\s*(\d+(?:\.\d+)?)\s*(.*)$') AS m, s."servingName"
  FROM public."Serving" s WHERE s."servingWeightGram" > 0 AND s."defaultServingAmount" > 0),
units AS (
  SELECT p.*, (p.m[1])::numeric AS lead,
    lower(regexp_replace(btrim(coalesce(p.m[2], p."servingName")), '\.$', '')) AS unit FROM parsed p),
flags AS (
  SELECT u.*, (u.lead IS NOT NULL AND u.a > 1 AND u.lead = u.a) AS restated,
    u.unit IN ('g','gram','grams','gr','ml','milliliter','milliliters','millilitre','millilitres') AS gram_unit
  FROM units u)
SELECT id FROM flags
WHERE (restated AND (gram_unit OR w / a < 2)) OR (NOT restated AND a > 1 AND w / a < 2 AND NOT gram_unit);

INSERT INTO public."CatalogueAuditBackup"(audit, "tableName", "rowId", before)
SELECT 'A1_serving_amounts', 'Serving', s.id, to_jsonb(s) FROM public."Serving" s JOIN a1_servings USING (id);

UPDATE public."Serving" s SET "defaultServingAmount" = 1 FROM a1_servings a WHERE s.id = a.id;
