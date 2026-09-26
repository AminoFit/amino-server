-- Catalogue audit A6 (plan 2026-09-26): serving hygiene. Every changed or deleted row is copied to
-- CatalogueAuditBackup first. Servings a favourite or a log references are never deleted (favourites cascade
-- on delete); logs keep their stored grams, and the app re-matches servings by grams when editing.

CREATE TEMP TABLE a6_sv ON COMMIT DROP AS
SELECT s.id, s."foodItemId", s."servingName", s."servingWeightGram" AS w, s."defaultServingAmount"::numeric AS a,
  s."servingWeightGram" / nullif(s."defaultServingAmount", 0) AS per,
  lower(btrim(regexp_replace(regexp_replace(s."servingName", '\s*\(.*?\)\s*', ' ', 'g'), '\.$', ''))) AS norm,
  EXISTS (SELECT 1 FROM public."LoggedFoodItem" l WHERE l."servingId" = s.id)
    OR EXISTS (SELECT 1 FROM public."UserFavoriteFoodItem" u WHERE u."servingId" = s.id) AS referenced
FROM public."Serving" s;

-- 1. Unusable servings (no weight or amount) and "g" / "oz" servings that duplicate the app's built-in units.
CREATE TEMP TABLE a6_delete ON COMMIT DROP AS
SELECT id, CASE WHEN NOT (coalesce(w, 0) > 0 AND coalesce(a, 0) > 0) THEN 'A6_unusable' ELSE 'A6_builtin_unit' END AS audit
FROM a6_sv
WHERE NOT referenced AND (
  NOT (coalesce(w, 0) > 0 AND coalesce(a, 0) > 0)
  OR (norm IN ('g','gram','grams','gr','grm') AND per BETWEEN 0.98 AND 1.02)
  OR (norm IN ('oz','ounce','ounces','wt. oz','wt oz','oza') AND per BETWEEN 27.5 AND 29.2));

-- 2. Same name and weight twice on one food: keep the lowest id (or a referenced one), delete unreferenced extras.
INSERT INTO a6_delete
SELECT id, 'A6_duplicate' FROM (
  SELECT v.id, v.referenced, row_number() OVER (PARTITION BY v."foodItemId", v.norm, round(v.per::numeric, 1)
    ORDER BY v.referenced DESC, v.id) AS rank
  FROM a6_sv v WHERE v.per > 0 AND v.id NOT IN (SELECT id FROM a6_delete)) ranked
WHERE rank > 1 AND NOT referenced;

INSERT INTO public."CatalogueAuditBackup"(audit, "tableName", "rowId", before)
SELECT d.audit, 'Serving', s.id, to_jsonb(s) FROM public."Serving" s JOIN a6_delete d USING (id);
DELETE FROM public."Serving" s USING a6_delete d WHERE s.id = d.id;

-- 3. "oz" and "g" servings whose one unit weighs a whole multiple ("oz" = 85 g is 3 oz; "g" = 100 g is 100 g):
-- the amount becomes that multiple, so one unit is an ounce or a gram again. Weights are unchanged.
CREATE TEMP TABLE a6_units ON COMMIT DROP AS
SELECT v.id, CASE WHEN v.norm IN ('g','gram','grams','gr','grm') THEN round(v.per) ELSE round(v.per / 28.3495) END AS n
FROM a6_sv v
WHERE v.id NOT IN (SELECT id FROM a6_delete) AND v.per > 0 AND (
  (v.norm IN ('g','gram','grams','gr','grm') AND v.per >= 2 AND abs(v.per - round(v.per)) <= 0.02 * v.per)
  OR (v.norm IN ('oz','ounce','ounces','wt. oz','wt oz','oza') AND round(v.per / 28.3495) >= 2
      AND abs(v.per / 28.3495 - round(v.per / 28.3495)) <= 0.03 * round(v.per / 28.3495)));
INSERT INTO public."CatalogueAuditBackup"(audit, "tableName", "rowId", before)
SELECT 'A6_unit_multiple', 'Serving', s.id, to_jsonb(s) FROM public."Serving" s JOIN a6_units USING (id);
UPDATE public."Serving" s SET "defaultServingAmount" = u.n * s."defaultServingAmount" FROM a6_units u WHERE s.id = u.id;

-- 4. "serving (28 g)": the app already shows the weight, so a matching "(N g)" is removed from the name.
CREATE TEMP TABLE a6_names ON COMMIT DROP AS
SELECT v.id, btrim(regexp_replace(v."servingName", '\s*\(\s*\d+(\.\d+)?\s*g\s*\)\s*', ' ', 'i')) AS name
FROM a6_sv v, LATERAL (SELECT (regexp_match(v."servingName", '\(\s*(\d+(?:\.\d+)?)\s*g\s*\)', 'i'))[1]::numeric AS g) m
WHERE v.id NOT IN (SELECT id FROM a6_delete) AND m.g IS NOT NULL AND v.w > 0
  AND (abs(m.g - v.w) <= 0.02 * v.w OR abs(m.g - v.per) <= 0.02 * v.per);
DELETE FROM a6_names WHERE length(name) = 0;
INSERT INTO public."CatalogueAuditBackup"(audit, "tableName", "rowId", before)
SELECT 'A6_grams_in_name', 'Serving', s.id, to_jsonb(s) FROM public."Serving" s JOIN a6_names USING (id);
UPDATE public."Serving" s SET "servingName" = n.name FROM a6_names n WHERE s.id = n.id;
