-- Private foods (2026-09-27): a food can belong to one user instead of the shared catalogue: a personal dish the meal
-- agent estimates from their description ("grandma's lasagna"), or a food they create by hand. Shared foods have no
-- owner. privateToUserId is deliberately not a foreign key: deleting a user must not cascade into food rows that
-- servings reference; an orphaned private food is simply visible to nobody.
-- The app reads foods with the user's own session, so the read policy protects private foods there; server code uses
-- the service role and filters explicitly (every catalogue search function takes the requesting user).

ALTER TABLE public."FoodItem" ADD COLUMN IF NOT EXISTS "privateToUserId" uuid;
COMMENT ON COLUMN public."FoodItem"."privateToUserId" IS 'Owner of a private food; NULL for the shared catalogue.';
CREATE INDEX IF NOT EXISTS "FoodItem_privateToUserId_idx" ON public."FoodItem"("privateToUserId") WHERE "privateToUserId" IS NOT NULL;

-- Names are unique per owner: two users may each have their own "Grandma's lasagna".
ALTER TABLE public."FoodItem" DROP CONSTRAINT IF EXISTS "FoodItem_name_brand_key";
DROP INDEX IF EXISTS public."FoodItem_name_brand_key";
CREATE UNIQUE INDEX IF NOT EXISTS "FoodItem_name_brand_owner_key"
  ON public."FoodItem"(name, brand, coalesce("privateToUserId", '00000000-0000-0000-0000-000000000000'::uuid));

DROP POLICY IF EXISTS "Enable read access for all users" ON public."FoodItem";
DROP POLICY IF EXISTS "Read shared foods and your own private foods" ON public."FoodItem";
CREATE POLICY "Read shared foods and your own private foods" ON public."FoodItem" FOR SELECT
  USING ("privateToUserId" IS NULL OR "privateToUserId" = auth.uid());

-- A serving is readable when its food is: the subquery runs under the reader's own FoodItem policy.
DROP POLICY IF EXISTS "Enable read access for all users" ON public."Serving";
DROP POLICY IF EXISTS "Read servings of visible foods" ON public."Serving";
CREATE POLICY "Read servings of visible foods" ON public."Serving" FOR SELECT
  USING (EXISTS (SELECT 1 FROM public."FoodItem" f WHERE f.id = "foodItemId"));

DROP FUNCTION IF EXISTS public.search_meal_food_catalogue(text, integer, integer);
CREATE OR REPLACE FUNCTION public.search_meal_food_catalogue(
  p_query text, p_limit integer DEFAULT 20, p_offset integer DEFAULT 0, p_user_id uuid DEFAULT NULL
) RETURNS TABLE(id integer, name text, brand text, "knownAs" text[])
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = '' AS $function$
DECLARE q text := public.food_identity_part(p_query);
BEGIN
  IF p_query IS NULL OR length(trim(p_query)) NOT BETWEEN 1 AND 100 OR
    p_limit NOT BETWEEN 1 AND 20 OR p_offset NOT BETWEEN 0 AND 200 OR q = ''
  THEN RAISE EXCEPTION 'Invalid food search' USING ERRCODE='22023'; END IF;
  PERFORM pg_catalog.set_config('pg_trgm.word_similarity_threshold', '0.45', true);
  RETURN QUERY
    SELECT f.id, f.name, f.brand, f."knownAs"
    FROM public."FoodItem" f
    WHERE (q OPERATOR(extensions.<%) public.food_identity_part(f.name)
       OR public.food_identity_part(f.brand) = q
       OR EXISTS (SELECT 1 FROM pg_catalog.unnest(coalesce(f."knownAs", ARRAY[]::text[])) alias
                  WHERE public.food_identity_part(alias) = q))
      AND (f."privateToUserId" IS NULL OR f."privateToUserId" = p_user_id)
    ORDER BY (public.food_identity_part(f.name) = q) DESC,
      extensions.word_similarity(q, public.food_identity_part(f.name)) DESC, f.id
    LIMIT p_limit OFFSET p_offset;
END;
$function$;
REVOKE ALL ON FUNCTION public.search_meal_food_catalogue(text, integer, integer, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.search_meal_food_catalogue(text, integer, integer, uuid) TO service_role;

DROP FUNCTION IF EXISTS public.get_cosine_results(integer, integer);
CREATE OR REPLACE FUNCTION public.get_cosine_results(p_embedding_cache_id integer, amount_of_results integer DEFAULT 5, p_user_id uuid DEFAULT NULL)
RETURNS TABLE(id integer, name text, brand text, "foodInfoSource" text, "externalId" text, embedding text, cosine_similarity double precision)
LANGUAGE plpgsql STABLE SET search_path = 'public', 'extensions' AS $function$
DECLARE query_vector extensions.vector;
BEGIN
  SELECT c."bgeBaseEmbedding" INTO query_vector FROM public."foodEmbeddingCache" c WHERE c.id = p_embedding_cache_id;
  IF query_vector IS NULL THEN RETURN; END IF;
  RETURN QUERY
    SELECT f.id, f.name, f.brand, f."foodInfoSource"::text, f."externalId", f."bgeBaseEmbedding"::text,
      1 - (f."bgeBaseEmbedding" <=> query_vector)
    FROM public."FoodItem" f
    WHERE f."bgeBaseEmbedding" IS NOT NULL AND (f."privateToUserId" IS NULL OR f."privateToUserId" = p_user_id)
    ORDER BY f."bgeBaseEmbedding" <=> query_vector
    LIMIT amount_of_results;
END;
$function$;

-- p_private creates the food for p_user_id only. Lookups for an existing food (same identity, barcode or source record)
-- see the shared catalogue plus, for a private creation, that user's own foods: a shared creation never returns or
-- enriches someone's private food, and a private one reuses a shared food that already is the same.
DROP FUNCTION IF EXISTS public.create_catalogue_food(uuid, integer, jsonb, jsonb);
CREATE OR REPLACE FUNCTION public.create_catalogue_food(p_user_id uuid, p_message_id integer, p_food jsonb, p_servings jsonb,
  p_private boolean DEFAULT false)
 RETURNS TABLE(food_id integer, created boolean, enrichment jsonb)
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE
  identity text := public.food_identity_key(p_food->>'name', p_food->>'brand');
  source public."FoodInfoSource" := coalesce(p_food->>'foodInfoSource','Online')::public."FoodInfoSource";
  external text := nullif(pg_catalog.btrim(p_food->>'externalId'), '');
  code text := public.gtin14(p_food->>'gtin');
  owner uuid := CASE WHEN p_private THEN p_user_id END;
  existing integer;
  inserted integer;
BEGIN
  IF length(public.food_identity_part(p_food->>'name')) < 2 OR
     coalesce((p_food->>'defaultServingWeightGram')::float8, 0) <= 0 OR
     jsonb_typeof(p_servings) IS DISTINCT FROM 'array' OR jsonb_array_length(p_servings) > 10
  THEN RAISE EXCEPTION 'Invalid catalogue food' USING ERRCODE = '22023'; END IF;
  IF p_private AND p_user_id IS NULL THEN RAISE EXCEPTION 'A private food needs its owner' USING ERRCODE = '22023'; END IF;

  -- Serialize creators of the same identity (and barcode) so two workers cannot both insert.
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(identity || coalesce(':' || owner::text, ''), 0));
  IF code IS NOT NULL THEN PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('gtin:'||code, 0)); END IF;
  SELECT f.id INTO existing FROM public."FoodItem" f
    WHERE ((code IS NOT NULL AND f.gtin = code)
       OR public.food_identity_key(f.name, f.brand) = identity
       OR (external IS NOT NULL AND f."externalId" = external AND f."foodInfoSource" = source))
      AND (f."privateToUserId" IS NULL OR f."privateToUserId" = owner)
    ORDER BY (code IS NOT NULL AND f.gtin = code) DESC, (f."privateToUserId" IS NULL) DESC, f.id LIMIT 1;
  IF existing IS NOT NULL THEN
    RETURN QUERY SELECT existing, false, public.enrich_catalogue_food(existing, p_food, p_servings); RETURN;
  END IF;

  INSERT INTO public."FoodItem" (name, brand, "defaultServingWeightGram", "kcalPerServing",
    "proteinPerServing", "carbPerServing", "totalFatPerServing", "fiberPerServing",
    "sugarPerServing", "satFatPerServing", "isLiquid", "userId", "messageId",
    "foodInfoSource", "externalId", gtin, "UPC", "bgeBaseEmbedding", description, verified, "privateToUserId")
  VALUES (pg_catalog.btrim(p_food->>'name'), nullif(pg_catalog.btrim(p_food->>'brand'), ''),
    (p_food->>'defaultServingWeightGram')::float8, (p_food->>'kcal')::float8,
    (p_food->>'proteinG')::float8, (p_food->>'carbG')::float8, (p_food->>'totalFatG')::float8,
    (p_food->>'fiberG')::float8, (p_food->>'sugarG')::float8, (p_food->>'satFatG')::float8,
    coalesce((p_food->>'isLiquid')::boolean, false), p_user_id, p_message_id,
    source, external, code, code::bigint, (p_food->>'bgeBaseEmbedding')::extensions.vector,
    p_food->>'source', source = 'USDA', owner)
  RETURNING id INTO inserted;

  INSERT INTO public."Serving" ("foodItemId", "servingName", "servingWeightGram", "defaultServingAmount")
  SELECT inserted, pg_catalog.btrim(s->>'name'), (s->>'grams')::float8, coalesce(nullif((s->>'amount')::numeric,0),1)
    FROM jsonb_array_elements(p_servings) s
    WHERE length(pg_catalog.btrim(coalesce(s->>'name',''))) > 0 AND (s->>'grams')::float8 > 0;

  RETURN QUERY SELECT inserted, true, NULL::jsonb;
END;
$function$;
REVOKE ALL ON FUNCTION public.create_catalogue_food(uuid, integer, jsonb, jsonb, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_catalogue_food(uuid, integer, jsonb, jsonb, boolean) TO service_role;
NOTIFY pgrst, 'reload schema';
