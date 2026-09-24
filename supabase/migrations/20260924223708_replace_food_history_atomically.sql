-- Service-role-only, SECURITY INVOKER: a single PostgREST transaction replaces
-- the target's food group and completion, or rolls back every change.
CREATE OR REPLACE FUNCTION public.replace_food_from_history(
  p_user_id uuid, p_message_id integer, p_consumed_on timestamptz,
  p_expected jsonb, p_source jsonb, p_food_ids integer[]
) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $function$
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
  THEN RAISE EXCEPTION 'History meal changed or is unavailable' USING ERRCODE = '40001'; END IF;

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
  THEN RAISE EXCEPTION 'Historical foods changed or are incomplete' USING ERRCODE = '40001'; END IF;

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
$function$;
REVOKE ALL ON FUNCTION public.replace_food_from_history(uuid,integer,timestamptz,jsonb,jsonb,integer[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.replace_food_from_history(uuid,integer,timestamptz,jsonb,jsonb,integer[]) TO service_role;
NOTIFY pgrst, 'reload schema';
