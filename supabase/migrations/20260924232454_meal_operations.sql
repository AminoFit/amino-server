-- Durable, revision-fenced meal operations. Only the server service role writes
-- these tables/functions. Existing messages and food rows remain readable.
ALTER TABLE public."Message"
  ADD COLUMN IF NOT EXISTS "publishedRevision" bigint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "operationGeneration" bigint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "activeOperationId" uuid;

ALTER TABLE public."LoggedFoodItem"
  ADD COLUMN IF NOT EXISTS "publishedRevision" bigint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "logicalItemId" uuid;

CREATE TABLE IF NOT EXISTS public."MealOperation" (
  id uuid PRIMARY KEY,
  "userId" uuid NOT NULL REFERENCES public."User"(id),
  "messageId" integer NOT NULL REFERENCES public."Message"(id),
  "clientMealId" uuid NOT NULL,
  "payloadHash" text NOT NULL,
  action text NOT NULL CHECK (action IN ('create','replace','portion','move','delete')),
  input jsonb NOT NULL,
  "expectedPublishedRevision" bigint,
  generation bigint NOT NULL,
  version bigint NOT NULL DEFAULT 1,
  state text NOT NULL DEFAULT 'queued'
    CHECK (state IN ('queued','running','retry_wait','needs_clarification','succeeded','failed','conflicted','cancelled','superseded')),
  attempts integer NOT NULL DEFAULT 0,
  "workerToken" uuid,
  "leaseUntil" timestamptz,
  "nextAttemptAt" timestamptz,
  plan jsonb,
  answers jsonb NOT NULL DEFAULT '[]'::jsonb,
  result jsonb,
  "errorCode" text,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now(),
  "completedAt" timestamptz,
  UNIQUE ("messageId", generation)
);
ALTER TABLE public."MealOperation" ADD COLUMN IF NOT EXISTS answers jsonb NOT NULL DEFAULT '[]'::jsonb;
CREATE UNIQUE INDEX IF NOT EXISTS meal_operation_create_identity
  ON public."MealOperation"("userId", "clientMealId") WHERE action='create';
CREATE INDEX IF NOT EXISTS meal_operation_status
  ON public."MealOperation"("userId", "createdAt" DESC);
CREATE INDEX IF NOT EXISTS meal_operation_retry
  ON public."MealOperation"("nextAttemptAt") WHERE state='retry_wait';

CREATE TABLE IF NOT EXISTS public."MealRevision" (
  "messageId" integer NOT NULL REFERENCES public."Message"(id),
  revision bigint NOT NULL CHECK (revision > 0),
  "userId" uuid NOT NULL REFERENCES public."User"(id),
  "operationId" uuid NOT NULL UNIQUE REFERENCES public."MealOperation"(id),
  snapshot jsonb NOT NULL,
  "publishedAt" timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY ("messageId", revision)
);
CREATE INDEX IF NOT EXISTS meal_revision_owner ON public."MealRevision"("userId", "publishedAt" DESC);

CREATE TABLE IF NOT EXISTS public."MealOutbox" (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  "operationId" uuid NOT NULL REFERENCES public."MealOperation"(id),
  generation bigint NOT NULL,
  kind text NOT NULL CHECK (kind IN ('resolve','post_publish')),
  state text NOT NULL DEFAULT 'pending' CHECK (state IN ('pending','dispatched','done')),
  attempts integer NOT NULL DEFAULT 0,
  "availableAt" timestamptz NOT NULL DEFAULT now(),
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  UNIQUE ("operationId", kind)
);
CREATE INDEX IF NOT EXISTS meal_outbox_pending
  ON public."MealOutbox"("availableAt", id) WHERE state='pending';

-- Retrieval only: the model supplies multilingual or translated search terms.
-- Catalogue FoodItem.userId is import attribution; its SELECT policy is public.
CREATE OR REPLACE FUNCTION public.search_meal_food_catalogue(
  p_query text,p_limit integer DEFAULT 20,p_offset integer DEFAULT 0
) RETURNS TABLE(id integer,name text,brand text,"knownAs" text[])
LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $function$
DECLARE pattern text;
BEGIN
  IF p_query IS NULL OR length(trim(p_query)) NOT BETWEEN 1 AND 100 OR
    p_limit NOT BETWEEN 1 AND 20 OR p_offset NOT BETWEEN 0 AND 200
  THEN RAISE EXCEPTION 'Invalid food search' USING ERRCODE='22023'; END IF;
  pattern:='%'||replace(replace(replace(trim(p_query),'\','\\'),'%','\%'),'_','\_')||'%';
  RETURN QUERY SELECT food.id,food.name,food.brand,food."knownAs"
    FROM public."FoodItem" food
    WHERE food.name ILIKE pattern ESCAPE '\' OR food.brand ILIKE pattern ESCAPE '\' OR
      EXISTS (SELECT 1 FROM pg_catalog.unnest(coalesce(food."knownAs",ARRAY[]::text[])) alias
        WHERE alias ILIKE pattern ESCAPE '\')
    ORDER BY CASE WHEN lower(food.name)=lower(trim(p_query)) THEN 0
      WHEN EXISTS (SELECT 1 FROM pg_catalog.unnest(coalesce(food."knownAs",ARRAY[]::text[])) alias
        WHERE lower(alias)=lower(trim(p_query))) THEN 1 ELSE 2 END,food.id
    LIMIT p_limit OFFSET p_offset;
END;
$function$;

ALTER TABLE public."MealOperation" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."MealRevision" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."MealOutbox" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."MealOperation", public."MealRevision", public."MealOutbox" FROM PUBLIC, anon, authenticated;
REVOKE ALL ON SEQUENCE public."MealOutbox_id_seq" FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public."MealOperation", public."MealRevision", public."MealOutbox" TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public."MealOutbox_id_seq" TO service_role;

-- A duplicate operation is resolved before any attempt to create or edit its
-- message. The advisory lock serializes same-key retries across HTTP workers.
CREATE OR REPLACE FUNCTION public.accept_meal_operation(
  p_user_id uuid, p_operation_id uuid, p_client_meal_id uuid,
  p_message_id integer, p_expected_revision bigint,
  p_action text, p_input jsonb, p_payload_hash text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $function$
DECLARE
  existing public."MealOperation"%ROWTYPE;
  target public."Message"%ROWTYPE;
  new_generation bigint;
  image_id integer;
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
  IF p_action='create' THEN
    IF p_message_id IS NOT NULL OR p_expected_revision IS NOT NULL OR
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
  UPDATE public."Message" SET "operationGeneration"=new_generation,"activeOperationId"=p_operation_id
    WHERE id=target.id;
  INSERT INTO public."MealOutbox"("operationId",generation,kind) VALUES (p_operation_id,new_generation,'resolve');
  RETURN jsonb_build_object('operationId',p_operation_id,'messageId',target.id,
    'generation',new_generation,'operationVersion',1,'state','queued',
    'publishedRevision',target."publishedRevision");
END;
$function$;

-- Queue delivery is at least once. A lease token fences late attempts.
CREATE OR REPLACE FUNCTION public.claim_meal_operation(p_operation_id uuid, p_worker_token uuid,
  p_lease_seconds integer DEFAULT 45) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $function$
DECLARE op public."MealOperation"%ROWTYPE;
BEGIN
  IF p_operation_id IS NULL OR p_worker_token IS NULL OR p_lease_seconds NOT BETWEEN 5 AND 300
  THEN RAISE EXCEPTION 'Invalid claim' USING ERRCODE='22023'; END IF;
  UPDATE public."MealOperation" SET state='running',"workerToken"=p_worker_token,
    "leaseUntil"=now()+make_interval(secs=>p_lease_seconds),attempts=attempts+1,
    version=version+1,"updatedAt"=now()
  WHERE id=p_operation_id AND (state='queued' OR
    (state='retry_wait' AND "nextAttemptAt"<=now()) OR
    (state='running' AND "leaseUntil"<now()))
  RETURNING * INTO op;
  IF op.id IS NULL THEN RETURN NULL; END IF;
  IF NOT EXISTS (SELECT 1 FROM public."Message" m WHERE m.id=op."messageId"
    AND m."activeOperationId"=op.id AND m."operationGeneration"=op.generation AND m."deletedAt" IS NULL)
  THEN
    UPDATE public."MealOperation" SET state='conflicted',"workerToken"=NULL,"leaseUntil"=NULL,
      version=version+1,"updatedAt"=now(),"completedAt"=now() WHERE id=op.id;
    RETURN NULL;
  END IF;
  RETURN jsonb_build_object('operationId',op.id,'messageId',op."messageId",'userId',op."userId",
    'generation',op.generation,'operationVersion',op.version,'workerToken',p_worker_token,
    'action',op.action,'input',op.input,'answers',op.answers,'attempts',op.attempts,
    'expectedPublishedRevision',op."expectedPublishedRevision");
END;
$function$;

-- Finalized plans are expanded by application validation first. This function
-- checks evidence and revision ownership again while holding short row locks.
CREATE OR REPLACE FUNCTION public.publish_meal_operation(
  p_operation_id uuid, p_worker_token uuid, p_plan jsonb
) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $function$
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
  THEN RAISE EXCEPTION 'Operation claim changed' USING ERRCODE='40001'; END IF;
  SELECT * INTO target FROM public."Message" WHERE id=op."messageId" FOR UPDATE;
  IF target.id IS NULL OR target."userId" IS DISTINCT FROM op."userId" OR target."deletedAt" IS NOT NULL
    OR target."activeOperationId" IS DISTINCT FROM op.id OR
    target."operationGeneration" IS DISTINCT FROM op.generation OR
    (op.action <> 'create' AND target."publishedRevision" IS DISTINCT FROM op."expectedPublishedRevision")
  THEN RAISE EXCEPTION 'Meal revision changed' USING ERRCODE='40001'; END IF;
  IF op.action IN ('create','replace') AND p_plan->>'originalText' IS DISTINCT FROM op.input->>'originalText'
    OR op.action IN ('portion','move','delete') AND p_plan->>'originalText' IS DISTINCT FROM target.content
    OR op.action='move' AND (p_plan->>'consumedOn')::timestamp IS DISTINCT FROM (op.input->>'consumedOn')::timestamp
    OR op.action IN ('portion','delete') AND (p_plan->>'consumedOn')::timestamp IS DISTINCT FROM target."consumedOn"
  THEN RAISE EXCEPTION 'Plan input changed' USING ERRCODE='40001'; END IF;
  IF p_plan->'input'->'attachmentIds' IS NOT NULL THEN
    IF jsonb_typeof(p_plan->'input'->'attachmentIds')<>'array' OR
      jsonb_array_length(p_plan->'input'->'attachmentIds')>10
    THEN RAISE EXCEPTION 'Invalid plan attachments' USING ERRCODE='22023'; END IF;
    FOR image_id IN SELECT value::integer FROM jsonb_array_elements_text(p_plan->'input'->'attachmentIds') LOOP
      IF NOT EXISTS (SELECT 1 FROM public."UserMessageImages" image WHERE image.id=image_id
        AND image."userId"=op."userId" AND image."messageId"=target.id)
      THEN RAISE EXCEPTION 'Photo evidence changed' USING ERRCODE='40001'; END IF;
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
  THEN RAISE EXCEPTION 'Historical evidence changed' USING ERRCODE='40001'; END IF;
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
    THEN RAISE EXCEPTION 'Catalogue evidence changed' USING ERRCODE='40001'; END IF;
    IF item->>'servingId' IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public."Serving" s
      WHERE s.id=(item->>'servingId')::integer AND s."foodItemId"=next_food_id)
    THEN RAISE EXCEPTION 'Serving evidence unavailable' USING ERRCODE='22023'; END IF;
    IF item->>'servingId' IS NOT NULL AND item->>'origin' IS DISTINCT FROM 'history' AND
      NOT EXISTS (SELECT 1 FROM public."Serving" s WHERE s.id=(item->>'servingId')::integer
        AND s."foodItemId"=next_food_id AND s."servingWeightGram">0 AND s."defaultServingAmount">0
        AND abs(grams_value-(item->>'servingAmount')::float8*s."servingWeightGram"/s."defaultServingAmount")
          <=greatest(0.000001,grams_value*0.000001))
    THEN RAISE EXCEPTION 'Serving quantity changed' USING ERRCODE='40001'; END IF;
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
$function$;

-- Failure cannot touch the last published message or foods.
DROP FUNCTION IF EXISTS public.finish_meal_operation(uuid,uuid,text,text,timestamptz);
CREATE OR REPLACE FUNCTION public.finish_meal_operation(
  p_operation_id uuid, p_worker_token uuid, p_state text, p_error_code text,
  p_next_attempt timestamptz DEFAULT NULL, p_result jsonb DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $function$
DECLARE op public."MealOperation"%ROWTYPE;
BEGIN
  IF p_state NOT IN ('retry_wait','needs_clarification','failed')
  THEN RAISE EXCEPTION 'Invalid completion state' USING ERRCODE='22023'; END IF;
  PERFORM pg_catalog.set_config('app.meal_operation_write','true',true);
  SELECT * INTO op FROM public."MealOperation" WHERE id=p_operation_id FOR UPDATE;
  IF op.id IS NULL OR op.state<>'running' OR op."workerToken" IS DISTINCT FROM p_worker_token
  THEN RAISE EXCEPTION 'Operation claim changed' USING ERRCODE='40001'; END IF;
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
$function$;

CREATE OR REPLACE FUNCTION public.answer_meal_operation(
  p_user_id uuid,p_operation_id uuid,p_expected_version bigint,p_answer text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $function$
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
  THEN RAISE EXCEPTION 'Operation version changed' USING ERRCODE='40001'; END IF;
  UPDATE public."MealOperation" SET state='queued',version=version+1,
    answers=answers||jsonb_build_array(jsonb_build_object('text',p_answer,'at',now())),
    result=NULL,"errorCode"=NULL,"updatedAt"=now() WHERE id=op.id;
  UPDATE public."MealOutbox" SET state='pending',"availableAt"=now()
    WHERE "operationId"=op.id AND kind='resolve';
  RETURN jsonb_build_object('operationId',op.id,'state','queued','operationVersion',op.version+1);
END;
$function$;

CREATE OR REPLACE FUNCTION public.cancel_meal_operation(
  p_user_id uuid,p_operation_id uuid,p_expected_version bigint
) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $function$
DECLARE op public."MealOperation"%ROWTYPE;
BEGIN
  SELECT * INTO op FROM public."MealOperation" WHERE id=p_operation_id FOR UPDATE;
  PERFORM pg_catalog.set_config('app.meal_operation_write','true',true);
  IF op.id IS NULL OR op."userId" IS DISTINCT FROM p_user_id
  THEN RAISE EXCEPTION 'Operation unavailable' USING ERRCODE='42501'; END IF;
  IF op.state NOT IN ('queued','running','retry_wait','needs_clarification') OR
    op.version <> p_expected_version
  THEN RAISE EXCEPTION 'Operation version changed' USING ERRCODE='40001'; END IF;
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
$function$;

-- Legacy message and item writers may still run after a new-protocol request.
-- They cannot publish into, mutate, or roll back a revision-owned meal.
CREATE OR REPLACE FUNCTION public.guard_meal_message_write() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $function$
BEGIN
  IF (OLD."publishedRevision">0 OR OLD."activeOperationId" IS NOT NULL OR
      NEW."activeOperationId" IS NOT NULL) AND
     pg_catalog.current_setting('app.meal_operation_write',true) IS DISTINCT FROM 'true'
  THEN RAISE EXCEPTION 'Meal is owned by the operation protocol' USING ERRCODE='55000'; END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$function$;
DROP TRIGGER IF EXISTS guard_meal_message_write ON public."Message";
CREATE TRIGGER guard_meal_message_write BEFORE UPDATE OR DELETE ON public."Message"
  FOR EACH ROW EXECUTE FUNCTION public.guard_meal_message_write();

CREATE OR REPLACE FUNCTION public.guard_meal_food_write() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $function$
BEGIN
  IF EXISTS (SELECT 1 FROM public."Message" m
      WHERE (m.id=OLD."messageId" OR m.id=NEW."messageId")
      AND (m."publishedRevision">0 OR m."activeOperationId" IS NOT NULL)) AND
     pg_catalog.current_setting('app.meal_operation_write',true) IS DISTINCT FROM 'true'
  THEN RAISE EXCEPTION 'Meal foods are owned by the operation protocol' USING ERRCODE='55000'; END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$function$;
DROP TRIGGER IF EXISTS guard_meal_food_write ON public."LoggedFoodItem";
CREATE TRIGGER guard_meal_food_write BEFORE INSERT OR UPDATE OR DELETE ON public."LoggedFoodItem"
  FOR EACH ROW EXECUTE FUNCTION public.guard_meal_food_write();

REVOKE ALL ON FUNCTION public.accept_meal_operation(uuid,uuid,uuid,integer,bigint,text,jsonb,text)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.search_meal_food_catalogue(text,integer,integer)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.claim_meal_operation(uuid,uuid,integer)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.publish_meal_operation(uuid,uuid,jsonb)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.finish_meal_operation(uuid,uuid,text,text,timestamptz,jsonb)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.answer_meal_operation(uuid,uuid,bigint,text)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.cancel_meal_operation(uuid,uuid,bigint)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.accept_meal_operation(uuid,uuid,uuid,integer,bigint,text,jsonb,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.search_meal_food_catalogue(text,integer,integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.claim_meal_operation(uuid,uuid,integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.publish_meal_operation(uuid,uuid,jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.finish_meal_operation(uuid,uuid,text,text,timestamptz,jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.answer_meal_operation(uuid,uuid,bigint,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.cancel_meal_operation(uuid,uuid,bigint) TO service_role;
NOTIFY pgrst, 'reload schema';
