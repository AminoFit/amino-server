-- Edited meals stay editable (2026-10-12). accept_meal_operation marked a meal edited from the app as
-- "operationOwned" for good, and agent_editable_meal, replace_meal_with_food, refresh_meal_food_list and the guard
-- triggers refuse owned meals: an agent correcting the breakfast after an app edit got meal_busy ("still working on
-- this meal") with nothing running. A meal is now fenced only while an operation is active, as taken-over meals
-- already were; the worker reads the meal's current foods when there's no owned snapshot (legacySnapshot), so later
-- edits from anywhere are respected. The two meals marked so far are released.
SET lock_timeout = '3s';

CREATE OR REPLACE FUNCTION public.accept_meal_operation(p_user_id uuid, p_operation_id uuid, p_client_meal_id uuid, p_message_id integer, p_expected_revision bigint, p_action text, p_input jsonb, p_payload_hash text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE
  existing public."MealOperation"%ROWTYPE;
  target public."Message"%ROWTYPE;
  new_generation bigint;
  image_id integer;
  takeover boolean := coalesce((p_input->>'takeover')::boolean,false);
BEGIN
  IF p_user_id IS NULL OR p_operation_id IS NULL OR p_client_meal_id IS NULL
    OR p_action NOT IN ('create','replace','portion','move','delete')
    OR p_payload_hash IS NULL OR length(p_payload_hash) <> 64
    OR p_input IS NULL OR jsonb_typeof(p_input) <> 'object'
  THEN RAISE EXCEPTION 'Invalid meal operation' USING ERRCODE='22023'; END IF;
  PERFORM pg_catalog.set_config('app.meal_operation_write','true',true);
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_operation_id::text,0));
  SELECT * INTO existing FROM public."MealOperation" WHERE id=p_operation_id;
  IF existing.id IS NOT NULL THEN
    IF existing."userId" IS DISTINCT FROM p_user_id OR existing."payloadHash" IS DISTINCT FROM p_payload_hash
      OR existing.action IS DISTINCT FROM p_action OR existing."clientMealId" IS DISTINCT FROM p_client_meal_id
    THEN RAISE EXCEPTION 'Operation key reused with different input' USING ERRCODE='23505'; END IF;
    RETURN jsonb_build_object('operationId',existing.id,'messageId',existing."messageId",
      'generation',existing.generation,'operationVersion',existing.version,'state',existing.state,
      'publishedRevision',(SELECT "publishedRevision" FROM public."Message" WHERE id=existing."messageId"),
      'result',existing.result);
  END IF;
  IF p_action='create' AND p_message_id IS NOT NULL THEN
    -- Server-side takeover of a message the current app already created.
    IF NOT takeover OR p_expected_revision IS NOT NULL OR
       NOT (p_input ? 'originalText') OR jsonb_typeof(p_input->'originalText') <> 'string'
    THEN RAISE EXCEPTION 'Invalid creation input' USING ERRCODE='22023'; END IF;
    SELECT * INTO target FROM public."Message" WHERE id=p_message_id FOR UPDATE;
    IF target.id IS NULL OR target."userId" IS DISTINCT FROM p_user_id OR target."deletedAt" IS NOT NULL
    THEN RAISE EXCEPTION 'Meal unavailable' USING ERRCODE='42501'; END IF;
    IF target."messageType"<>'FOOD_LOG_REQUEST' OR target.role<>'User' OR
       target.status NOT IN ('RECEIVED','FAILED') OR target."publishedRevision"<>0
    THEN RAISE EXCEPTION 'Not an unprocessed food log' USING ERRCODE='22023'; END IF;
    IF target."activeOperationId" IS NOT NULL
    THEN RAISE EXCEPTION 'Meal operation already active' USING ERRCODE='55000'; END IF;
    UPDATE public."Message" SET status='PROCESSING',"itemsProcessed"=0,"itemsToProcess"=0,
      "consumedOn"=coalesce((p_input->>'consumedOn')::timestamp,"consumedOn") WHERE id=target.id;
  ELSIF p_action='create' THEN
    IF p_expected_revision IS NOT NULL OR
       NOT (p_input ? 'originalText') OR jsonb_typeof(p_input->'originalText') <> 'string'
    THEN RAISE EXCEPTION 'Invalid creation input' USING ERRCODE='22023'; END IF;
    INSERT INTO public."Message"("userId",role,"messageType",content,status,local_id,
      "consumedOn","itemsProcessed","itemsToProcess")
    VALUES (p_user_id,'User','FOOD_LOG_REQUEST',p_input->>'originalText','RECEIVED',coalesce(p_input->>'localId',p_client_meal_id::text),
      (p_input->>'consumedOn')::timestamp,0,0) RETURNING * INTO target;
  ELSE
    IF p_message_id IS NULL OR p_expected_revision IS NULL
    THEN RAISE EXCEPTION 'Expected meal revision required' USING ERRCODE='22023'; END IF;
    SELECT * INTO target FROM public."Message" WHERE id=p_message_id FOR UPDATE;
    IF target.id IS NULL OR target."userId" IS DISTINCT FROM p_user_id OR target."deletedAt" IS NOT NULL
    THEN RAISE EXCEPTION 'Meal unavailable' USING ERRCODE='42501'; END IF;
    IF target."messageType"<>'FOOD_LOG_REQUEST' OR target.role<>'User' OR
      (p_action='replace' AND target.status NOT IN ('RESOLVED','FAILED')) OR
      (p_action<>'replace' AND target.status<>'RESOLVED')
    THEN RAISE EXCEPTION 'Not a published food log' USING ERRCODE='22023'; END IF;
    IF target."publishedRevision" <> p_expected_revision
    THEN RAISE EXCEPTION 'Meal revision changed' USING ERRCODE='40001'; END IF;
    IF target."activeOperationId" IS NOT NULL
    THEN RAISE EXCEPTION 'Meal operation already active' USING ERRCODE='55000'; END IF;
  END IF;
  IF p_action IN ('create','replace') AND p_input ? 'attachmentIds' THEN
    IF jsonb_typeof(p_input->'attachmentIds')<>'array' OR
       jsonb_array_length(p_input->'attachmentIds')>10 OR
       EXISTS (SELECT 1 FROM jsonb_array_elements_text(p_input->'attachmentIds') ids(value)
         GROUP BY ids.value HAVING count(*)>1)
    THEN RAISE EXCEPTION 'Invalid meal attachments' USING ERRCODE='22023'; END IF;
    FOR image_id IN SELECT value::integer FROM jsonb_array_elements_text(p_input->'attachmentIds') LOOP
      IF NOT EXISTS (SELECT 1 FROM public."UserMessageImages" image
        WHERE image.id=image_id AND image."userId"=p_user_id AND
          (image."messageId" IS NULL OR image."messageId"=target.id) FOR UPDATE)
      THEN RAISE EXCEPTION 'Meal attachment unavailable' USING ERRCODE='42501'; END IF;
      UPDATE public."UserMessageImages" SET "messageId"=target.id
        WHERE id=image_id AND "userId"=p_user_id;
    END LOOP;
    IF p_action='create' THEN
      UPDATE public."Message" SET hasimages=jsonb_array_length(p_input->'attachmentIds')>0 WHERE id=target.id;
    END IF;
  END IF;
  new_generation := target."operationGeneration"+1;
  INSERT INTO public."MealOperation"(id,"userId","messageId","clientMealId","payloadHash",action,input,
      "expectedPublishedRevision",generation)
  VALUES (p_operation_id,p_user_id,target.id,p_client_meal_id,p_payload_hash,p_action,p_input,
      p_expected_revision,new_generation);
  -- A meal is fenced only while an operation runs (activeOperationId). Edited meals used to stay
  -- "operationOwned" after publishing, which refused every later change outside the protocol for good:
  -- agents' meal edits (meal_busy), the meal's food list refresh and recipe updates.
  UPDATE public."Message" SET "operationGeneration"=new_generation,"activeOperationId"=p_operation_id,
    "operationOwned"=false
    WHERE id=target.id;
  INSERT INTO public."MealOutbox"("operationId",generation,kind) VALUES (p_operation_id,new_generation,'resolve');
  RETURN jsonb_build_object('operationId',p_operation_id,'messageId',target.id,
    'generation',new_generation,'operationVersion',1,'state','queued',
    'publishedRevision',target."publishedRevision");
END;
$function$;

-- The guard trigger lets the protocol's own writes through.
SELECT pg_catalog.set_config('app.meal_operation_write', 'true', true);
UPDATE public."Message" SET "operationOwned" = false WHERE "operationOwned" AND "activeOperationId" IS NULL;
