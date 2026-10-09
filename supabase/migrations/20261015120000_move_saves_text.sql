-- "Save text only": editing a meal's words without "Update foods from the text" saves them through a move (its time
-- and text, the foods unchanged), so a move's plan carries the text the edit sent, not necessarily the stored one.
-- Everything else in publish_meal_operation is unchanged.
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
  THEN RAISE EXCEPTION 'Operation claim changed' USING ERRCODE='40001'; END IF;
  SELECT * INTO target FROM public."Message" WHERE id=op."messageId" FOR UPDATE;
  IF target.id IS NULL OR target."userId" IS DISTINCT FROM op."userId" OR target."deletedAt" IS NOT NULL
    OR target."activeOperationId" IS DISTINCT FROM op.id OR
    target."operationGeneration" IS DISTINCT FROM op.generation OR
    (op.action <> 'create' AND target."publishedRevision" IS DISTINCT FROM op."expectedPublishedRevision")
  THEN RAISE EXCEPTION 'Meal revision changed' USING ERRCODE='40001'; END IF;
  IF op.action IN ('create','replace','move') AND p_plan->>'originalText' IS DISTINCT FROM op.input->>'originalText'
    OR op.action IN ('portion','delete') AND p_plan->>'originalText' IS DISTINCT FROM target.content
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
