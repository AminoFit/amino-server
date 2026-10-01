-- Logs several foods the user picked themselves (Add Food's tray) as one new resolved meal. Every item is priced by the
-- server (insert_priced_food_row), so recipes are logged by the portion and every nutrient is stored. p_local_id makes a
-- retried request return the meal it already created. The agent never runs on these meals: they are created RESOLVED.
CREATE OR REPLACE FUNCTION public.log_foods_as_meal(p_user_id uuid, p_local_id uuid, p_consumed_on timestamp,
  p_content text, p_items jsonb)
RETURNS TABLE(message_id integer, logged_food_item_ids integer[], created boolean)
LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $function$
DECLARE meal integer;
  item jsonb;
  item_index integer := 0;
  ids integer[] := '{}';
  item_count integer := coalesce(pg_catalog.jsonb_array_length(p_items), 0);
BEGIN
  IF p_user_id IS NULL OR p_local_id IS NULL OR p_consumed_on IS NULL OR pg_catalog.jsonb_typeof(p_items) <> 'array'
    OR item_count = 0 OR item_count > 50
  THEN RAISE EXCEPTION 'Invalid meal' USING ERRCODE = '22023'; END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('meal_local:' || p_local_id::text, 0));
  SELECT m.id INTO meal FROM public."Message" m WHERE m.local_id = p_local_id::text AND m."userId" = p_user_id;
  IF meal IS NOT NULL THEN
    RETURN QUERY SELECT meal, (SELECT coalesce(array_agg(l.id ORDER BY l.id), '{}') FROM public."LoggedFoodItem" l
      WHERE l."messageId" = meal), false;
    RETURN;
  END IF;
  FOR item IN SELECT value FROM pg_catalog.jsonb_array_elements(p_items) LOOP
    IF coalesce((item->>'grams')::float8, 0) <= 0 THEN RAISE EXCEPTION 'Invalid meal' USING ERRCODE = '22023'; END IF;
    IF NOT EXISTS (SELECT 1 FROM public."FoodItem" f WHERE f.id = (item->>'foodItemId')::integer AND f."archivedAt" IS NULL
        AND (f."privateToUserId" IS NULL OR f."privateToUserId" = p_user_id))
    THEN RAISE EXCEPTION 'food_unavailable' USING ERRCODE = 'P0002'; END IF;
  END LOOP;
  INSERT INTO public."Message" (content, role, "messageType", status, "userId", "consumedOn", "createdAt", "resolvedAt",
    "itemsToProcess", "itemsProcessed", hasimages, local_id)
  VALUES (left(coalesce(p_content, ''), 8000), 'User', 'FOOD_LOG_REQUEST', 'RESOLVED', p_user_id, p_consumed_on,
    (now() AT TIME ZONE 'utc'), (now() AT TIME ZONE 'utc'), item_count, item_count, false, p_local_id::text)
  RETURNING id INTO meal;
  FOR item IN SELECT value FROM pg_catalog.jsonb_array_elements(p_items) LOOP
    -- Each row gets its own stable local id, derived from the meal's.
    ids := ids || public.insert_priced_food_row(p_user_id, meal, p_consumed_on, 0,
      pg_catalog.md5(p_local_id::text || ':' || item_index)::uuid, item);
    item_index := item_index + 1;
  END LOOP;
  RETURN QUERY SELECT meal, ids, true;
END;
$function$;
REVOKE ALL ON FUNCTION public.log_foods_as_meal(uuid, uuid, timestamp, text, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.log_foods_as_meal(uuid, uuid, timestamp, text, jsonb) TO service_role;
