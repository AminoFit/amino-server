-- A new version of a user's food or recipe keeps the date the food was first created, so the Foods tab can show
-- "Created Sep 29" however often it is edited (lastUpdated is the edit date).
CREATE OR REPLACE FUNCTION public.keep_user_food_created_date() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $function$
BEGIN
  SELECT f."createdAtDateTime" INTO NEW."createdAtDateTime" FROM public."FoodItem" f WHERE f.id = NEW."previousVersionId";
  RETURN NEW;
END;
$function$;
DROP TRIGGER IF EXISTS keep_user_food_created_date ON public."FoodItem";
CREATE TRIGGER keep_user_food_created_date BEFORE INSERT ON public."FoodItem"
  FOR EACH ROW WHEN (NEW."previousVersionId" IS NOT NULL) EXECUTE FUNCTION public.keep_user_food_created_date();
