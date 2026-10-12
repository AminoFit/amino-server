-- Foods added to a published meal outside the operation protocol take the meal's revision (2026-10-12). The app only
-- shows a meal's foods at its current revision (syncLoggedFoodItem applyRefreshChanges skips older active rows), and
-- new LoggedFoodItem rows default to revision 0, so an agent's add_to_meal on a meal at revision 2 (Atoria's lavash and
-- Kraft cheese in meal 30614) reached the server, the MCP and the web but never the phones. Protocol writes
-- (app.meal_operation_write) set their own revision and are left alone. The two hidden rows are re-stamped and their
-- updatedAt moves, so the phones pull them.
SET lock_timeout = '3s';

CREATE OR REPLACE FUNCTION public.logged_food_take_meal_revision() RETURNS trigger
LANGUAGE plpgsql SET search_path = '' AS $function$
BEGIN
  IF NEW."messageId" IS NOT NULL AND coalesce(NEW."publishedRevision", 0) = 0
    AND pg_catalog.current_setting('app.meal_operation_write', true) IS DISTINCT FROM 'true' THEN
    SELECT coalesce(m."publishedRevision", 0) INTO NEW."publishedRevision" FROM public."Message" m WHERE m.id = NEW."messageId";
    NEW."publishedRevision" := coalesce(NEW."publishedRevision", 0);
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS "LoggedFoodItem_take_meal_revision" ON public."LoggedFoodItem";
CREATE TRIGGER "LoggedFoodItem_take_meal_revision" BEFORE INSERT ON public."LoggedFoodItem"
  FOR EACH ROW EXECUTE FUNCTION public.logged_food_take_meal_revision();

-- Rows already hidden: active foods older than their published meal's revision.
UPDATE public."LoggedFoodItem" l SET "publishedRevision" = m."publishedRevision", "updatedAt" = now()
FROM public."Message" m
WHERE m.id = l."messageId" AND l."deletedAt" IS NULL AND m."deletedAt" IS NULL AND m."publishedRevision" > 0
  AND coalesce(l."publishedRevision", 0) < m."publishedRevision";
