-- Custom foods and recipes (2026-09-30, plan: 2026-09-30-custom-foods-and-recipes-plan.md).
--
-- A user's own food is a private FoodItem (privateToUserId, from 20260927010000_private_foods). A recipe is a private
-- FoodItem with recipePortions set: its default serving is one portion, its nutrients are per portion, and its
-- ingredients are RecipeIngredient rows. Logging "1.5 portions" is then an ordinary serving log.
--
-- Edits only apply going forward. Logged rows already store their nutrients; on top of that, editing a food that has
-- logs (or is a recipe ingredient) archives it and saves a new version (previousVersionId), so past logs keep the
-- ingredient list and serving basis they were logged with. A food with no logs is edited in place. Nothing a user made
-- is ever hard-deleted: LoggedFoodItem.foodItemId would be nulled.
--
-- Until the agent's recipe check exists (plan phase 4), recipes are left out of every catalogue search unless the
-- FeatureFlag recipes_in_agent allows the user ('off', 'all' or a list of user IDs). Archived foods are never searched.

ALTER TABLE public."FoodItem"
  ADD COLUMN IF NOT EXISTS "archivedAt" timestamptz,
  ADD COLUMN IF NOT EXISTS "previousVersionId" integer REFERENCES public."FoodItem"(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS "recipePortions" numeric(8,2),
  ADD COLUMN IF NOT EXISTS "cookedWeightGram" double precision;
COMMENT ON COLUMN public."FoodItem"."archivedAt" IS 'A user''s food that was deleted or replaced by a newer version; past logs still show it.';
COMMENT ON COLUMN public."FoodItem"."previousVersionId" IS 'The version of this user''s food that this row replaced.';
COMMENT ON COLUMN public."FoodItem"."recipePortions" IS 'Set exactly for recipes: the number of portions the ingredients make.';
COMMENT ON COLUMN public."FoodItem"."cookedWeightGram" IS 'Optional cooked weight of a whole recipe; a portion is this divided by the portions.';

ALTER TABLE public."FoodItem" DROP CONSTRAINT IF EXISTS "FoodItem_user_food_shape";
ALTER TABLE public."FoodItem" ADD CONSTRAINT "FoodItem_user_food_shape" CHECK (
  ("recipePortions" IS NULL OR ("privateToUserId" IS NOT NULL AND "recipePortions" > 0 AND "recipePortions" <= 1000)) AND
  ("cookedWeightGram" IS NULL OR ("recipePortions" IS NOT NULL AND "cookedWeightGram" > 0)) AND
  ("archivedAt" IS NULL OR "privateToUserId" IS NOT NULL));

-- Names stay unique per owner among current foods. An archived version keeps its name, so the new version can too.
-- Recipes have their own namespace (by identity, so "Chili" and "chili" clash), which keeps the agent's private
-- creations (personal estimates) from ever colliding with a recipe it cannot see yet.
DROP INDEX IF EXISTS public."FoodItem_name_brand_owner_key";
CREATE UNIQUE INDEX "FoodItem_name_brand_owner_key"
  ON public."FoodItem"(name, brand, coalesce("privateToUserId", '00000000-0000-0000-0000-000000000000'::uuid))
  WHERE "archivedAt" IS NULL AND "recipePortions" IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS "FoodItem_recipe_owner_name_key"
  ON public."FoodItem"("privateToUserId", public.food_identity_key(name, brand))
  WHERE "recipePortions" IS NOT NULL AND "archivedAt" IS NULL;

CREATE TABLE IF NOT EXISTS public."RecipeIngredient" (
  id serial PRIMARY KEY,
  "recipeFoodItemId" integer NOT NULL REFERENCES public."FoodItem"(id) ON DELETE CASCADE,
  "foodItemId" integer NOT NULL REFERENCES public."FoodItem"(id) ON DELETE RESTRICT,
  grams double precision NOT NULL CHECK (grams > 0 AND grams <= 20000),
  "servingId" integer REFERENCES public."Serving"(id) ON DELETE SET NULL,
  "servingAmount" double precision CHECK ("servingAmount" > 0),
  "loggedUnit" text,
  position smallint NOT NULL DEFAULT 0,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  CHECK ("recipeFoodItemId" <> "foodItemId"));
CREATE INDEX IF NOT EXISTS "RecipeIngredient_recipeFoodItemId_idx" ON public."RecipeIngredient"("recipeFoodItemId");
CREATE INDEX IF NOT EXISTS "RecipeIngredient_foodItemId_idx" ON public."RecipeIngredient"("foodItemId");
ALTER TABLE public."RecipeIngredient" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."RecipeIngredient" FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public."RecipeIngredient" TO authenticated;
GRANT ALL ON public."RecipeIngredient" TO service_role;
GRANT USAGE ON SEQUENCE public."RecipeIngredient_id_seq" TO service_role;
-- Readable with its recipe: the subquery runs under the reader's own FoodItem policy. Writes go through the server.
DROP POLICY IF EXISTS "Read ingredients of visible recipes" ON public."RecipeIngredient";
CREATE POLICY "Read ingredients of visible recipes" ON public."RecipeIngredient" FOR SELECT
  USING (EXISTS (SELECT 1 FROM public."FoodItem" f WHERE f.id = "recipeFoodItemId"));

INSERT INTO public."FeatureFlag"(name, value) VALUES ('recipes_in_agent', 'off') ON CONFLICT (name) DO NOTHING;

-- The same rule as src/mealResolution/fastRouteFlag.ts: 'all', 'off' (or empty), or a comma-separated list of user IDs.
CREATE OR REPLACE FUNCTION public.user_flag_enabled(p_flag text, p_user_id uuid) RETURNS boolean
LANGUAGE sql STABLE SET search_path = '' AS $function$
  SELECT coalesce((
    SELECT CASE WHEN pg_catalog.lower(pg_catalog.btrim(f.value)) = 'all' THEN true
      WHEN p_user_id IS NULL OR pg_catalog.lower(pg_catalog.btrim(f.value)) IN ('', 'off') THEN false
      ELSE pg_catalog.lower(p_user_id::text) = ANY (
        SELECT pg_catalog.btrim(id) FROM pg_catalog.unnest(pg_catalog.string_to_array(pg_catalog.lower(f.value), ',')) id) END
    FROM public."FeatureFlag" f WHERE f.name = p_flag), false)
$function$;
REVOKE ALL ON FUNCTION public.user_flag_enabled(text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.user_flag_enabled(text, uuid) TO service_role;

-- Catalogue searches (agent, fast route, app search): no archived versions, and recipes only behind the flag.
CREATE OR REPLACE FUNCTION public.search_meal_food_catalogue(
  p_query text, p_limit integer DEFAULT 20, p_offset integer DEFAULT 0, p_user_id uuid DEFAULT NULL
) RETURNS TABLE(id integer, name text, brand text, "knownAs" text[])
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = '' AS $function$
DECLARE q text := public.food_identity_part(p_query);
  recipes boolean := public.user_flag_enabled('recipes_in_agent', p_user_id);
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
      AND f."archivedAt" IS NULL AND (f."recipePortions" IS NULL OR recipes)
    ORDER BY (public.food_identity_part(f.name) = q) DESC,
      extensions.word_similarity(q, public.food_identity_part(f.name)) DESC, f.id
    LIMIT p_limit OFFSET p_offset;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_cosine_results(p_embedding_cache_id integer, amount_of_results integer DEFAULT 5, p_user_id uuid DEFAULT NULL)
RETURNS TABLE(id integer, name text, brand text, "foodInfoSource" text, "externalId" text, embedding text, cosine_similarity double precision)
LANGUAGE plpgsql STABLE SET search_path = 'public', 'extensions' AS $function$
DECLARE query_vector extensions.vector;
  recipes boolean := public.user_flag_enabled('recipes_in_agent', p_user_id);
BEGIN
  SELECT c."bgeBaseEmbedding" INTO query_vector FROM public."foodEmbeddingCache" c WHERE c.id = p_embedding_cache_id;
  IF query_vector IS NULL THEN RETURN; END IF;
  RETURN QUERY
    SELECT f.id, f.name, f.brand, f."foodInfoSource"::text, f."externalId", f."bgeBaseEmbedding"::text,
      1 - (f."bgeBaseEmbedding" <=> query_vector)
    FROM public."FoodItem" f
    WHERE f."bgeBaseEmbedding" IS NOT NULL AND (f."privateToUserId" IS NULL OR f."privateToUserId" = p_user_id)
      AND f."archivedAt" IS NULL AND (f."recipePortions" IS NULL OR recipes)
    ORDER BY f."bgeBaseEmbedding" <=> query_vector
    LIMIT amount_of_results;
END;
$function$;

CREATE OR REPLACE FUNCTION public.search_food_catalogue_nearest(p_embedding_cache_id integer, p_limit integer DEFAULT 12,
  p_user_id uuid DEFAULT NULL)
RETURNS TABLE(id integer, name text, brand text, "knownAs" text[])
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = '' AS $function$
  SELECT f.id, f.name, f.brand, f."knownAs"
  FROM public."FoodItem" f, public."foodEmbeddingCache" c
  WHERE c.id = p_embedding_cache_id AND f."bgeBaseEmbedding" IS NOT NULL
    AND (f."privateToUserId" IS NULL OR f."privateToUserId" = p_user_id)
    AND f."archivedAt" IS NULL AND (f."recipePortions" IS NULL OR public.user_flag_enabled('recipes_in_agent', p_user_id))
  ORDER BY f."bgeBaseEmbedding" OPERATOR(extensions.<=>) c."bgeBaseEmbedding"
  LIMIT least(greatest(p_limit, 1), 30)
$function$;

-- The agent's food creation never reuses (or enriches) an archived version or a recipe: a personal estimate called
-- "Chicken pasta" is not the user's recipe of that name. Otherwise unchanged from 20260927020000_label_variants.
CREATE OR REPLACE FUNCTION public.create_catalogue_food(p_user_id uuid, p_message_id integer, p_food jsonb, p_servings jsonb,
  p_private boolean DEFAULT false, p_variant boolean DEFAULT false)
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
      AND ((f."privateToUserId" IS NULL AND NOT (p_private AND p_variant)) OR f."privateToUserId" = owner)
      AND f."archivedAt" IS NULL AND f."recipePortions" IS NULL
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

-- Saves a user's own food or recipe. The server computes the values (per default serving; for a recipe, per portion
-- from its ingredients) and the embedding; this function decides, under a per-user lock, whether the edit happens in
-- place or as a new version, and writes the food, its servings, nutrients and ingredients in one transaction.
--   p_food: name, brand, defaultServingWeightGram, kcal, proteinG, carbG, totalFatG, fiberG, sugarG, addedSugarG,
--           satFatG, transFatG, isLiquid, defaultServingLiquidMl, recipePortions, cookedWeightGram, bgeBaseEmbedding,
--           description
--   p_servings: [{name, grams, amount}]   p_nutrients: [{name, unit, amount}] (per default serving)
--   p_ingredients: NULL for a food; for a recipe [{foodItemId, grams, servingId, servingAmount, loggedUnit}]
-- Errors: 22023 invalid, P0002 food unavailable, 23505 name_taken, 42501 ingredient unavailable.
CREATE OR REPLACE FUNCTION public.save_user_food(p_user_id uuid, p_food_id integer, p_food jsonb, p_servings jsonb,
  p_nutrients jsonb, p_ingredients jsonb)
RETURNS TABLE(food_id integer, created boolean, versioned boolean, previous_id integer)
LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $function$
DECLARE
  is_recipe boolean := p_ingredients IS NOT NULL AND jsonb_typeof(p_ingredients) <> 'null';
  identity text := public.food_identity_key(p_food->>'name', p_food->>'brand');
  old_row public."FoodItem"%ROWTYPE;
  in_use boolean := false;
  target integer;
  bad integer;
BEGIN
  IF p_user_id IS NULL OR length(public.food_identity_part(p_food->>'name')) < 2 OR
     length(coalesce(p_food->>'name', '')) > 120 OR length(coalesce(p_food->>'brand', '')) > 120 OR
     coalesce((p_food->>'defaultServingWeightGram')::float8, 0) <= 0 OR (p_food->>'defaultServingWeightGram')::float8 > 20000 OR
     coalesce((p_food->>'kcal')::float8, -1) < 0 OR
     jsonb_typeof(p_servings) IS DISTINCT FROM 'array' OR jsonb_array_length(p_servings) > 10 OR
     jsonb_typeof(p_nutrients) IS DISTINCT FROM 'array' OR jsonb_array_length(p_nutrients) > 60 OR
     (is_recipe AND (jsonb_typeof(p_ingredients) <> 'array' OR jsonb_array_length(p_ingredients) NOT BETWEEN 1 AND 50 OR
       coalesce((p_food->>'recipePortions')::numeric, 0) <= 0 OR (p_food->>'recipePortions')::numeric > 1000)) OR
     (NOT is_recipe AND (p_food->>'recipePortions' IS NOT NULL OR p_food->>'cookedWeightGram' IS NOT NULL))
  THEN RAISE EXCEPTION 'Invalid food' USING ERRCODE = '22023'; END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('user_food:' || p_user_id::text, 0));
  IF p_food_id IS NOT NULL THEN
    SELECT * INTO old_row FROM public."FoodItem" f
      WHERE f.id = p_food_id AND f."privateToUserId" = p_user_id AND f."archivedAt" IS NULL FOR UPDATE;
    IF old_row.id IS NULL OR (old_row."recipePortions" IS NOT NULL) <> is_recipe
    THEN RAISE EXCEPTION 'food_unavailable' USING ERRCODE = 'P0002'; END IF;
  END IF;

  -- One name per thing the user owns, across foods and recipes, so "Chili" in the Foods tab is never ambiguous. Only
  -- checked when the name is new: the agent may since have made a private estimate with a recipe's name (recipes have
  -- their own index), and that must not stop the user editing their recipe.
  IF (p_food_id IS NULL OR public.food_identity_key(old_row.name, old_row.brand) <> identity) AND
     EXISTS (SELECT 1 FROM public."FoodItem" f WHERE f."privateToUserId" = p_user_id AND f."archivedAt" IS NULL
      AND public.food_identity_key(f.name, f.brand) = identity AND f.id IS DISTINCT FROM p_food_id)
  THEN RAISE EXCEPTION 'name_taken' USING ERRCODE = '23505'; END IF;

  IF is_recipe THEN
    -- Ingredients: foods this user can see, never a recipe (no nesting in v1), never the recipe itself, and a serving
    -- only of that food.
    SELECT count(*) INTO bad FROM jsonb_array_elements(p_ingredients) i
      LEFT JOIN public."FoodItem" f ON f.id = (i->>'foodItemId')::integer
      LEFT JOIN public."Serving" s ON s.id = (i->>'servingId')::integer
      WHERE f.id IS NULL OR f."recipePortions" IS NOT NULL OR f.id IS NOT DISTINCT FROM p_food_id
        OR (f."privateToUserId" IS NOT NULL AND f."privateToUserId" <> p_user_id)
        OR coalesce((i->>'grams')::float8, 0) <= 0 OR (i->>'grams')::float8 > 20000
        OR (i->>'servingId' IS NOT NULL AND (s.id IS NULL OR s."foodItemId" <> f.id));
    IF bad > 0 THEN RAISE EXCEPTION 'ingredient_unavailable' USING ERRCODE = '42501'; END IF;
  END IF;

  IF p_food_id IS NOT NULL THEN
    in_use := EXISTS (SELECT 1 FROM public."LoggedFoodItem" l WHERE l."foodItemId" = p_food_id AND l."deletedAt" IS NULL)
      OR EXISTS (SELECT 1 FROM public."RecipeIngredient" r WHERE r."foodItemId" = p_food_id);
  END IF;

  IF p_food_id IS NOT NULL AND NOT in_use THEN
    target := p_food_id;
    UPDATE public."FoodItem" SET name = pg_catalog.btrim(p_food->>'name'), brand = nullif(pg_catalog.btrim(p_food->>'brand'), ''),
      "defaultServingWeightGram" = (p_food->>'defaultServingWeightGram')::float8,
      "defaultServingLiquidMl" = (p_food->>'defaultServingLiquidMl')::float8,
      "kcalPerServing" = (p_food->>'kcal')::float8, "proteinPerServing" = coalesce((p_food->>'proteinG')::float8, 0),
      "carbPerServing" = coalesce((p_food->>'carbG')::float8, 0), "totalFatPerServing" = coalesce((p_food->>'totalFatG')::float8, 0),
      "fiberPerServing" = (p_food->>'fiberG')::float8, "sugarPerServing" = (p_food->>'sugarG')::float8,
      "addedSugarPerServing" = (p_food->>'addedSugarG')::float8, "satFatPerServing" = (p_food->>'satFatG')::float8,
      "transFatPerServing" = (p_food->>'transFatG')::float8, "isLiquid" = coalesce((p_food->>'isLiquid')::boolean, false),
      "recipePortions" = (p_food->>'recipePortions')::numeric, "cookedWeightGram" = (p_food->>'cookedWeightGram')::float8,
      "bgeBaseEmbedding" = coalesce((p_food->>'bgeBaseEmbedding')::extensions.vector, "bgeBaseEmbedding"),
      description = coalesce(p_food->>'description', description), "weightUnknown" = false, "lastUpdated" = now()
    WHERE id = target;
    -- A favourite keeps its food; a serving that goes away leaves it on the default serving.
    UPDATE public."UserFavoriteFoodItem" SET "servingId" = NULL
      WHERE "servingId" IN (SELECT id FROM public."Serving" WHERE "foodItemId" = target);
    DELETE FROM public."Serving" WHERE "foodItemId" = target;
    DELETE FROM public."Nutrient" WHERE "foodItemId" = target;
    DELETE FROM public."RecipeIngredient" WHERE "recipeFoodItemId" = target;
  ELSE
    -- A new food, or a new version of one that past logs (or recipes) point at. The old version is archived first so
    -- the new one can keep its name.
    IF p_food_id IS NOT NULL THEN
      UPDATE public."FoodItem" SET "archivedAt" = now(), "lastUpdated" = now() WHERE id = p_food_id;
    END IF;
    INSERT INTO public."FoodItem" (name, brand, "defaultServingWeightGram", "defaultServingLiquidMl", "kcalPerServing",
      "proteinPerServing", "carbPerServing", "totalFatPerServing", "fiberPerServing", "sugarPerServing",
      "addedSugarPerServing", "satFatPerServing", "transFatPerServing", "isLiquid", "userId", "foodInfoSource",
      "bgeBaseEmbedding", description, verified, "privateToUserId", "recipePortions", "cookedWeightGram",
      "previousVersionId", "lastUpdated", gtin, "UPC")
    VALUES (pg_catalog.btrim(p_food->>'name'), nullif(pg_catalog.btrim(p_food->>'brand'), ''),
      (p_food->>'defaultServingWeightGram')::float8, (p_food->>'defaultServingLiquidMl')::float8, (p_food->>'kcal')::float8,
      coalesce((p_food->>'proteinG')::float8, 0), coalesce((p_food->>'carbG')::float8, 0),
      coalesce((p_food->>'totalFatG')::float8, 0), (p_food->>'fiberG')::float8, (p_food->>'sugarG')::float8,
      (p_food->>'addedSugarG')::float8, (p_food->>'satFatG')::float8, (p_food->>'transFatG')::float8,
      coalesce((p_food->>'isLiquid')::boolean, false), p_user_id, 'User',
      coalesce((p_food->>'bgeBaseEmbedding')::extensions.vector, old_row."bgeBaseEmbedding"),
      coalesce(p_food->>'description', old_row.description), false, p_user_id,
      (p_food->>'recipePortions')::numeric, (p_food->>'cookedWeightGram')::float8, p_food_id, now(),
      old_row.gtin, old_row."UPC")  -- a barcode moves to the new version; searches skip archived rows
    RETURNING id INTO target;
    IF p_food_id IS NOT NULL THEN
      -- The new version keeps the icon while its name is the same food; a renamed food gets its own from the queue.
      IF public.food_identity_key(old_row.name, old_row.brand) = identity THEN
        INSERT INTO public."FoodItemImages" ("foodItemId", "foodImageId", similarity)
        SELECT target, i."foodImageId", i.similarity FROM public."FoodItemImages" i WHERE i."foodItemId" = p_food_id;
      END IF;
      UPDATE public."UserFavoriteFoodItem" SET "foodItemId" = target, "servingId" = NULL
        WHERE "foodItemId" = p_food_id AND "userId" = p_user_id;
    END IF;
  END IF;

  INSERT INTO public."Serving" ("foodItemId", "servingName", "servingWeightGram", "defaultServingAmount")
  SELECT target, pg_catalog.btrim(s->>'name'), (s->>'grams')::float8, coalesce(nullif((s->>'amount')::numeric, 0), 1)
    FROM jsonb_array_elements(p_servings) s
    WHERE length(pg_catalog.btrim(coalesce(s->>'name', ''))) > 0 AND (s->>'grams')::float8 > 0;
  INSERT INTO public."Nutrient" ("foodItemId", "nutrientName", "nutrientUnit", "nutrientAmountPerDefaultServing")
  SELECT target, n->>'name', n->>'unit', (n->>'amount')::float8 FROM jsonb_array_elements(p_nutrients) n
    WHERE length(coalesce(n->>'name', '')) > 0 AND (n->>'amount')::float8 >= 0;
  IF is_recipe THEN
    INSERT INTO public."RecipeIngredient" ("recipeFoodItemId", "foodItemId", grams, "servingId", "servingAmount",
      "loggedUnit", position)
    SELECT target, (i->>'foodItemId')::integer, (i->>'grams')::float8, (i->>'servingId')::integer,
      (i->>'servingAmount')::float8, nullif(i->>'loggedUnit', ''), (o - 1)::smallint
      FROM jsonb_array_elements(p_ingredients) WITH ORDINALITY AS e(i, o);
  END IF;

  RETURN QUERY SELECT target, p_food_id IS NULL, p_food_id IS NOT NULL AND in_use, p_food_id;
END;
$function$;
REVOKE ALL ON FUNCTION public.save_user_food(uuid, integer, jsonb, jsonb, jsonb, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.save_user_food(uuid, integer, jsonb, jsonb, jsonb, jsonb) TO service_role;

-- Deleting a user's food archives it: past logs still show it, and nothing new can use it.
CREATE OR REPLACE FUNCTION public.archive_user_food(p_user_id uuid, p_food_id integer) RETURNS boolean
LANGUAGE sql SECURITY INVOKER SET search_path = '' AS $function$
  WITH archived AS (
    UPDATE public."FoodItem" SET "archivedAt" = now(), "lastUpdated" = now()
    WHERE id = p_food_id AND "privateToUserId" = p_user_id AND "archivedAt" IS NULL RETURNING id)
  SELECT EXISTS (SELECT 1 FROM archived)
$function$;
REVOKE ALL ON FUNCTION public.archive_user_food(uuid, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.archive_user_food(uuid, integer) TO service_role;

-- One logged row from a food the server has priced: p_item carries foodItemId, grams, servingId, servingAmount,
-- loggedUnit and nutrition (LoggedFoodItem nutrient columns, e.g. {"kcal":..,"proteinG":..}).
CREATE OR REPLACE FUNCTION public.insert_priced_food_row(p_user_id uuid, p_message_id integer, p_consumed_on timestamp,
  p_revision bigint, p_local_id uuid, p_item jsonb) RETURNS integer
LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $function$
DECLARE n public."LoggedFoodItem"%ROWTYPE := jsonb_populate_record(NULL::public."LoggedFoodItem", p_item->'nutrition');
  inserted integer;
BEGIN
  INSERT INTO public."LoggedFoodItem" ("userId", "messageId", "foodItemId", grams, "servingId", "servingAmount", "loggedUnit",
    status, "consumedOn", local_id, "logicalItemId", "publishedRevision",
    kcal, "proteinG", "carbG", "totalFatG", "satFatG", "transFatG", "unsatFatG", "polyunsatFatG", "monounsatFatG", "fiberG",
    "sugarG", "addedSugarG", "waterMl", "vitaminAMcg", "vitaminCMg", "vitaminDMcg", "vitaminEMg", "vitaminKMcg", "vitaminB1Mg",
    "vitaminB2Mg", "vitaminB3Mg", "vitaminB5Mg", "vitaminB6Mg", "vitaminB7Mcg", "vitaminB9Mcg", "vitaminB12Mcg", "calciumMg",
    "ironMg", "magnesiumMg", "phosphorusMg", "potassiumMg", "sodiumMg", "zincMg", "copperMg", "manganeseMg", "seleniumMcg",
    "iodineMcg", "cholesterolMg", "omega3Mg", "omega6Mg", "caffeineMg", "alcoholG")
  VALUES (p_user_id, p_message_id, (p_item->>'foodItemId')::integer, (p_item->>'grams')::float8,
    (p_item->>'servingId')::integer, (p_item->>'servingAmount')::float8, p_item->>'loggedUnit',
    'Processed', p_consumed_on, p_local_id, gen_random_uuid(), coalesce(p_revision, 0),
    n.kcal, n."proteinG", n."carbG", n."totalFatG", n."satFatG", n."transFatG", n."unsatFatG", n."polyunsatFatG",
    n."monounsatFatG", n."fiberG", n."sugarG", n."addedSugarG", n."waterMl", n."vitaminAMcg", n."vitaminCMg", n."vitaminDMcg",
    n."vitaminEMg", n."vitaminKMcg", n."vitaminB1Mg", n."vitaminB2Mg", n."vitaminB3Mg", n."vitaminB5Mg", n."vitaminB6Mg",
    n."vitaminB7Mcg", n."vitaminB9Mcg", n."vitaminB12Mcg", n."calciumMg", n."ironMg", n."magnesiumMg", n."phosphorusMg",
    n."potassiumMg", n."sodiumMg", n."zincMg", n."copperMg", n."manganeseMg", n."seleniumMcg", n."iodineMcg",
    n."cholesterolMg", n."omega3Mg", n."omega6Mg", n."caffeineMg", n."alcoholG")
  RETURNING id INTO inserted;
  RETURN inserted;
END;
$function$;
REVOKE ALL ON FUNCTION public.insert_priced_food_row(uuid, integer, timestamp, bigint, uuid, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.insert_priced_food_row(uuid, integer, timestamp, bigint, uuid, jsonb) TO service_role;

-- Logs one food (a recipe portion, a custom food) as a new resolved meal, like the app's "Log again". p_local_id makes
-- a retried request return the meal it already created.
CREATE OR REPLACE FUNCTION public.log_food_as_meal(p_user_id uuid, p_local_id uuid, p_consumed_on timestamp,
  p_content text, p_item jsonb)
RETURNS TABLE(message_id integer, logged_food_item_id integer, created boolean)
LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $function$
DECLARE meal integer;
  row_id integer;
BEGIN
  IF p_user_id IS NULL OR p_local_id IS NULL OR p_consumed_on IS NULL OR coalesce((p_item->>'grams')::float8, 0) <= 0
  THEN RAISE EXCEPTION 'Invalid meal' USING ERRCODE = '22023'; END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('meal_local:' || p_local_id::text, 0));
  SELECT m.id INTO meal FROM public."Message" m WHERE m.local_id = p_local_id::text AND m."userId" = p_user_id;
  IF meal IS NOT NULL THEN
    RETURN QUERY SELECT meal, (SELECT l.id FROM public."LoggedFoodItem" l WHERE l."messageId" = meal ORDER BY l.id LIMIT 1), false;
    RETURN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public."FoodItem" f WHERE f.id = (p_item->>'foodItemId')::integer AND f."archivedAt" IS NULL
      AND (f."privateToUserId" IS NULL OR f."privateToUserId" = p_user_id))
  THEN RAISE EXCEPTION 'food_unavailable' USING ERRCODE = 'P0002'; END IF;
  INSERT INTO public."Message" (content, role, "messageType", status, "userId", "consumedOn", "createdAt", "resolvedAt",
    "itemsToProcess", "itemsProcessed", hasimages, local_id)
  VALUES (left(coalesce(p_content, ''), 8000), 'User', 'FOOD_LOG_REQUEST', 'RESOLVED', p_user_id, p_consumed_on,
    (now() AT TIME ZONE 'utc'), (now() AT TIME ZONE 'utc'), 1, 1, false, p_local_id::text)
  RETURNING id INTO meal;
  row_id := public.insert_priced_food_row(p_user_id, meal, p_consumed_on, 0, p_local_id, p_item);
  RETURN QUERY SELECT meal, row_id, true;
END;
$function$;
REVOKE ALL ON FUNCTION public.log_food_as_meal(uuid, uuid, timestamp, text, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.log_food_as_meal(uuid, uuid, timestamp, text, jsonb) TO service_role;

-- Replaces a meal's foods with one food, e.g. after saving the meal as a recipe: "change this meal to 1 portion".
-- p_expected_item_ids are the meal's current rows as the user saw them; anything else means the meal changed.
-- Meals the operation protocol owns, or that an operation is changing, are refused (the guard triggers agree).
CREATE OR REPLACE FUNCTION public.replace_meal_with_food(p_user_id uuid, p_message_id integer,
  p_expected_item_ids integer[], p_item jsonb) RETURNS integer
LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $function$
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
      AND (f."privateToUserId" IS NULL OR f."privateToUserId" = p_user_id))
  THEN RAISE EXCEPTION 'food_unavailable' USING ERRCODE = 'P0002'; END IF;
  SELECT array_agg(l.id ORDER BY l.id), min(l."consumedOn") INTO current_ids, consumed FROM public."LoggedFoodItem" l
    WHERE l."messageId" = p_message_id AND l."deletedAt" IS NULL;
  IF current_ids IS DISTINCT FROM (SELECT array_agg(x ORDER BY x) FROM unnest(p_expected_item_ids) x)
  THEN RAISE EXCEPTION 'meal_changed' USING ERRCODE = '40001'; END IF;
  UPDATE public."LoggedFoodItem" SET "deletedAt" = now() WHERE id = ANY (current_ids);
  UPDATE public."Message" SET "itemsToProcess" = 1, "itemsProcessed" = 1 WHERE id = p_message_id;
  -- The row joins the meal's published revision, so the app's revision check keeps it.
  RETURN public.insert_priced_food_row(p_user_id, p_message_id, coalesce(meal."consumedOn", consumed),
    meal."publishedRevision", NULL, p_item);
END;
$function$;
REVOKE ALL ON FUNCTION public.replace_meal_with_food(uuid, integer, integer[], jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.replace_meal_with_food(uuid, integer, integer[], jsonb) TO service_role;

-- Catalogue merges also move recipe ingredients and version links, and never merge a recipe.
-- Otherwise unchanged from 20260926070000_audit_a4_a5_merge_duplicates.
CREATE OR REPLACE FUNCTION public.merge_catalogue_food(p_keep integer, p_drop integer, p_audit text)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $function$
DECLARE
  keep_row public."FoodItem"%ROWTYPE;
  drop_row public."FoodItem"%ROWTYPE;
  serving record;
  twin integer;
  moved integer := 0;
  joined integer := 0;
BEGIN
  IF p_keep = p_drop THEN RAISE EXCEPTION 'Cannot merge a food into itself' USING ERRCODE = '22023'; END IF;
  SELECT * INTO keep_row FROM public."FoodItem" WHERE id = p_keep FOR UPDATE;
  SELECT * INTO drop_row FROM public."FoodItem" WHERE id = p_drop FOR UPDATE;
  IF keep_row.id IS NULL OR drop_row.id IS NULL THEN RAISE EXCEPTION 'Catalogue food unavailable' USING ERRCODE = '42704'; END IF;
  IF keep_row."recipePortions" IS NOT NULL OR drop_row."recipePortions" IS NOT NULL
  THEN RAISE EXCEPTION 'Recipes are never merged' USING ERRCODE = '22023'; END IF;

  INSERT INTO public."CatalogueAuditBackup"(audit, "tableName", "rowId", before)
  VALUES (p_audit, 'FoodItem', p_drop, (to_jsonb(drop_row) - 'bgeBaseEmbedding') || jsonb_build_object('mergedInto', p_keep));

  FOR serving IN SELECT * FROM public."Serving" WHERE "foodItemId" = p_drop LOOP
    INSERT INTO public."CatalogueAuditBackup"(audit, "tableName", "rowId", before)
    VALUES (p_audit, 'Serving', serving.id, to_jsonb(serving) || jsonb_build_object('mergedInto', p_keep));
    twin := NULL;
    SELECT k.id INTO twin FROM public."Serving" k
    WHERE k."foodItemId" = p_keep
      AND public.food_identity_part(k."servingName") = public.food_identity_part(serving."servingName")
      AND ((k."servingWeightGram" IS NULL AND serving."servingWeightGram" IS NULL) OR
           abs(k."servingWeightGram" / nullif(k."defaultServingAmount", 0) - serving."servingWeightGram" / nullif(serving."defaultServingAmount", 0))
             <= 0.02 * greatest(k."servingWeightGram" / nullif(k."defaultServingAmount", 0), serving."servingWeightGram" / nullif(serving."defaultServingAmount", 0)))
    ORDER BY k.id LIMIT 1;
    IF twin IS NOT NULL THEN
      UPDATE public."LoggedFoodItem" SET "servingId" = twin WHERE "servingId" = serving.id;
      UPDATE public."UserFavoriteFoodItem" SET "servingId" = twin WHERE "servingId" = serving.id;
      UPDATE public."RecipeIngredient" SET "servingId" = twin WHERE "servingId" = serving.id;
      DELETE FROM public."Serving" WHERE id = serving.id;
      joined := joined + 1;
    ELSE
      UPDATE public."Serving" SET "foodItemId" = p_keep WHERE id = serving.id;
      moved := moved + 1;
    END IF;
  END LOOP;

  UPDATE public."LoggedFoodItem" SET "foodItemId" = p_keep WHERE "foodItemId" = p_drop;
  UPDATE public."UserFavoriteFoodItem" SET "foodItemId" = p_keep WHERE "foodItemId" = p_drop;
  UPDATE public."RecipeIngredient" SET "foodItemId" = p_keep WHERE "foodItemId" = p_drop;
  UPDATE public."FoodItem" SET "previousVersionId" = p_keep WHERE "previousVersionId" = p_drop;
  UPDATE public."userSubmittedBug" SET food_item_id = p_keep WHERE food_item_id = p_drop;
  UPDATE public."FoodItemConflict" SET "foodItemId" = p_keep WHERE "foodItemId" = p_drop;
  UPDATE public."IconQueue" SET requested_food_item_id = p_keep WHERE requested_food_item_id = p_drop;

  INSERT INTO public."CatalogueAuditBackup"(audit, "tableName", "rowId", before)
  SELECT p_audit, 'Nutrient', n.id, to_jsonb(n) FROM public."Nutrient" n WHERE n."foodItemId" = p_drop;
  DELETE FROM public."Nutrient" WHERE "foodItemId" = p_drop;

  -- The kept food keeps its icon; it takes the dropped food's only when it has none.
  IF NOT EXISTS (SELECT 1 FROM public."FoodItemImages" WHERE "foodItemId" = p_keep) THEN
    UPDATE public."FoodItemImages" SET "foodItemId" = p_keep WHERE "foodItemId" = p_drop;
  END IF;

  IF keep_row.gtin IS NULL AND drop_row.gtin IS NOT NULL THEN
    UPDATE public."FoodItem" SET gtin = drop_row.gtin, "UPC" = coalesce("UPC", drop_row."UPC") WHERE id = p_keep;
  END IF;
  IF public.food_identity_part(drop_row.name) <> public.food_identity_part(keep_row.name)
     AND NOT EXISTS (SELECT 1 FROM pg_catalog.unnest(coalesce(keep_row."knownAs", ARRAY[]::text[])) a
                     WHERE public.food_identity_part(a) = public.food_identity_part(drop_row.name))
     AND coalesce(array_length(keep_row."knownAs", 1), 0) < 10 THEN
    UPDATE public."FoodItem" SET "knownAs" = coalesce("knownAs", ARRAY[]::text[]) || drop_row.name WHERE id = p_keep;
  END IF;

  DELETE FROM public."FoodItem" WHERE id = p_drop;
  RETURN jsonb_build_object('keep', p_keep, 'drop', p_drop, 'servingsMoved', moved, 'servingsJoined', joined);
END;
$function$;
REVOKE ALL ON FUNCTION public.merge_catalogue_food(integer, integer, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.merge_catalogue_food(integer, integer, text) TO service_role;

NOTIFY pgrst, 'reload schema';
