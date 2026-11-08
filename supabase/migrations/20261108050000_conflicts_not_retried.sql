-- Conflicts are raised as PT409, not 40001 (serialization_failure). PostgREST retries a transaction that fails with
-- 40001 at once and without limit; these conflicts fail the same way every time ("Meal revision changed": the meal
-- really changed), so each one looped forever on a pool connection. From 01:49 UTC on 2026-11-08 the loops held the
-- database at ~93% CPU, and at 04:08 they had every pool connection: the REST API timed out for everyone until they
-- were terminated at 04:47. PT409 answers HTTP 409 with code "PT409"; the messages are unchanged.
-- The definitions are the live ones, with only the error code changed.

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
    THEN RAISE EXCEPTION 'Meal revision changed' USING ERRCODE='PT409'; END IF;
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
$function$
;

CREATE OR REPLACE FUNCTION public.answer_meal_operation(p_user_id uuid, p_operation_id uuid, p_expected_version bigint, p_answer text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE op public."MealOperation"%ROWTYPE;
BEGIN
  IF p_user_id IS NULL OR p_operation_id IS NULL OR p_expected_version IS NULL
    OR p_answer IS NULL OR length(trim(p_answer)) NOT BETWEEN 1 AND 2000
  THEN RAISE EXCEPTION 'Invalid clarification answer' USING ERRCODE='22023'; END IF;
  SELECT * INTO op FROM public."MealOperation" WHERE id=p_operation_id FOR UPDATE;
  IF op.id IS NULL OR op."userId" IS DISTINCT FROM p_user_id
  THEN RAISE EXCEPTION 'Operation unavailable' USING ERRCODE='42501'; END IF;
  IF op.state <> 'needs_clarification' OR op.version <> p_expected_version OR NOT EXISTS (
    SELECT 1 FROM public."Message" m WHERE m.id=op."messageId" AND m."activeOperationId"=op.id
      AND m."operationGeneration"=op.generation AND m."deletedAt" IS NULL)
  THEN RAISE EXCEPTION 'Operation version changed' USING ERRCODE='PT409'; END IF;
  UPDATE public."MealOperation" SET state='queued',version=version+1,
    answers=answers||jsonb_build_array(jsonb_build_object('text',p_answer,'at',now())),
    result=NULL,"errorCode"=NULL,"updatedAt"=now() WHERE id=op.id;
  UPDATE public."MealOutbox" SET state='pending',"availableAt"=now()
    WHERE "operationId"=op.id AND kind='resolve';
  RETURN jsonb_build_object('operationId',op.id,'state','queued','operationVersion',op.version+1);
END;
$function$
;

CREATE OR REPLACE FUNCTION public.cancel_meal_operation(p_user_id uuid, p_operation_id uuid, p_expected_version bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE op public."MealOperation"%ROWTYPE;
BEGIN
  SELECT * INTO op FROM public."MealOperation" WHERE id=p_operation_id FOR UPDATE;
  PERFORM pg_catalog.set_config('app.meal_operation_write','true',true);
  IF op.id IS NULL OR op."userId" IS DISTINCT FROM p_user_id
  THEN RAISE EXCEPTION 'Operation unavailable' USING ERRCODE='42501'; END IF;
  IF op.state NOT IN ('queued','running','retry_wait','needs_clarification') OR
    op.version <> p_expected_version
  THEN RAISE EXCEPTION 'Operation version changed' USING ERRCODE='PT409'; END IF;
  UPDATE public."Message" SET "activeOperationId"=NULL,"operationGeneration"="operationGeneration"+1
    WHERE id=op."messageId" AND "activeOperationId"=op.id;
  IF op.action='create' THEN
    UPDATE public."Message" SET status='FAILED',"deletedAt"=clock_timestamp() AT TIME ZONE 'UTC'
      WHERE id=op."messageId" AND "publishedRevision"=0;
  END IF;
  UPDATE public."MealOperation" SET state='cancelled',version=version+1,
    "workerToken"=NULL,"leaseUntil"=NULL,"updatedAt"=now(),"completedAt"=now()
    WHERE id=op.id;
  UPDATE public."MealOutbox" SET state='done' WHERE "operationId"=op.id;
  RETURN jsonb_build_object('operationId',op.id,'state','cancelled','operationVersion',op.version+1);
END;
$function$
;

CREATE OR REPLACE FUNCTION public.finish_meal_operation(p_operation_id uuid, p_worker_token uuid, p_state text, p_error_code text, p_next_attempt timestamp with time zone DEFAULT NULL::timestamp with time zone, p_result jsonb DEFAULT NULL::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE op public."MealOperation"%ROWTYPE;
BEGIN
  IF p_state NOT IN ('retry_wait','needs_clarification','failed')
  THEN RAISE EXCEPTION 'Invalid completion state' USING ERRCODE='22023'; END IF;
  PERFORM pg_catalog.set_config('app.meal_operation_write','true',true);
  SELECT * INTO op FROM public."MealOperation" WHERE id=p_operation_id FOR UPDATE;
  IF op.id IS NULL OR op.state<>'running' OR op."workerToken" IS DISTINCT FROM p_worker_token
  THEN RAISE EXCEPTION 'Operation claim changed' USING ERRCODE='PT409'; END IF;
  UPDATE public."MealOperation" SET state=p_state,version=version+1,"errorCode"=p_error_code,
    "workerToken"=NULL,"leaseUntil"=NULL,"nextAttemptAt"=p_next_attempt,
    result=p_result,
    "completedAt"=CASE WHEN p_state='failed' THEN now() ELSE NULL END,"updatedAt"=now()
    WHERE id=op.id;
  IF p_state='failed' THEN
    UPDATE public."Message" SET "activeOperationId"=NULL
      WHERE id=op."messageId" AND "activeOperationId"=op.id;
    IF op.action='create' THEN
      UPDATE public."Message" SET status='FAILED',"resolvedAt"=clock_timestamp() AT TIME ZONE 'UTC'
        WHERE id=op."messageId" AND "publishedRevision"=0;
    END IF;
  END IF;
  IF p_state='retry_wait' THEN
    UPDATE public."MealOutbox" SET state='pending',"availableAt"=coalesce(p_next_attempt,now())
      WHERE "operationId"=op.id AND kind='resolve';
  ELSE
    UPDATE public."MealOutbox" SET state='done' WHERE "operationId"=op.id AND kind='resolve';
  END IF;
  RETURN jsonb_build_object('operationId',op.id,'state',p_state,'operationVersion',op.version+1);
END;
$function$
;

CREATE OR REPLACE FUNCTION public.publish_meal_operation(p_operation_id uuid, p_worker_token uuid, p_plan jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE
  op public."MealOperation"%ROWTYPE;
  target public."Message"%ROWTYPE;
  item jsonb;
  source_food public."FoodItem"%ROWTYPE;
  new_revision bigint;
  item_count integer;
  inserted_count integer := 0;
  next_food_id integer;
  image_id integer;
  grams_value double precision;
  kcal_value double precision;
  nutrient jsonb;
BEGIN
  IF p_operation_id IS NULL OR p_worker_token IS NULL OR p_plan IS NULL OR
    jsonb_typeof(p_plan) <> 'object' OR jsonb_typeof(p_plan->'items') <> 'array' OR
    jsonb_typeof(p_plan->'originalText') <> 'string' OR
    (p_plan->>'consumedOn') IS NULL OR
    NOT isfinite((p_plan->>'consumedOn')::timestamptz)
  THEN RAISE EXCEPTION 'Invalid meal plan' USING ERRCODE='22023'; END IF;
  PERFORM pg_catalog.set_config('app.meal_operation_write','true',true);
  SELECT * INTO op FROM public."MealOperation" WHERE id=p_operation_id FOR UPDATE;
  IF op.id IS NULL OR op.state <> 'running' OR op."workerToken" IS DISTINCT FROM p_worker_token
    OR op."leaseUntil"<=now()
  THEN RAISE EXCEPTION 'Operation claim changed' USING ERRCODE='PT409'; END IF;
  SELECT * INTO target FROM public."Message" WHERE id=op."messageId" FOR UPDATE;
  IF target.id IS NULL OR target."userId" IS DISTINCT FROM op."userId" OR target."deletedAt" IS NOT NULL
    OR target."activeOperationId" IS DISTINCT FROM op.id OR
    target."operationGeneration" IS DISTINCT FROM op.generation OR
    (op.action <> 'create' AND target."publishedRevision" IS DISTINCT FROM op."expectedPublishedRevision")
  THEN RAISE EXCEPTION 'Meal revision changed' USING ERRCODE='PT409'; END IF;
  IF op.action IN ('create','replace','move') AND p_plan->>'originalText' IS DISTINCT FROM op.input->>'originalText'
    OR op.action IN ('portion','delete') AND p_plan->>'originalText' IS DISTINCT FROM target.content
    OR op.action='move' AND (p_plan->>'consumedOn')::timestamp IS DISTINCT FROM (op.input->>'consumedOn')::timestamp
    OR op.action IN ('portion','delete') AND (p_plan->>'consumedOn')::timestamp IS DISTINCT FROM target."consumedOn"
  THEN RAISE EXCEPTION 'Plan input changed' USING ERRCODE='PT409'; END IF;
  IF p_plan->'input'->'attachmentIds' IS NOT NULL THEN
    IF jsonb_typeof(p_plan->'input'->'attachmentIds')<>'array' OR
      jsonb_array_length(p_plan->'input'->'attachmentIds')>10
    THEN RAISE EXCEPTION 'Invalid plan attachments' USING ERRCODE='22023'; END IF;
    FOR image_id IN SELECT value::integer FROM jsonb_array_elements_text(p_plan->'input'->'attachmentIds') LOOP
      IF NOT EXISTS (SELECT 1 FROM public."UserMessageImages" image WHERE image.id=image_id
        AND image."userId"=op."userId" AND image."messageId"=target.id)
      THEN RAISE EXCEPTION 'Photo evidence changed' USING ERRCODE='PT409'; END IF;
    END LOOP;
  END IF;
  item_count:=jsonb_array_length(p_plan->'items');
  IF op.action='delete' AND op.input->>'targetLogicalItemId' IS NULL THEN
    IF item_count<>0 THEN RAISE EXCEPTION 'Deleted meal must have no foods' USING ERRCODE='22023'; END IF;
  ELSIF item_count NOT BETWEEN 1 AND 30 THEN
    RAISE EXCEPTION 'Meal must have 1 to 30 foods' USING ERRCODE='22023';
  END IF;
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(p_plan->'items') AS entry(value)
    GROUP BY entry.value->>'logicalItemId' HAVING count(*)>1)
  THEN RAISE EXCEPTION 'Duplicate logical food item' USING ERRCODE='22023'; END IF;
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(p_plan->'items') AS entry(value)
    WHERE entry.value->'sourceItemId' IS NOT NULL AND
      entry.value->'sourceItemId'<>'null'::jsonb AND NOT EXISTS (
        SELECT 1 FROM public."Message" source_message
        JOIN public."LoggedFoodItem" source_item ON source_item."messageId"=source_message.id
        WHERE source_message.id=(entry.value->'sourceItemId'->>'messageId')::integer
          AND source_item.id=(entry.value->'sourceItemId'->>'loggedFoodItemId')::integer
          AND source_message."userId"=op."userId" AND source_item."userId"=op."userId"
          AND source_message."publishedRevision"=(entry.value->'sourceItemId'->>'revision')::bigint
          AND source_item."updatedAt"=(entry.value->'sourceItemId'->>'updatedAt')::timestamp
          AND source_item."foodItemId"=(entry.value->>'foodId')::integer
          AND source_message.status='RESOLVED' AND source_message."deletedAt" IS NULL
          AND source_item."deletedAt" IS NULL AND source_item.status='Processed'))
  THEN RAISE EXCEPTION 'Historical evidence changed' USING ERRCODE='PT409'; END IF;
  new_revision:=target."publishedRevision"+1;
  -- A successor revision is published atomically with the complete new food set.
  UPDATE public."LoggedFoodItem" SET "deletedAt"=clock_timestamp() AT TIME ZONE 'UTC'
    WHERE "messageId"=target.id AND "userId"=op."userId" AND "deletedAt" IS NULL;
  FOR item IN SELECT value FROM jsonb_array_elements(p_plan->'items') LOOP
    IF jsonb_typeof(item)<>'object' OR jsonb_typeof(item->'nutrition')<>'object'
      OR jsonb_typeof(item->'logicalItemId')<>'string'
    THEN RAISE EXCEPTION 'Invalid plan item' USING ERRCODE='22023'; END IF;
    next_food_id:=(item->>'foodId')::integer;
    grams_value:=(item->>'grams')::double precision;
    kcal_value:=(item->'nutrition'->>'kcal')::double precision;
    IF next_food_id IS NULL OR grams_value IS NULL OR NOT (grams_value>0 AND grams_value<='5000'::float8)
      OR kcal_value IS NULL OR NOT (kcal_value>=0 AND kcal_value<=45000 AND kcal_value/grams_value<=9.5)
      OR (item->>'servingAmount') IS NOT NULL AND NOT ((item->>'servingAmount')::float8>0 AND (item->>'servingAmount')::float8<'Infinity'::float8)
      OR EXISTS (SELECT 1 FROM jsonb_each(item->'nutrition') n WHERE n.value<>'null'::jsonb AND
        (jsonb_typeof(n.value)<>'number' OR NOT ((n.value #>> '{}')::float8>=0 AND (n.value #>> '{}')::float8<'Infinity'::float8)))
    THEN RAISE EXCEPTION 'Invalid item nutrition or quantity' USING ERRCODE='22023'; END IF;
    SELECT * INTO source_food FROM public."FoodItem" WHERE id=next_food_id;
    IF source_food.id IS NULL
    THEN RAISE EXCEPTION 'Food evidence unavailable' USING ERRCODE='42501'; END IF;
    IF item->>'catalogueUpdatedAt' IS NOT NULL AND
      source_food."lastUpdated" IS DISTINCT FROM (item->>'catalogueUpdatedAt')::timestamp
    THEN RAISE EXCEPTION 'Catalogue evidence changed' USING ERRCODE='PT409'; END IF;
    IF item->>'servingId' IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public."Serving" s
      WHERE s.id=(item->>'servingId')::integer AND s."foodItemId"=next_food_id)
    THEN RAISE EXCEPTION 'Serving evidence unavailable' USING ERRCODE='22023'; END IF;
    IF item->>'servingId' IS NOT NULL AND item->>'origin' IS DISTINCT FROM 'history' AND
      NOT EXISTS (SELECT 1 FROM public."Serving" s WHERE s.id=(item->>'servingId')::integer
        AND s."foodItemId"=next_food_id AND s."servingWeightGram">0 AND s."defaultServingAmount">0
        AND abs(grams_value-(item->>'servingAmount')::float8*s."servingWeightGram"/s."defaultServingAmount")
          <=greatest(0.000001,grams_value*0.000001))
    THEN RAISE EXCEPTION 'Serving quantity changed' USING ERRCODE='PT409'; END IF;
    nutrient:=item->'nutrition';
    INSERT INTO public."LoggedFoodItem"("userId","messageId","foodItemId",grams,kcal,
      "proteinG","carbG","totalFatG","satFatG","transFatG","unsatFatG","polyunsatFatG","monounsatFatG","fiberG","sugarG","addedSugarG","waterMl","vitaminAMcg","vitaminCMg","vitaminDMcg","vitaminEMg","vitaminKMcg","vitaminB1Mg","vitaminB2Mg","vitaminB3Mg","vitaminB5Mg","vitaminB6Mg","vitaminB7Mcg","vitaminB9Mcg","vitaminB12Mcg","calciumMg","ironMg","magnesiumMg","phosphorusMg","potassiumMg","sodiumMg","zincMg","copperMg","manganeseMg","seleniumMcg","iodineMcg","cholesterolMg","omega3Mg","omega6Mg","caffeineMg","alcoholG","consumedOn",status,"servingId","servingAmount","loggedUnit",
      "extendedOpenAiData","publishedRevision","logicalItemId")
    VALUES (op."userId",target.id,next_food_id,grams_value,kcal_value,
      (nutrient->>'proteinG')::double precision,(nutrient->>'carbG')::double precision,
      (nutrient->>'totalFatG')::double precision,(nutrient->>'satFatG')::double precision,(nutrient->>'transFatG')::double precision,(nutrient->>'unsatFatG')::double precision,(nutrient->>'polyunsatFatG')::double precision,(nutrient->>'monounsatFatG')::double precision,(nutrient->>'fiberG')::double precision,(nutrient->>'sugarG')::double precision,(nutrient->>'addedSugarG')::double precision,(nutrient->>'waterMl')::double precision,(nutrient->>'vitaminAMcg')::double precision,(nutrient->>'vitaminCMg')::double precision,(nutrient->>'vitaminDMcg')::double precision,(nutrient->>'vitaminEMg')::double precision,(nutrient->>'vitaminKMcg')::double precision,(nutrient->>'vitaminB1Mg')::double precision,(nutrient->>'vitaminB2Mg')::double precision,(nutrient->>'vitaminB3Mg')::double precision,(nutrient->>'vitaminB5Mg')::double precision,(nutrient->>'vitaminB6Mg')::double precision,(nutrient->>'vitaminB7Mcg')::double precision,(nutrient->>'vitaminB9Mcg')::double precision,(nutrient->>'vitaminB12Mcg')::double precision,(nutrient->>'calciumMg')::double precision,(nutrient->>'ironMg')::double precision,(nutrient->>'magnesiumMg')::double precision,(nutrient->>'phosphorusMg')::double precision,(nutrient->>'potassiumMg')::double precision,(nutrient->>'sodiumMg')::double precision,(nutrient->>'zincMg')::double precision,(nutrient->>'copperMg')::double precision,(nutrient->>'manganeseMg')::double precision,(nutrient->>'seleniumMcg')::double precision,(nutrient->>'iodineMcg')::double precision,(nutrient->>'cholesterolMg')::double precision,(nutrient->>'omega3Mg')::double precision,(nutrient->>'omega6Mg')::double precision,(nutrient->>'caffeineMg')::double precision,(nutrient->>'alcoholG')::double precision,(p_plan->>'consumedOn')::timestamp,'Processed',
      (item->>'servingId')::integer,(item->>'servingAmount')::double precision,item->>'loggedUnit',
      jsonb_build_object('mealOperationId',op.id,'evidence',coalesce(item->'evidence','[]'::jsonb),
        'groupId',item->'groupId','sourceItemId',item->'sourceItemId'),
      new_revision,(item->>'logicalItemId')::uuid);
    inserted_count:=inserted_count+1;
  END LOOP;
  INSERT INTO public."MealRevision"("messageId",revision,"userId","operationId",snapshot)
    VALUES(target.id,new_revision,op."userId",op.id,p_plan);
  UPDATE public."Message" SET
    content=coalesce(p_plan->>'originalText',content),
    "consumedOn"=(p_plan->>'consumedOn')::timestamp,
    status='RESOLVED',
    "itemsProcessed"=inserted_count,"itemsToProcess"=inserted_count,
    "resolvedAt"=clock_timestamp() AT TIME ZONE 'UTC',
    hasimages=EXISTS (SELECT 1 FROM public."UserMessageImages" image WHERE image."messageId"=target.id
      AND image."userId"=op."userId"),
    "deletedAt"=CASE WHEN op.action='delete' AND op.input->>'targetLogicalItemId' IS NULL
      THEN clock_timestamp() AT TIME ZONE 'UTC' ELSE "deletedAt" END,
    "publishedRevision"=new_revision,"activeOperationId"=NULL
    WHERE id=target.id;
  UPDATE public."MealOperation" SET state='succeeded',version=version+1,plan=p_plan,
    result=jsonb_build_object('messageId',target.id,'publishedRevision',new_revision,'itemsProcessed',inserted_count),
    "workerToken"=NULL,"leaseUntil"=NULL,"updatedAt"=now(),"completedAt"=now()
    WHERE id=op.id;
  UPDATE public."MealOutbox" SET state='done' WHERE "operationId"=op.id AND kind='resolve';
  RETURN jsonb_build_object('messageId',target.id,'publishedRevision',new_revision,'itemsProcessed',inserted_count);
END;
$function$
;

CREATE OR REPLACE FUNCTION public.replace_food_from_history(p_user_id uuid, p_message_id integer, p_consumed_on timestamp with time zone, p_expected jsonb, p_source jsonb, p_food_ids integer[])
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE
  target public."Message"%ROWTYPE;
  source public."Message"%ROWTYPE;
  source_id integer := (p_source->>'messageId')::integer;
  food_count integer;
  inserted_count integer;
BEGIN
  IF p_user_id IS NULL OR p_message_id IS NULL OR source_id IS NULL OR source_id = p_message_id
    OR p_consumed_on IS NULL OR NOT isfinite(p_consumed_on)
    OR p_expected IS NULL OR p_source IS NULL OR jsonb_typeof(p_source->'foods') IS DISTINCT FROM 'array'
    OR coalesce(cardinality(p_food_ids),0) NOT BETWEEN 1 AND 30
    OR cardinality(p_food_ids) <> (SELECT count(DISTINCT value) FROM unnest(p_food_ids) value)
  THEN RAISE EXCEPTION 'Invalid history replacement' USING ERRCODE = '22023'; END IF;

  -- Consistent lock order, also preventing new FK-linked food inserts while
  -- checking the source's complete set of rows.
  PERFORM id FROM public."Message" WHERE id IN (p_message_id, source_id) ORDER BY id FOR UPDATE;
  SELECT * INTO target FROM public."Message" WHERE id=p_message_id;
  SELECT * INTO source FROM public."Message" WHERE id=source_id;
  IF target.id IS NULL OR source.id IS NULL
    OR target."userId" IS DISTINCT FROM p_user_id OR source."userId" IS DISTINCT FROM p_user_id
    OR target."deletedAt" IS NOT NULL OR source."deletedAt" IS NOT NULL
    OR target.status::text = 'PROCESSING' OR source.status::text IS DISTINCT FROM 'RESOLVED'
    OR target.content IS DISTINCT FROM (p_expected->>'content')
    OR target.status::text IS DISTINCT FROM (p_expected->>'status')
    OR target."resolvedAt" IS DISTINCT FROM (p_expected->>'resolvedAt')::timestamp
    OR target."consumedOn" IS DISTINCT FROM (p_expected->>'consumedOn')::timestamp
    OR source.content IS DISTINCT FROM (p_source->>'content')
    OR source."consumedOn" IS DISTINCT FROM (p_source->>'consumedOn')::timestamp
  THEN RAISE EXCEPTION 'History meal changed or is unavailable' USING ERRCODE='PT409'; END IF;

  PERFORM id FROM public."LoggedFoodItem"
    WHERE "messageId" IN (p_message_id, source_id) AND "deletedAt" IS NULL ORDER BY id FOR UPDATE;
  SELECT count(*) INTO food_count FROM public."LoggedFoodItem" WHERE "messageId"=source_id AND "deletedAt" IS NULL;
  IF food_count = 0 OR food_count IS DISTINCT FROM source."itemsToProcess"
    OR food_count IS DISTINCT FROM source."itemsProcessed" OR food_count <> jsonb_array_length(p_source->'foods')
    OR EXISTS (SELECT 1 FROM public."LoggedFoodItem" f
      WHERE f."messageId"=source_id AND f."deletedAt" IS NULL AND (
        f."userId" IS DISTINCT FROM p_user_id OR f.status IS DISTINCT FROM 'Processed'
        OR f."foodItemId" IS NULL OR NOT (f.grams > 0 AND f.grams < 'Infinity'::float8)
        OR f.kcal IS NULL OR NOT (f.kcal >= 0 AND f.kcal < 'Infinity'::float8)
        OR NOT EXISTS (SELECT 1 FROM jsonb_to_recordset(p_source->'foods') AS expected(id integer, "updatedAt" timestamp)
          WHERE expected.id=f.id AND expected."updatedAt"=f."updatedAt")
        OR EXISTS (SELECT 1 FROM jsonb_each(to_jsonb(f)) n WHERE n.key IN ('kcal', 'totalFatG', 'satFatG', 'transFatG', 'unsatFatG', 'polyunsatFatG', 'monounsatFatG', 'carbG', 'fiberG', 'sugarG', 'addedSugarG', 'proteinG', 'waterMl', 'vitaminAMcg', 'vitaminCMg', 'vitaminDMcg', 'vitaminEMg', 'vitaminKMcg', 'vitaminB1Mg', 'vitaminB2Mg', 'vitaminB3Mg', 'vitaminB5Mg', 'vitaminB6Mg', 'vitaminB7Mcg', 'vitaminB9Mcg', 'vitaminB12Mcg', 'calciumMg', 'ironMg', 'magnesiumMg', 'phosphorusMg', 'potassiumMg', 'sodiumMg', 'zincMg', 'copperMg', 'manganeseMg', 'seleniumMcg', 'iodineMcg', 'cholesterolMg', 'omega3Mg', 'omega6Mg', 'caffeineMg', 'alcoholG')
          AND n.value <> 'null'::jsonb AND NOT ((n.value #>> '{}')::float8 >= 0 AND (n.value #>> '{}')::float8 < 'Infinity'::float8))
      ))
    OR EXISTS (SELECT 1 FROM unnest(p_food_ids) wanted(id) WHERE NOT EXISTS (
      SELECT 1 FROM public."LoggedFoodItem" f WHERE f.id=wanted.id AND f."messageId"=source_id AND f."deletedAt" IS NULL))
    OR EXISTS (SELECT 1 FROM public."LoggedFoodItem" WHERE "messageId"=p_message_id AND "deletedAt" IS NULL AND "userId" IS DISTINCT FROM p_user_id)
  THEN RAISE EXCEPTION 'Historical foods changed or are incomplete' USING ERRCODE='PT409'; END IF;

  UPDATE public."LoggedFoodItem" SET "deletedAt"=clock_timestamp() AT TIME ZONE 'UTC'
    WHERE "messageId"=p_message_id AND "userId"=p_user_id AND "deletedAt" IS NULL;
  INSERT INTO public."LoggedFoodItem" (
    "userId", "messageId", "foodItemId", grams, "kcal", "totalFatG", "satFatG", "transFatG", "unsatFatG", "polyunsatFatG", "monounsatFatG", "carbG", "fiberG", "sugarG", "addedSugarG", "proteinG", "waterMl", "vitaminAMcg", "vitaminCMg", "vitaminDMcg", "vitaminEMg", "vitaminKMcg", "vitaminB1Mg", "vitaminB2Mg", "vitaminB3Mg", "vitaminB5Mg", "vitaminB6Mg", "vitaminB7Mcg", "vitaminB9Mcg", "vitaminB12Mcg", "calciumMg", "ironMg", "magnesiumMg", "phosphorusMg", "potassiumMg", "sodiumMg", "zincMg", "copperMg", "manganeseMg", "seleniumMcg", "iodineMcg", "cholesterolMg", "omega3Mg", "omega6Mg", "caffeineMg", "alcoholG",
    "consumedOn", status, "servingId", "servingAmount", "loggedUnit", "extendedOpenAiData"
  ) SELECT p_user_id, p_message_id, f."foodItemId", f.grams, f."kcal", f."totalFatG", f."satFatG", f."transFatG", f."unsatFatG", f."polyunsatFatG", f."monounsatFatG", f."carbG", f."fiberG", f."sugarG", f."addedSugarG", f."proteinG", f."waterMl", f."vitaminAMcg", f."vitaminCMg", f."vitaminDMcg", f."vitaminEMg", f."vitaminKMcg", f."vitaminB1Mg", f."vitaminB2Mg", f."vitaminB3Mg", f."vitaminB5Mg", f."vitaminB6Mg", f."vitaminB7Mcg", f."vitaminB9Mcg", f."vitaminB12Mcg", f."calciumMg", f."ironMg", f."magnesiumMg", f."phosphorusMg", f."potassiumMg", f."sodiumMg", f."zincMg", f."copperMg", f."manganeseMg", f."seleniumMcg", f."iodineMcg", f."cholesterolMg", f."omega3Mg", f."omega6Mg", f."caffeineMg", f."alcoholG",
    p_consumed_on AT TIME ZONE 'UTC', 'Processed', f."servingId", f."servingAmount", f."loggedUnit",
    coalesce(f."extendedOpenAiData",'{}'::jsonb) || jsonb_build_object('historySourceMessageId',source_id,'historySourceLoggedFoodItemId',f.id)
    FROM public."LoggedFoodItem" f WHERE f.id=ANY(p_food_ids) AND f."messageId"=source_id AND f."deletedAt" IS NULL ORDER BY f.id;
  GET DIAGNOSTICS inserted_count = ROW_COUNT;
  IF inserted_count <> cardinality(p_food_ids) THEN RAISE EXCEPTION 'Incomplete history replacement'; END IF;
  UPDATE public."Message" SET status='RESOLVED', "itemsProcessed"=inserted_count, "itemsToProcess"=inserted_count,
    "consumedOn"=p_consumed_on AT TIME ZONE 'UTC', "resolvedAt"=clock_timestamp() AT TIME ZONE 'UTC', "isBadFoodRequest"=false
    WHERE id=p_message_id;
  RETURN jsonb_build_object('status','RESOLVED','itemsProcessed',inserted_count,'itemsToProcess',inserted_count);
END;
$function$
;

CREATE OR REPLACE FUNCTION public.replace_meal_with_food(p_user_id uuid, p_message_id integer, p_expected_item_ids integer[], p_item jsonb)
 RETURNS integer
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE meal public."Message"%ROWTYPE;
  current_ids integer[];
  consumed timestamp;
BEGIN
  SELECT * INTO meal FROM public."Message" m WHERE m.id = p_message_id AND m."userId" = p_user_id AND m."deletedAt" IS NULL
    FOR UPDATE;
  IF meal.id IS NULL THEN RAISE EXCEPTION 'meal_unavailable' USING ERRCODE = 'P0002'; END IF;
  IF meal.status <> 'RESOLVED' OR meal."operationOwned" OR meal."activeOperationId" IS NOT NULL
  THEN RAISE EXCEPTION 'meal_busy' USING ERRCODE = '55000'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public."FoodItem" f WHERE f.id = (p_item->>'foodItemId')::integer AND f."archivedAt" IS NULL
      AND public.food_visible(p_user_id, f."privateToUserId", f."lineageId"))
  THEN RAISE EXCEPTION 'food_unavailable' USING ERRCODE = 'P0002'; END IF;
  SELECT array_agg(l.id ORDER BY l.id), min(l."consumedOn") INTO current_ids, consumed FROM public."LoggedFoodItem" l
    WHERE l."messageId" = p_message_id AND l."deletedAt" IS NULL;
  IF current_ids IS DISTINCT FROM (SELECT array_agg(x ORDER BY x) FROM unnest(p_expected_item_ids) x)
  THEN RAISE EXCEPTION 'meal_changed' USING ERRCODE='PT409'; END IF;
  UPDATE public."LoggedFoodItem" SET "deletedAt" = now() WHERE id = ANY (current_ids);
  UPDATE public."Message" SET "itemsToProcess" = 1, "itemsProcessed" = 1 WHERE id = p_message_id;
  -- The row joins the meal's published revision, so the app's revision check keeps it.
  RETURN public.insert_priced_food_row(p_user_id, p_message_id, coalesce(meal."consumedOn", consumed),
    meal."publishedRevision", NULL, p_item);
END;
$function$
;

