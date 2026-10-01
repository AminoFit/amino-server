-- Servings that only repeat a unit the app always offers ("g" at 1 g, "oz" / "ONZ" / "wt oz" at an ounce) are never
-- stored again, whichever path creates them (agent sources, USDA picks, labels, barcodes, the user's own foods): a
-- trigger skips them. Existing ones that no log, favourite or recipe uses are deleted (backed up first). Ones that are
-- used stay; the app offers the built-in unit in their place. Volume servings ("8 fl oz", "325 ml") are kept: a food
-- that isn't a drink has no mL unit in the app.

CREATE OR REPLACE FUNCTION public.serving_repeats_builtin_unit(p_name text, p_grams double precision, p_amount numeric)
RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path = '' AS $function$
  SELECT coalesce(p_grams, 0) > 0 AND coalesce(p_amount, 0) > 0 AND (
    (pg_catalog.lower(pg_catalog.btrim(pg_catalog.regexp_replace(pg_catalog.regexp_replace(p_name, '\s*\(.*?\)\s*', ' ', 'g'), '\.$', '')))
       ~ '^(1 )?(g|gr|grm|gram|grams)$' AND abs(p_grams / p_amount - 1) <= 0.03)
    OR (pg_catalog.lower(pg_catalog.btrim(pg_catalog.regexp_replace(pg_catalog.regexp_replace(p_name, '\s*\(.*?\)\s*', ' ', 'g'), '\.$', '')))
       ~ '^(1 )?(oz|onz|ounce|ounces|wt\.? ?oz)$' AND abs(p_grams / p_amount - 28.3495) <= 0.85))
$function$;

CREATE OR REPLACE FUNCTION public.skip_builtin_unit_serving() RETURNS trigger
LANGUAGE plpgsql SET search_path = '' AS $function$
BEGIN
  IF public.serving_repeats_builtin_unit(NEW."servingName", NEW."servingWeightGram", NEW."defaultServingAmount") THEN
    -- An insert is skipped; an update that would turn a serving into one keeps the row as it was.
    RETURN CASE WHEN TG_OP = 'UPDATE' THEN OLD ELSE NULL END;
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS skip_builtin_unit_serving ON public."Serving";
CREATE TRIGGER skip_builtin_unit_serving BEFORE INSERT OR UPDATE OF "servingName", "servingWeightGram", "defaultServingAmount"
  ON public."Serving" FOR EACH ROW EXECUTE FUNCTION public.skip_builtin_unit_serving();

CREATE TEMP TABLE builtin_unit_servings ON COMMIT DROP AS
SELECT s.id FROM public."Serving" s
WHERE public.serving_repeats_builtin_unit(s."servingName", s."servingWeightGram", s."defaultServingAmount")
  AND NOT EXISTS (SELECT 1 FROM public."LoggedFoodItem" l WHERE l."servingId" = s.id)
  AND NOT EXISTS (SELECT 1 FROM public."UserFavoriteFoodItem" u WHERE u."servingId" = s.id)
  AND NOT EXISTS (SELECT 1 FROM public."RecipeIngredient" r WHERE r."servingId" = s.id);

INSERT INTO public."CatalogueAuditBackup"(audit, "tableName", "rowId", before)
SELECT 'builtin_unit_serving', 'Serving', s.id, to_jsonb(s) FROM public."Serving" s JOIN builtin_unit_servings USING (id);
DELETE FROM public."Serving" s USING builtin_unit_servings b WHERE s.id = b.id;
