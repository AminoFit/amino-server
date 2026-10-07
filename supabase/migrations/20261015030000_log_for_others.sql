-- People and sharing, phase 4 (2026-10-07, plan: 2026-10-07-people-and-sharing-plan.md): logging meals for each other.
--
-- A logs into B's diary only while they're linked and B's grant to A allows it (LinkGrant."canLogForMe"); the check
-- holds B's grant row for the transaction, so a revoke can't slip between the check and the write. Each person gets
-- their own meal (Message."loggedByUserId"/"loggedByName", shared "logGroupId"), priced the same. Any of A's own private
-- foods it uses are shared with B (FoodShare reason 'log'), so B can log them again. Foods someone else shared with A
-- can't be passed on. Same amounts for everyone; each person changes their own portion afterwards (owner).

SET TimeZone = 'UTC';

-- An AI meal for several people: the app sets "copyTo" ([{"userId", "consumedOn"}]) on the logger's own meal; when it
-- resolves, everyone listed gets a copy and "copiedTo" records each result.
ALTER TABLE public."Message" ADD COLUMN IF NOT EXISTS "copyTo" jsonb;
ALTER TABLE public."Message" ADD COLUMN IF NOT EXISTS "copiedTo" jsonb;

CREATE OR REPLACE FUNCTION public.can_log_for(p_actor uuid, p_target uuid) RETURNS boolean
LANGUAGE sql STABLE SET search_path = '' AS $function$
  SELECT p_actor = p_target OR coalesce((public.link_grant(p_target, p_actor))."canLogForMe", false)
$function$;

-- Holds the target's grant to the actor for this transaction, or refuses.
CREATE OR REPLACE FUNCTION public.lock_log_grant(p_actor uuid, p_target uuid) RETURNS void
LANGUAGE plpgsql SET search_path = '' AS $function$
BEGIN
  IF p_actor = p_target THEN RETURN; END IF;
  PERFORM 1 FROM public."LinkGrant" g WHERE g."linkId" = public.active_link(p_target, p_actor) AND g."grantorId" = p_target
    AND g."canLogForMe" FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'not_allowed' USING ERRCODE = 'P0001'; END IF;
END;
$function$;

-- A meal in p_user's diary within 90 minutes that has at least half of these foods (any version): partners who both log
-- dinner for each other.
CREATE OR REPLACE FUNCTION public.similar_meal(p_user_id uuid, p_consumed_on timestamp, p_food_ids integer[]) RETURNS jsonb
LANGUAGE sql STABLE SET search_path = '' AS $function$
  WITH wanted AS (SELECT DISTINCT coalesce(f."lineageId", f.id) k FROM public."FoodItem" f WHERE f.id = ANY(p_food_ids)),
  near AS (
    SELECT m.id, m."consumedOn", m.content, count(DISTINCT w.k) hits
    FROM public."Message" m
    JOIN public."LoggedFoodItem" l ON l."messageId" = m.id AND l."deletedAt" IS NULL
    JOIN public."FoodItem" f ON f.id = l."foodItemId"
    JOIN wanted w ON w.k = coalesce(f."lineageId", f.id)
    WHERE m."userId" = p_user_id AND m."deletedAt" IS NULL
      AND m."consumedOn" BETWEEN p_consumed_on - interval '90 minutes' AND p_consumed_on + interval '90 minutes'
    GROUP BY m.id)
  SELECT jsonb_build_object('messageId', n.id, 'consumedOn', n."consumedOn", 'content', n.content)
  FROM near n WHERE n.hits * 2 >= (SELECT count(*) FROM wanted) AND (SELECT count(*) FROM wanted) > 0
  ORDER BY n.hits DESC, abs(extract(epoch FROM n."consumedOn" - p_consumed_on)) LIMIT 1
$function$;

-- Makes the foods in p_items usable in p_target's diary: the actor's own are shared with them ('log'); the target's own
-- and the catalogue need nothing; anyone else's must already be visible to the target.
CREATE OR REPLACE FUNCTION public.share_foods_for_log(p_actor uuid, p_target uuid, p_food_ids integer[]) RETURNS void
LANGUAGE plpgsql SET search_path = '' AS $function$
DECLARE mine integer[];
  result jsonb;
  blocked text;
BEGIN
  IF p_actor = p_target THEN RETURN; END IF;
  SELECT string_agg(f.name, ', ') INTO blocked FROM public."FoodItem" f
    WHERE f.id = ANY(p_food_ids) AND f."privateToUserId" IS NOT NULL AND f."privateToUserId" NOT IN (p_actor, p_target)
      AND NOT public.food_visible(p_target, f."privateToUserId", f."lineageId");
  IF blocked IS NOT NULL THEN RAISE EXCEPTION 'food_not_shareable' USING ERRCODE = 'P0001', DETAIL = blocked; END IF;
  SELECT coalesce(array_agg(DISTINCT f."lineageId"), '{}') INTO mine FROM public."FoodItem" f
    WHERE f.id = ANY(p_food_ids) AND f."privateToUserId" = p_actor
      AND NOT public.food_visible(p_target, f."privateToUserId", f."lineageId");
  IF cardinality(mine) = 0 THEN RETURN; END IF;
  result := public.share_foods(p_actor, mine, ARRAY[p_target], true, 'log');
  IF jsonb_array_length(result->'refused') > 0 THEN
    RAISE EXCEPTION 'food_not_shareable' USING ERRCODE = 'P0001',
      DETAIL = coalesce((SELECT string_agg(r->>'foods', ', ') FROM jsonb_array_elements(result->'refused') r), '');
  END IF;
END;
$function$;

-- Labels a meal in someone else's diary with who logged it.
CREATE OR REPLACE FUNCTION public.mark_logged_by(p_message_id integer, p_actor uuid, p_group uuid) RETURNS void
LANGUAGE plpgsql SET search_path = '' AS $function$
BEGIN
  PERFORM pg_catalog.set_config('app.logged_by_write', 'true', true);
  UPDATE public."Message" SET "loggedByUserId" = p_actor, "loggedByName" = public.person_name(p_actor), "logGroupId" = p_group
    WHERE id = p_message_id;
END;
$function$;

-- Foods the actor picked (Add Food's tray, an agent's log), priced once by the server, into each target's diary.
-- p_targets: [{"userId", "consumedOn"}] (each person's own time, worked out by the server from their timezone).
-- Nothing is written when a target already has a similar meal, unless p_allow_duplicate.
CREATE OR REPLACE FUNCTION public.log_foods_for_people(p_actor uuid, p_targets jsonb, p_local_id uuid, p_content text,
  p_items jsonb, p_allow_duplicate boolean DEFAULT false) RETURNS jsonb
LANGUAGE plpgsql SET search_path = '' AS $function$
DECLARE target jsonb;
  who uuid;
  food_ids integer[] := ARRAY(SELECT (i->>'foodItemId')::integer FROM jsonb_array_elements(p_items) i);
  duplicates jsonb := '[]';
  near_meal jsonb;
  meals jsonb := '[]';
  logged record;
  group_id uuid := pg_catalog.md5('group:' || p_local_id::text)::uuid;
BEGIN
  IF p_actor IS NULL OR p_local_id IS NULL OR jsonb_typeof(p_targets) <> 'array' OR jsonb_array_length(p_targets) NOT BETWEEN 1 AND 20
  THEN RAISE EXCEPTION 'Invalid meal' USING ERRCODE = '22023'; END IF;
  FOR target IN SELECT value FROM jsonb_array_elements(p_targets) LOOP
    who := (target->>'userId')::uuid;
    PERFORM public.lock_log_grant(p_actor, who);
    IF who <> p_actor AND NOT coalesce(p_allow_duplicate, false) AND NOT EXISTS (
        SELECT 1 FROM public."Message" m WHERE m.local_id = pg_catalog.md5(p_local_id::text || ':' || who::text)::uuid::text) THEN
      near_meal := public.similar_meal(who, (target->>'consumedOn')::timestamp, food_ids);
      IF near_meal IS NOT NULL THEN
        duplicates := duplicates || jsonb_build_object('userId', who, 'name', public.person_name(who), 'meal', near_meal);
      END IF;
    END IF;
  END LOOP;
  IF jsonb_array_length(duplicates) > 0 THEN
    RETURN jsonb_build_object('status', 'possible_duplicate', 'duplicates', duplicates);
  END IF;
  FOR target IN SELECT value FROM jsonb_array_elements(p_targets) LOOP
    who := (target->>'userId')::uuid;
    PERFORM public.share_foods_for_log(p_actor, who, food_ids);
    -- The logger's own meal keeps the app's local id; everyone else's is derived from it, so a retry finds them.
    SELECT * INTO logged FROM public.log_foods_as_meal(who,
      CASE WHEN who = p_actor THEN p_local_id ELSE pg_catalog.md5(p_local_id::text || ':' || who::text)::uuid END,
      (target->>'consumedOn')::timestamp, p_content, p_items);
    IF who <> p_actor AND logged.created THEN PERFORM public.mark_logged_by(logged.message_id, p_actor, group_id); END IF;
    meals := meals || jsonb_build_object('userId', who, 'messageId', logged.message_id, 'created', logged.created,
      'loggedFoodItemIds', to_jsonb(logged.logged_food_item_ids));
  END LOOP;
  RETURN jsonb_build_object('status', 'logged', 'groupId', group_id, 'meals', meals);
END;
$function$;

-- Copies one of the actor's meals (as logged: same foods, amounts and numbers) into other people's diaries. Used for an
-- AI meal once it's worked out, and for "Log for…" on a past meal.
CREATE OR REPLACE FUNCTION public.copy_meal_to_people(p_actor uuid, p_message_id integer, p_targets jsonb,
  p_allow_duplicate boolean DEFAULT false) RETURNS jsonb
LANGUAGE plpgsql SET search_path = '' AS $function$
DECLARE source public."Message"%ROWTYPE;
  target jsonb;
  who uuid;
  meal integer;
  existing integer;
  copy_local text;
  food_ids integer[];
  duplicates jsonb := '[]';
  near_meal jsonb;
  meals jsonb := '[]';
  row_index integer;
  item record;
BEGIN
  SELECT * INTO source FROM public."Message" WHERE id = p_message_id AND "userId" = p_actor AND "deletedAt" IS NULL;
  IF source.id IS NULL THEN RAISE EXCEPTION 'meal_unavailable' USING ERRCODE = 'P0002'; END IF;
  SELECT coalesce(array_agg(l."foodItemId"), '{}') INTO food_ids FROM public."LoggedFoodItem" l
    WHERE l."messageId" = p_message_id AND l."deletedAt" IS NULL AND l."foodItemId" IS NOT NULL;
  IF cardinality(food_ids) = 0 THEN RAISE EXCEPTION 'meal_has_no_foods' USING ERRCODE = 'P0001'; END IF;
  FOR target IN SELECT value FROM jsonb_array_elements(p_targets) LOOP
    who := (target->>'userId')::uuid;
    IF who = p_actor THEN RAISE EXCEPTION 'Invalid meal' USING ERRCODE = '22023'; END IF;
    PERFORM public.lock_log_grant(p_actor, who);
    IF NOT coalesce(p_allow_duplicate, false) THEN
      near_meal := public.similar_meal(who, coalesce((target->>'consumedOn')::timestamp, source."consumedOn"), food_ids);
      IF near_meal IS NOT NULL THEN duplicates := duplicates || jsonb_build_object('userId', who, 'name', public.person_name(who), 'meal', near_meal); END IF;
    END IF;
  END LOOP;
  IF jsonb_array_length(duplicates) > 0 THEN RETURN jsonb_build_object('status', 'possible_duplicate', 'duplicates', duplicates); END IF;
  PERFORM pg_catalog.set_config('app.meal_operation_write', 'true', true);
  FOR target IN SELECT value FROM jsonb_array_elements(p_targets) LOOP
    who := (target->>'userId')::uuid;
    copy_local := pg_catalog.md5('copy:' || p_message_id || ':' || who::text);
    SELECT m.id INTO existing FROM public."Message" m WHERE m.local_id = copy_local AND m."userId" = who;
    IF existing IS NOT NULL THEN
      meals := meals || jsonb_build_object('userId', who, 'messageId', existing, 'created', false);
      CONTINUE;
    END IF;
    PERFORM public.share_foods_for_log(p_actor, who, food_ids);
    INSERT INTO public."Message" (content, role, "messageType", status, "userId", "consumedOn", "createdAt", "resolvedAt",
      "itemsToProcess", "itemsProcessed", hasimages, local_id)
    VALUES (source.content, 'User', 'FOOD_LOG_REQUEST', 'RESOLVED', who, coalesce((target->>'consumedOn')::timestamp, source."consumedOn"),
      (now() AT TIME ZONE 'utc'), (now() AT TIME ZONE 'utc'), cardinality(food_ids), cardinality(food_ids), false, copy_local)
    RETURNING id INTO meal;
    row_index := 0;
    FOR item IN SELECT l.* FROM public."LoggedFoodItem" l WHERE l."messageId" = p_message_id AND l."deletedAt" IS NULL ORDER BY l.id LOOP
      PERFORM public.insert_priced_food_row(who, meal, coalesce((target->>'consumedOn')::timestamp, source."consumedOn"), 0,
        pg_catalog.md5(copy_local || ':' || row_index)::uuid,
        jsonb_build_object('foodItemId', item."foodItemId", 'grams', item.grams, 'servingId', item."servingId",
          'servingAmount', item."servingAmount", 'loggedUnit', item."loggedUnit", 'nutrition', to_jsonb(item)));
      row_index := row_index + 1;
    END LOOP;
    PERFORM public.mark_logged_by(meal, p_actor, coalesce(source."logGroupId", pg_catalog.md5('group:' || p_message_id)::uuid));
    meals := meals || jsonb_build_object('userId', who, 'messageId', meal, 'created', true);
  END LOOP;
  RETURN jsonb_build_object('status', 'logged', 'meals', meals);
END;
$function$;

-- An AI meal for several people: copies go out when the logger's meal resolves. A failure for one person (they've
-- since revoked, a food can't be passed on) is recorded and never blocks the logger's own meal.
CREATE OR REPLACE FUNCTION public.copy_resolved_meal() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $function$
DECLARE target jsonb;
  results jsonb := '[]';
  result jsonb;
BEGIN
  FOR target IN SELECT value FROM jsonb_array_elements(NEW."copyTo") LOOP
    BEGIN
      result := public.copy_meal_to_people(NEW."userId", NEW.id, jsonb_build_array(target), true);
      results := results || jsonb_build_object('userId', target->>'userId', 'messageId', result->'meals'->0->'messageId');
    EXCEPTION WHEN OTHERS THEN
      results := results || jsonb_build_object('userId', target->>'userId', 'error', SQLERRM);
    END;
  END LOOP;
  PERFORM pg_catalog.set_config('app.meal_operation_write', 'true', true);
  UPDATE public."Message" SET "copyTo" = NULL, "copiedTo" = results WHERE id = NEW.id;
  RETURN NULL;
END;
$function$;
DROP TRIGGER IF EXISTS "Message_copy_resolved" ON public."Message";
CREATE TRIGGER "Message_copy_resolved" AFTER UPDATE OF status ON public."Message" FOR EACH ROW
  WHEN (NEW.status = 'RESOLVED' AND OLD.status IS DISTINCT FROM 'RESOLVED' AND NEW."copyTo" IS NOT NULL
    AND jsonb_typeof(NEW."copyTo") = 'array' AND jsonb_array_length(NEW."copyTo") BETWEEN 1 AND 20)
  EXECUTE FUNCTION public.copy_resolved_meal();

-- Only the server says who logged a meal: the app can't label its own meals as someone else's.
CREATE OR REPLACE FUNCTION public.guard_logged_by() RETURNS trigger
LANGUAGE plpgsql SET search_path = '' AS $function$
BEGIN
  IF auth.uid() IS NOT NULL AND pg_catalog.current_setting('app.logged_by_write', true) IS DISTINCT FROM 'true' AND (
      (TG_OP = 'INSERT' AND (NEW."loggedByUserId" IS NOT NULL OR NEW."loggedByName" IS NOT NULL OR NEW."copiedTo" IS NOT NULL))
      OR (TG_OP = 'UPDATE' AND (NEW."loggedByUserId" IS DISTINCT FROM OLD."loggedByUserId"
        OR NEW."loggedByName" IS DISTINCT FROM OLD."loggedByName" OR NEW."copiedTo" IS DISTINCT FROM OLD."copiedTo")))
  THEN RAISE EXCEPTION 'loggedBy is set by the server' USING ERRCODE = '42501'; END IF;
  RETURN NEW;
END;
$function$;
DROP TRIGGER IF EXISTS "Message_guard_logged_by" ON public."Message";
CREATE TRIGGER "Message_guard_logged_by" BEFORE INSERT OR UPDATE ON public."Message" FOR EACH ROW
  EXECUTE FUNCTION public.guard_logged_by();

-- The meal p_actor logged for someone else, if they may still change it: returns its owner.
CREATE OR REPLACE FUNCTION public.meal_logged_by(p_actor uuid, p_message_id integer) RETURNS uuid
LANGUAGE sql STABLE SET search_path = '' AS $function$
  SELECT m."userId" FROM public."Message" m
  WHERE m.id = p_message_id AND m."loggedByUserId" = p_actor AND m."userId" <> p_actor AND public.can_log_for(p_actor, m."userId")
$function$;

-- Meals p_actor logged for p_target (newest first), while they may still log for them.
CREATE OR REPLACE FUNCTION public.meals_logged_for(p_actor uuid, p_target uuid, p_limit integer DEFAULT 50) RETURNS jsonb
LANGUAGE sql STABLE SET search_path = '' AS $function$
  SELECT coalesce(jsonb_agg(row ORDER BY row->>'consumedOn' DESC), '[]') FROM (
    SELECT jsonb_build_object('id', m.id, 'consumedOn', m."consumedOn", 'content', m.content,
      'kcal', coalesce(sum(l.kcal), 0), 'proteinG', coalesce(sum(l."proteinG"), 0), 'carbG', coalesce(sum(l."carbG"), 0),
      'totalFatG', coalesce(sum(l."totalFatG"), 0)) row
    FROM public."Message" m LEFT JOIN public."LoggedFoodItem" l ON l."messageId" = m.id AND l."deletedAt" IS NULL
    WHERE m."userId" = p_target AND m."loggedByUserId" = p_actor AND m."deletedAt" IS NULL AND public.can_log_for(p_actor, p_target)
    GROUP BY m.id ORDER BY m."consumedOn" DESC LIMIT least(greatest(p_limit, 1), 200)) x
$function$;

-- People the actor may log for, with their timezone (the server converts times; the app never sees it).
CREATE OR REPLACE FUNCTION public.log_targets(p_actor uuid) RETURNS TABLE(id uuid, name text, tz text)
LANGUAGE sql STABLE SET search_path = '' AS $function$
  SELECT g."grantorId", public.person_name(g."grantorId"), u."tzIdentifier"
  FROM public."LinkGrant" g JOIN public."UserLink" l ON l.id = g."linkId" AND l."endedAt" IS NULL
  JOIN public."User" u ON u.id = g."grantorId"
  WHERE g."granteeId" = p_actor AND g."canLogForMe"
$function$;

DO $$ DECLARE fn text; BEGIN
  FOR fn IN SELECT p.oid::regprocedure::text FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname IN ('can_log_for', 'lock_log_grant', 'similar_meal', 'share_foods_for_log',
      'mark_logged_by', 'log_foods_for_people', 'copy_meal_to_people', 'meal_logged_by', 'meals_logged_for', 'log_targets')
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', fn);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', fn);
  END LOOP;
END $$;
REVOKE ALL ON FUNCTION public.copy_resolved_meal(), public.guard_logged_by() FROM PUBLIC, anon, authenticated;

NOTIFY pgrst, 'reload schema';
