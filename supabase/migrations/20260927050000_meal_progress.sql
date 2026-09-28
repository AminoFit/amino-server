-- Meal progress (2026-09-27): while a meal resolves (about 20 s for a photo) the app showed a static "Processing…".
-- Message.progress now carries the current stage and, after the first look at a photo, a preview of the foods
-- (name, icon, estimated calories and macros) that the app can show greyed out until the meal is saved. The app
-- already receives Message updates through realtime; progress only means something while the message is processing.
ALTER TABLE public."Message" ADD COLUMN IF NOT EXISTS progress jsonb;
COMMENT ON COLUMN public."Message".progress IS 'Stage and preview while a meal operation resolves: {stage, startedAt, preview?}.';

-- Only the operation's current worker may report, and only for the message it owns: a stale or duplicate delivery
-- (claim token or lease no longer valid, or a newer operation active) is ignored.
CREATE OR REPLACE FUNCTION public.report_meal_operation_progress(p_operation_id uuid, p_worker_token uuid, p_progress jsonb)
RETURNS boolean LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $function$
DECLARE op public."MealOperation"%ROWTYPE;
BEGIN
  IF p_progress IS NOT NULL AND (jsonb_typeof(p_progress) <> 'object' OR pg_catalog.pg_column_size(p_progress) > 8192) THEN
    RAISE EXCEPTION 'Invalid meal progress' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO op FROM public."MealOperation"
  WHERE id = p_operation_id AND state = 'running' AND "workerToken" = p_worker_token AND "leaseUntil" > now();
  IF op.id IS NULL THEN RETURN false; END IF;
  PERFORM pg_catalog.set_config('app.meal_operation_write', 'true', true);
  UPDATE public."Message" SET progress = p_progress
  WHERE id = op."messageId" AND "activeOperationId" = op.id AND "operationGeneration" = op.generation AND "deletedAt" IS NULL;
  RETURN FOUND;
END;
$function$;
REVOKE ALL ON FUNCTION public.report_meal_operation_progress(uuid, uuid, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.report_meal_operation_progress(uuid, uuid, jsonb) TO service_role;
NOTIFY pgrst, 'reload schema';
