-- Agent-created catalogue foods. The resolver may only create a food after a
-- semantic duplicate check; this function is the final, race-safe guard. It
-- compares an accent/case/punctuation-insensitive identity and returns the
-- existing food instead of inserting a second one.
CREATE EXTENSION IF NOT EXISTS unaccent WITH SCHEMA extensions;

CREATE OR REPLACE FUNCTION public.food_identity_part(p_value text) RETURNS text
LANGUAGE sql IMMUTABLE PARALLEL SAFE SET search_path = '' AS $function$
  SELECT pg_catalog.btrim(pg_catalog.regexp_replace(pg_catalog.lower(
    extensions.unaccent('extensions.unaccent'::regdictionary, coalesce(p_value,''))),
    '[^[:alnum:]]+', ' ', 'g'))
$function$;

CREATE OR REPLACE FUNCTION public.food_identity_key(p_name text, p_brand text) RETURNS text
LANGUAGE sql IMMUTABLE PARALLEL SAFE SET search_path = '' AS $function$
  SELECT public.food_identity_part(p_name) || '|' || public.food_identity_part(p_brand)
$function$;

CREATE INDEX IF NOT EXISTS "FoodItem_identity_key_idx"
  ON public."FoodItem" (public.food_identity_key(name, brand));

CREATE OR REPLACE FUNCTION public.create_catalogue_food(
  p_user_id uuid, p_message_id integer, p_food jsonb, p_servings jsonb
) RETURNS TABLE(food_id integer, created boolean)
LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $function$
DECLARE
  identity text := public.food_identity_key(p_food->>'name', p_food->>'brand');
  source public."FoodInfoSource" := coalesce(p_food->>'foodInfoSource','Online')::public."FoodInfoSource";
  external text := nullif(pg_catalog.btrim(p_food->>'externalId'), '');
  existing integer;
  inserted integer;
BEGIN
  IF length(public.food_identity_part(p_food->>'name')) < 2 OR
     coalesce((p_food->>'defaultServingWeightGram')::float8, 0) <= 0 OR
     jsonb_typeof(p_servings) IS DISTINCT FROM 'array' OR jsonb_array_length(p_servings) > 10
  THEN RAISE EXCEPTION 'Invalid catalogue food' USING ERRCODE = '22023'; END IF;

  -- Serialize creators of the same identity so two workers cannot both insert.
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(identity, 0));
  SELECT f.id INTO existing FROM public."FoodItem" f
    WHERE public.food_identity_key(f.name, f.brand) = identity
       OR (external IS NOT NULL AND f."externalId" = external AND f."foodInfoSource" = source)
    ORDER BY f.id LIMIT 1;
  IF existing IS NOT NULL THEN
    RETURN QUERY SELECT existing, false; RETURN;
  END IF;

  INSERT INTO public."FoodItem" (name, brand, "defaultServingWeightGram", "kcalPerServing",
    "proteinPerServing", "carbPerServing", "totalFatPerServing", "fiberPerServing",
    "sugarPerServing", "satFatPerServing", "isLiquid", "userId", "messageId",
    "foodInfoSource", "externalId", "bgeBaseEmbedding", description, verified)
  VALUES (pg_catalog.btrim(p_food->>'name'), nullif(pg_catalog.btrim(p_food->>'brand'), ''),
    (p_food->>'defaultServingWeightGram')::float8, (p_food->>'kcal')::float8,
    (p_food->>'proteinG')::float8, (p_food->>'carbG')::float8, (p_food->>'totalFatG')::float8,
    (p_food->>'fiberG')::float8, (p_food->>'sugarG')::float8, (p_food->>'satFatG')::float8,
    coalesce((p_food->>'isLiquid')::boolean, false), p_user_id, p_message_id,
    source, external, (p_food->>'bgeBaseEmbedding')::extensions.vector,
    p_food->>'source', source = 'USDA')
  RETURNING id INTO inserted;

  INSERT INTO public."Serving" ("foodItemId", "servingName", "servingWeightGram", "defaultServingAmount")
  SELECT inserted, pg_catalog.btrim(s->>'name'), (s->>'grams')::float8, 1
    FROM jsonb_array_elements(p_servings) s
    WHERE length(pg_catalog.btrim(coalesce(s->>'name',''))) > 0 AND (s->>'grams')::float8 > 0;

  RETURN QUERY SELECT inserted, true;
END;
$function$;

REVOKE ALL ON FUNCTION public.create_catalogue_food(uuid, integer, jsonb, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_catalogue_food(uuid, integer, jsonb, jsonb) TO service_role;
NOTIFY pgrst, 'reload schema';
