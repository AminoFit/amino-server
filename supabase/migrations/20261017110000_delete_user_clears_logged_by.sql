-- Account deletion clears "loggedByUserId" itself (2026-10-17, replaces delete_user_data from 20261015010000).
-- Deleting the auth user cascades to "User", and Message."loggedByUserId" (ON DELETE SET NULL) then updates the meals
-- the user logged for other people. That update ran outside this function, without app.meal_operation_write, so
-- guard_meal_message_write would refuse it for a meal owned by the operation protocol (operationOwned or an active
-- operation), and the account would stay half deleted. The function now nulls those references in its own
-- transaction, with the settings the meal guards expect; "loggedByName" stays, as it does after unlinking.
--
-- It also no longer deletes from "FoodImage" by "foodItemId": that column was dropped in 2023 (icons are shared through
-- "FoodItemImages", which cascades with the food), and the statement failed every deletion since 20261015010000.
SET lock_timeout = '3s';

CREATE OR REPLACE FUNCTION public.delete_user_data(p_user_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE
  meals integer[];
  logged integer[];
  kept integer[];
  gone integer[];
  simple text[][] := ARRAY[['OpenAiUsage','userId'],['SmsAuthCode','userId'],['SmsMessage','userId'],
    ['McpRequest','userId'],['WebSignIn','userId'],['UserMessageImages','userId']];
  pair text[];
BEGIN
  IF p_user_id IS NULL THEN RAISE EXCEPTION 'Invalid user' USING ERRCODE = '22023'; END IF;
  -- The meal guards (20260926000000) let this transaction delete meals the operation protocol owns.
  PERFORM pg_catalog.set_config('app.meal_operation_write', 'true', true);
  -- Meals this user logged for others keep their owner and lose the reference (guard_logged_by allows it here).
  PERFORM pg_catalog.set_config('app.logged_by_write', 'true', true);
  UPDATE public."Message" SET "loggedByUserId" = NULL WHERE "loggedByUserId" = p_user_id AND "userId" <> p_user_id;
  -- Links end first (20261015020000), so the people they shared with keep copies of the foods they used.
  IF pg_catalog.to_regprocedure('public.end_all_links(uuid)') IS NOT NULL THEN
    EXECUTE 'SELECT public.end_all_links($1)' USING p_user_id;
  END IF;
  SELECT coalesce(array_agg(id), '{}') INTO meals FROM public."Message" WHERE "userId" = p_user_id;
  SELECT coalesce(array_agg(id), '{}') INTO logged FROM public."LoggedFoodItem" WHERE "userId" = p_user_id;

  DELETE FROM public."userSubmittedBug" WHERE message_id = ANY(meals) OR logged_food_id = ANY(logged);
  DELETE FROM public."UserMessageImages" WHERE "messageId" = ANY(meals);
  IF pg_catalog.to_regclass('public."MealOperation"') IS NOT NULL THEN
    DELETE FROM public."MealOutbox" WHERE "operationId" IN
      (SELECT id FROM public."MealOperation" WHERE "userId" = p_user_id OR "messageId" = ANY(meals));
    DELETE FROM public."MealRevision" WHERE "userId" = p_user_id OR "messageId" = ANY(meals);
    DELETE FROM public."MealOperation" WHERE "userId" = p_user_id OR "messageId" = ANY(meals);
  END IF;
  DELETE FROM public."LoggedFoodItem" WHERE id = ANY(logged);
  DELETE FROM public."Message" WHERE id = ANY(meals);
  FOREACH pair SLICE 1 IN ARRAY simple LOOP
    IF pg_catalog.to_regclass(pg_catalog.format('public.%I', pair[1])) IS NOT NULL THEN
      EXECUTE pg_catalog.format('DELETE FROM public.%I WHERE %I = $1', pair[1], pair[2]) USING p_user_id;
    END IF;
  END LOOP;

  WITH mine AS (SELECT id FROM public."FoodItem" WHERE "privateToUserId" = p_user_id),
  used AS (
    SELECT m.id FROM mine m WHERE EXISTS (SELECT 1 FROM public."LoggedFoodItem" l WHERE l."foodItemId" = m.id)
      OR EXISTS (SELECT 1 FROM public."RecipeIngredient" r JOIN public."FoodItem" rf ON rf.id = r."recipeFoodItemId"
                 WHERE r."foodItemId" = m.id AND rf."privateToUserId" IS DISTINCT FROM p_user_id)),
  closure AS (
    SELECT id FROM used
    UNION SELECT r."foodItemId" FROM public."RecipeIngredient" r JOIN used u ON u.id = r."recipeFoodItemId"
      JOIN mine m ON m.id = r."foodItemId")
  SELECT coalesce(array_agg(id), '{}') INTO kept FROM closure;
  SELECT coalesce(array_agg(id), '{}') INTO gone FROM public."FoodItem"
    WHERE "privateToUserId" = p_user_id AND NOT (id = ANY(kept));

  UPDATE public."FoodItem" SET "archivedAt" = coalesce("archivedAt", now()), "lastUpdated" = now() WHERE id = ANY(kept);
  DELETE FROM public."RecipeIngredient" WHERE "recipeFoodItemId" = ANY(gone);
  DELETE FROM public."userSubmittedBug" WHERE food_item_id = ANY(gone);
  DELETE FROM public."Serving" WHERE "foodItemId" = ANY(gone);
  DELETE FROM public."Nutrient" WHERE "foodItemId" = ANY(gone);
  DELETE FROM public."FoodItem" WHERE id = ANY(gone);

  RETURN jsonb_build_object('meals', cardinality(meals), 'loggedFoods', cardinality(logged),
    'foodsDeleted', cardinality(gone), 'foodsKept', cardinality(kept));
END;
$function$;

REVOKE ALL ON FUNCTION public.delete_user_data(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.delete_user_data(uuid) TO service_role;

NOTIFY pgrst, 'reload schema';
