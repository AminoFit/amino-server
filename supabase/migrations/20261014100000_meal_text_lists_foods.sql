-- A meal logged from picked foods (Add Food's tray, one food, or an agent's log_meal without a note) has no words of its
-- own: its text is the list of its foods, "Kefir (1 cup), Beef & Broccoli Rice Bowls (1 portion)", and the log shows it
-- as the meal's title. When its foods changed (removed in the app, swapped by an agent) the title kept the old list
-- (meal 30512 still named two foods deleted in the app and a bowl an agent swapped for Chicken Pasta Sauce; the agent,
-- unable to change the text, logged the meal again and deleted it). Such a meal is
-- marked, and its text follows its foods whatever changes them. Any other change to the text (the user's words, an
-- agent's note) ends that, so words are never rewritten.

ALTER TABLE public."Message" ADD COLUMN IF NOT EXISTS "listsFoods" boolean NOT NULL DEFAULT false;
COMMENT ON COLUMN public."Message"."listsFoods" IS 'The text is the list of the meal''s foods and is rewritten when they change.';

-- The meal's foods as its text lists them, as describe() in src/userFoods/userFoods.ts writes them; null when a food
-- has no amount to show or the meal has no foods.
CREATE OR REPLACE FUNCTION public.meal_food_list(p_message_id integer) RETURNS text
LANGUAGE sql STABLE SET search_path = '' AS $function$
  SELECT CASE WHEN count(*) > 0 AND bool_and(l."servingAmount" IS NOT NULL AND l."loggedUnit" IS NOT NULL) THEN
    string_agg(f.name || ' (' || pg_catalog.trim_scale(round(l."servingAmount"::numeric, 2))::text || ' ' ||
      CASE WHEN l."loggedUnit" = 'portion' THEN CASE WHEN round(l."servingAmount"::numeric, 2) = 1 THEN 'portion'
        ELSE 'portions' END ELSE l."loggedUnit" END || ')', ', ' ORDER BY l.id) END
  FROM public."LoggedFoodItem" l JOIN public."FoodItem" f ON f.id = l."foodItemId"
  WHERE l."messageId" = p_message_id AND l."deletedAt" IS NULL
$function$;
REVOKE ALL ON FUNCTION public.meal_food_list(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.meal_food_list(integer) TO service_role;

-- After a meal's foods change, from any writer (the app's sync, an agent, the server): a marked meal's text lists them
-- again. Definer rights so the app's own writes update the text too; it only touches the changed foods' meals. A meal
-- the operation protocol owns is left alone (guard_meal_message_write), and a meal with no foods left keeps its text.
CREATE OR REPLACE FUNCTION public.refresh_meal_food_list() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $function$
DECLARE
  meal integer;
  listed text;
BEGIN
  FOR meal IN SELECT DISTINCT id FROM pg_catalog.unnest(ARRAY[
      CASE WHEN TG_OP <> 'INSERT' THEN OLD."messageId" END, CASE WHEN TG_OP <> 'DELETE' THEN NEW."messageId" END]) AS id
    WHERE id IS NOT NULL LOOP
    IF EXISTS (SELECT 1 FROM public."Message" m WHERE m.id = meal AND m."listsFoods" AND m."deletedAt" IS NULL
        AND NOT coalesce(m."operationOwned", false) AND m."activeOperationId" IS NULL) THEN
      listed := public.meal_food_list(meal);
      IF listed IS NOT NULL THEN
        PERFORM pg_catalog.set_config('app.meal_food_list', 'true', true);
        UPDATE public."Message" SET content = left(listed, 8000) WHERE id = meal AND content IS DISTINCT FROM left(listed, 8000);
        PERFORM pg_catalog.set_config('app.meal_food_list', '', true);
      END IF;
    END IF;
  END LOOP;
  RETURN NULL;
END;
$function$;
REVOKE ALL ON FUNCTION public.refresh_meal_food_list() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS refresh_meal_food_list ON public."LoggedFoodItem";
CREATE TRIGGER refresh_meal_food_list
  AFTER INSERT OR DELETE OR UPDATE OF "deletedAt", "servingAmount", "loggedUnit", "foodItemId", "messageId"
  ON public."LoggedFoodItem" FOR EACH ROW EXECUTE FUNCTION public.refresh_meal_food_list();

-- A text written by anything else is the meal's own words from then on.
CREATE OR REPLACE FUNCTION public.end_meal_food_list() RETURNS trigger
LANGUAGE plpgsql SET search_path = '' AS $function$
BEGIN
  IF NEW.content IS DISTINCT FROM OLD.content AND
     coalesce(pg_catalog.current_setting('app.meal_food_list', true), '') <> 'true' THEN NEW."listsFoods" := false; END IF;
  RETURN NEW;
END;
$function$;
REVOKE ALL ON FUNCTION public.end_meal_food_list() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS end_meal_food_list ON public."Message";
CREATE TRIGGER end_meal_food_list BEFORE UPDATE OF content ON public."Message"
  FOR EACH ROW EXECUTE FUNCTION public.end_meal_food_list();

-- Existing meals whose text is the list of the foods they were logged with (the first of their foods, in order,
-- deleted ones included): 21 on 2026-10-06.
WITH parts AS (
  SELECT l."messageId" AS mid, l.id, f.name || ' (' || pg_catalog.trim_scale(round(l."servingAmount"::numeric, 2))::text || ' ' ||
      CASE WHEN l."loggedUnit" = 'portion' THEN CASE WHEN round(l."servingAmount"::numeric, 2) = 1 THEN 'portion'
        ELSE 'portions' END ELSE l."loggedUnit" END || ')' AS part
  FROM public."LoggedFoodItem" l JOIN public."FoodItem" f ON f.id = l."foodItemId"
  WHERE l."messageId" IS NOT NULL AND l."servingAmount" IS NOT NULL AND l."loggedUnit" IS NOT NULL),
prefixes AS (SELECT mid, string_agg(part, ', ') OVER (PARTITION BY mid ORDER BY id) AS listed FROM parts)
UPDATE public."Message" m SET "listsFoods" = true
  WHERE m."deletedAt" IS NULL AND NOT m."listsFoods" AND EXISTS (SELECT 1 FROM prefixes p WHERE p.mid = m.id AND p.listed = m.content);

-- And their lists brought up to date (none were stale on 2026-10-06).
DO $$
DECLARE meal record;
BEGIN
  PERFORM pg_catalog.set_config('app.meal_food_list', 'true', true);
  FOR meal IN SELECT m.id, public.meal_food_list(m.id) AS listed FROM public."Message" m
      WHERE m."listsFoods" AND m."deletedAt" IS NULL AND NOT coalesce(m."operationOwned", false) AND m."activeOperationId" IS NULL LOOP
    IF meal.listed IS NOT NULL THEN
      UPDATE public."Message" SET content = left(meal.listed, 8000) WHERE id = meal.id AND content IS DISTINCT FROM left(meal.listed, 8000);
    END IF;
  END LOOP;
  PERFORM pg_catalog.set_config('app.meal_food_list', '', true);
END $$;
