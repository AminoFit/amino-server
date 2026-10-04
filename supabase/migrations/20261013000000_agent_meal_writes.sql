-- Agents log and change meals (2026-10-03-mcp-food-search-and-writes-plan.md, phase 4). The MCP server calls these for
-- the verified user after checking their "Let agents make changes" setting; agent tokens themselves can't write
-- (20261012000000_agent_access.sql). Meals are changed the way the app changes them (a meal's time with its foods'
-- times; deletions as soft deletes with one timestamp), never the meal agent's: nothing here interprets text.
-- A meal the operation protocol owns, or one still being processed, is refused (55000) until it settles.
SET TimeZone = 'UTC';

-- 1. Which agent logged a meal (its OAuth client and name when it was logged), for "via Claude" in the app.
ALTER TABLE public."Message" ADD COLUMN IF NOT EXISTS "agentClientId" text;
ALTER TABLE public."Message" ADD COLUMN IF NOT EXISTS "agentName" text;
-- What each agent change touched (meal or food ids), for tracing.
ALTER TABLE public."McpRequest" ADD COLUMN IF NOT EXISTS "targetIds" integer[];

-- 2. A meal of the user's that an agent may change now. Errors: P0002 meal_unavailable, 55000 meal_busy.
CREATE OR REPLACE FUNCTION public.agent_editable_meal(p_user_id uuid, p_message_id integer, p_deleted boolean DEFAULT false)
RETURNS public."Message"
LANGUAGE plpgsql SET search_path = '' AS $function$
DECLARE meal public."Message";
BEGIN
  SELECT * INTO meal FROM public."Message" m WHERE m.id = p_message_id AND m."userId" = p_user_id AND m.role = 'User'
    AND (m."deletedAt" IS NOT NULL) = p_deleted
  FOR UPDATE;
  IF NOT FOUND OR NOT public.mcp_is_meal(meal) THEN RAISE EXCEPTION 'meal_unavailable' USING ERRCODE = 'P0002'; END IF;
  IF meal."operationOwned" OR meal."activeOperationId" IS NOT NULL OR meal.status::text <> 'RESOLVED' THEN
    RAISE EXCEPTION 'meal_busy' USING ERRCODE = '55000'; END IF;
  RETURN meal;
END;
$function$;

-- A logged food of the user's in a meal an agent may change.
CREATE OR REPLACE FUNCTION public.agent_editable_food(p_user_id uuid, p_logged_food_item_id integer)
RETURNS public."LoggedFoodItem"
LANGUAGE plpgsql SET search_path = '' AS $function$
DECLARE food public."LoggedFoodItem";
BEGIN
  SELECT * INTO food FROM public."LoggedFoodItem" l WHERE l.id = p_logged_food_item_id AND l."userId" = p_user_id
    AND l."deletedAt" IS NULL;
  IF NOT FOUND OR food."messageId" IS NULL THEN RAISE EXCEPTION 'food_unavailable' USING ERRCODE = 'P0002'; END IF;
  PERFORM public.agent_editable_meal(p_user_id, food."messageId");
  SELECT * INTO food FROM public."LoggedFoodItem" l WHERE l.id = p_logged_food_item_id FOR UPDATE;
  RETURN food;
END;
$function$;

-- 3. The meal's time (UTC wall clock, as stored), with its foods.
CREATE OR REPLACE FUNCTION public.agent_move_meal(p_user_id uuid, p_message_id integer, p_consumed_on timestamp)
RETURNS void
LANGUAGE plpgsql SET search_path = '' AS $function$
BEGIN
  -- Planned and every-day meals are logged ahead; more than a year either way is a typo.
  IF p_consumed_on IS NULL OR abs(extract(epoch FROM p_consumed_on - (now() AT TIME ZONE 'UTC'))) > 366 * 86400 THEN
    RAISE EXCEPTION 'invalid_time' USING ERRCODE = '22023'; END IF;
  PERFORM public.agent_editable_meal(p_user_id, p_message_id);
  UPDATE public."LoggedFoodItem" SET "consumedOn" = p_consumed_on WHERE "messageId" = p_message_id AND "deletedAt" IS NULL;
  UPDATE public."Message" SET "consumedOn" = p_consumed_on WHERE id = p_message_id;
END;
$function$;

-- 4. One food's amount, priced by the server (p_item as log_foods_as_meal takes it: foodItemId, grams, servingId,
-- servingAmount, loggedUnit, nutrition). Every nutrient is replaced, so none is left from the old amount.
CREATE OR REPLACE FUNCTION public.agent_set_meal_food(p_user_id uuid, p_logged_food_item_id integer, p_item jsonb)
RETURNS void
LANGUAGE plpgsql SET search_path = '' AS $function$
DECLARE food public."LoggedFoodItem";
  n public."LoggedFoodItem";
BEGIN
  food := public.agent_editable_food(p_user_id, p_logged_food_item_id);
  IF (p_item->>'foodItemId')::integer IS DISTINCT FROM food."foodItemId" OR coalesce((p_item->>'grams')::float8, 0) <= 0 THEN
    RAISE EXCEPTION 'invalid_amount' USING ERRCODE = '22023'; END IF;
  n := jsonb_populate_record(NULL::public."LoggedFoodItem", p_item->'nutrition');
  UPDATE public."LoggedFoodItem" SET grams = (p_item->>'grams')::float8, "servingId" = (p_item->>'servingId')::integer,
    "servingAmount" = (p_item->>'servingAmount')::float8, "loggedUnit" = p_item->>'loggedUnit',
    kcal = n.kcal, "proteinG" = n."proteinG", "carbG" = n."carbG", "totalFatG" = n."totalFatG", "satFatG" = n."satFatG",
    "transFatG" = n."transFatG", "unsatFatG" = n."unsatFatG", "polyunsatFatG" = n."polyunsatFatG",
    "monounsatFatG" = n."monounsatFatG", "fiberG" = n."fiberG", "sugarG" = n."sugarG", "addedSugarG" = n."addedSugarG",
    "waterMl" = n."waterMl", "vitaminAMcg" = n."vitaminAMcg", "vitaminCMg" = n."vitaminCMg", "vitaminDMcg" = n."vitaminDMcg",
    "vitaminEMg" = n."vitaminEMg", "vitaminKMcg" = n."vitaminKMcg", "vitaminB1Mg" = n."vitaminB1Mg",
    "vitaminB2Mg" = n."vitaminB2Mg", "vitaminB3Mg" = n."vitaminB3Mg", "vitaminB5Mg" = n."vitaminB5Mg",
    "vitaminB6Mg" = n."vitaminB6Mg", "vitaminB7Mcg" = n."vitaminB7Mcg", "vitaminB9Mcg" = n."vitaminB9Mcg",
    "vitaminB12Mcg" = n."vitaminB12Mcg", "calciumMg" = n."calciumMg", "ironMg" = n."ironMg",
    "magnesiumMg" = n."magnesiumMg", "phosphorusMg" = n."phosphorusMg", "potassiumMg" = n."potassiumMg",
    "sodiumMg" = n."sodiumMg", "zincMg" = n."zincMg", "copperMg" = n."copperMg", "manganeseMg" = n."manganeseMg",
    "seleniumMcg" = n."seleniumMcg", "iodineMcg" = n."iodineMcg", "cholesterolMg" = n."cholesterolMg",
    "omega3Mg" = n."omega3Mg", "omega6Mg" = n."omega6Mg", "caffeineMg" = n."caffeineMg", "alcoholG" = n."alcoholG"
  WHERE id = p_logged_food_item_id;
END;
$function$;

-- 5. One food out of a meal (soft delete). The last food can't go: delete the meal instead.
CREATE OR REPLACE FUNCTION public.agent_remove_meal_food(p_user_id uuid, p_logged_food_item_id integer)
RETURNS integer
LANGUAGE plpgsql SET search_path = '' AS $function$
DECLARE food public."LoggedFoodItem";
BEGIN
  food := public.agent_editable_food(p_user_id, p_logged_food_item_id);
  IF NOT EXISTS (SELECT 1 FROM public."LoggedFoodItem" l WHERE l."messageId" = food."messageId" AND l."deletedAt" IS NULL
      AND l.id <> p_logged_food_item_id) THEN
    RAISE EXCEPTION 'last_food' USING ERRCODE = '22023'; END IF;
  UPDATE public."LoggedFoodItem" SET "deletedAt" = now() AT TIME ZONE 'UTC' WHERE id = p_logged_food_item_id;
  RETURN food."messageId";
END;
$function$;

-- 6. Foods added to a meal, priced by the server, at the meal's time.
CREATE OR REPLACE FUNCTION public.agent_add_meal_foods(p_user_id uuid, p_message_id integer, p_items jsonb)
RETURNS integer[]
LANGUAGE plpgsql SET search_path = '' AS $function$
DECLARE meal public."Message";
  item jsonb;
  ids integer[] := '{}';
  item_count integer := coalesce(pg_catalog.jsonb_array_length(p_items), 0);
BEGIN
  IF pg_catalog.jsonb_typeof(p_items) <> 'array' OR item_count = 0 OR item_count > 50 THEN
    RAISE EXCEPTION 'invalid_meal' USING ERRCODE = '22023'; END IF;
  meal := public.agent_editable_meal(p_user_id, p_message_id);
  FOR item IN SELECT value FROM pg_catalog.jsonb_array_elements(p_items) LOOP
    IF coalesce((item->>'grams')::float8, 0) <= 0 THEN RAISE EXCEPTION 'invalid_meal' USING ERRCODE = '22023'; END IF;
    IF NOT EXISTS (SELECT 1 FROM public."FoodItem" f WHERE f.id = (item->>'foodItemId')::integer AND f."archivedAt" IS NULL
        AND (f."privateToUserId" IS NULL OR f."privateToUserId" = p_user_id))
    THEN RAISE EXCEPTION 'food_unavailable' USING ERRCODE = 'P0002'; END IF;
    ids := ids || public.insert_priced_food_row(p_user_id, p_message_id, coalesce(meal."consumedOn", meal."createdAt"), 0,
      gen_random_uuid(), item);
  END LOOP;
  UPDATE public."Message" SET "itemsToProcess" = coalesce("itemsToProcess", 0) + item_count,
    "itemsProcessed" = coalesce("itemsProcessed", 0) + item_count WHERE id = p_message_id;
  RETURN ids;
END;
$function$;

-- 7. A whole meal (soft delete: the meal and its foods with one timestamp, so a restore brings back exactly those).
-- Its photos stay, unlike a delete in the app, so the meal can come back whole.
CREATE OR REPLACE FUNCTION public.agent_delete_meal(p_user_id uuid, p_message_id integer)
RETURNS void
LANGUAGE plpgsql SET search_path = '' AS $function$
DECLARE at timestamp := now() AT TIME ZONE 'UTC';
BEGIN
  PERFORM public.agent_editable_meal(p_user_id, p_message_id);
  UPDATE public."LoggedFoodItem" SET "deletedAt" = at WHERE "messageId" = p_message_id AND "deletedAt" IS NULL;
  UPDATE public."Message" SET "deletedAt" = at WHERE id = p_message_id;
END;
$function$;

-- 8. A meal deleted in the last 30 days (by an agent or in the app), with the foods deleted with it.
CREATE OR REPLACE FUNCTION public.agent_restore_meal(p_user_id uuid, p_message_id integer)
RETURNS void
LANGUAGE plpgsql SET search_path = '' AS $function$
DECLARE meal public."Message";
BEGIN
  meal := public.agent_editable_meal(p_user_id, p_message_id, true);
  IF meal."deletedAt" < (now() AT TIME ZONE 'UTC') - interval '30 days' THEN
    RAISE EXCEPTION 'restore_expired' USING ERRCODE = '22023'; END IF;
  -- The app and agent_delete_meal give a meal and its foods the same deletedAt; a food removed before stays removed.
  UPDATE public."LoggedFoodItem" SET "deletedAt" = NULL WHERE "messageId" = p_message_id AND "deletedAt" = meal."deletedAt";
  UPDATE public."Message" SET "deletedAt" = NULL WHERE id = p_message_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.agent_editable_meal(uuid, integer, boolean), public.agent_editable_food(uuid, integer),
  public.agent_move_meal(uuid, integer, timestamp), public.agent_set_meal_food(uuid, integer, jsonb),
  public.agent_remove_meal_food(uuid, integer), public.agent_add_meal_foods(uuid, integer, jsonb),
  public.agent_delete_meal(uuid, integer), public.agent_restore_meal(uuid, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.agent_editable_meal(uuid, integer, boolean), public.agent_editable_food(uuid, integer),
  public.agent_move_meal(uuid, integer, timestamp), public.agent_set_meal_food(uuid, integer, jsonb),
  public.agent_remove_meal_food(uuid, integer), public.agent_add_meal_foods(uuid, integer, jsonb),
  public.agent_delete_meal(uuid, integer), public.agent_restore_meal(uuid, integer) TO service_role;

-- 9. Meals as agents read them: each food's foodId (to log it again or look it up), and who logged the meal.
CREATE OR REPLACE FUNCTION public.mcp_meal_json(m public."Message", p_tz text, p_all boolean) RETURNS jsonb
LANGUAGE sql STABLE SET search_path = '' AS $function$
  WITH keys AS (
    SELECT key, ord FROM unnest(CASE WHEN p_all THEN ARRAY['kcal', 'proteinG', 'carbG', 'totalFatG', 'satFatG',
      'transFatG', 'unsatFatG', 'polyunsatFatG', 'monounsatFatG', 'fiberG', 'sugarG', 'addedSugarG', 'waterMl',
      'vitaminAMcg', 'vitaminCMg', 'vitaminDMcg', 'vitaminEMg', 'vitaminKMcg', 'vitaminB1Mg', 'vitaminB2Mg',
      'vitaminB3Mg', 'vitaminB5Mg', 'vitaminB6Mg', 'vitaminB7Mcg', 'vitaminB9Mcg', 'vitaminB12Mcg', 'calciumMg',
      'ironMg', 'magnesiumMg', 'phosphorusMg', 'potassiumMg', 'sodiumMg', 'zincMg', 'copperMg', 'manganeseMg',
      'seleniumMcg', 'iodineMcg', 'cholesterolMg', 'omega3Mg', 'omega6Mg', 'caffeineMg', 'alcoholG']
      ELSE ARRAY['kcal', 'proteinG', 'carbG', 'totalFatG', 'satFatG', 'fiberG', 'sugarG', 'sodiumMg'] END)
      WITH ORDINALITY AS k(key, ord)
  ), foods AS (
    SELECT l.id, l."foodItemId" AS food_id, f.name, f.brand, l."servingAmount" AS amount,
      coalesce(l."loggedUnit", s."servingName") AS unit, l.grams, to_jsonb(l) AS row
    FROM public."LoggedFoodItem" l
    LEFT JOIN public."FoodItem" f ON f.id = l."foodItemId"
    LEFT JOIN public."Serving" s ON s.id = l."servingId"
    WHERE l."messageId" = m.id AND l."deletedAt" IS NULL
  ), eaten AS (
    SELECT coalesce(m."consumedOn", m."createdAt")::timestamp AS utc
  )
  SELECT jsonb_strip_nulls(jsonb_build_object(
    'id', m.id,
    'eatenAt', to_char(e.utc, 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
    'localDate', to_char((e.utc AT TIME ZONE 'UTC') AT TIME ZONE p_tz, 'YYYY-MM-DD'),
    'localTime', to_char((e.utc AT TIME ZONE 'UTC') AT TIME ZONE p_tz, 'HH24:MI'),
    'text', nullif(btrim(m.content), ''),
    'input', CASE WHEN m."agentClientId" IS NOT NULL THEN 'agent'
      WHEN m.hasimages THEN CASE WHEN btrim(coalesce(m.content, '')) <> '' THEN 'photo+text' ELSE 'photo' END
      WHEN m."isAudio" THEN 'voice' ELSE 'text' END,
    'loggedBy', CASE WHEN m."agentClientId" IS NOT NULL THEN coalesce(m."agentName", 'an AI agent') END,
    'status', CASE m.status::text WHEN 'RESOLVED' THEN 'logged' WHEN 'FAILED' THEN 'failed' ELSE 'processing' END,
    'totals', (SELECT jsonb_object_agg(t.key, t.total ORDER BY t.ord) FROM (
        SELECT k.key, k.ord, pg_catalog.trim_scale(round(sum((f.row->>k.key)::numeric), 2)) AS total
        FROM keys k CROSS JOIN foods f GROUP BY k.key, k.ord) t WHERE t.total IS NOT NULL),
    'items', coalesce((SELECT jsonb_agg(jsonb_strip_nulls(jsonb_build_object('id', f.id, 'foodId', f.food_id, 'food', f.name,
        'brand', f.brand, 'amount', f.amount, 'unit', f.unit, 'grams', pg_catalog.trim_scale(round(f.grams::numeric, 1))))
        || coalesce((SELECT jsonb_object_agg(k.key, pg_catalog.trim_scale(round((f.row->>k.key)::numeric, 2))
          ORDER BY k.ord) FROM keys k WHERE f.row->>k.key IS NOT NULL), '{}'::jsonb)
      ORDER BY f.id) FROM foods f), '[]'::jsonb)))
  FROM eaten e;
$function$;

-- 10. Kill switch for agent writes: unchanged (mcp_writes, owner first).
