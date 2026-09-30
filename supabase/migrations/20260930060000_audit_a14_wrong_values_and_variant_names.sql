-- A14: the most-logged same-name foods with different nutrition (A12's leftovers), checked against their own
-- macros (kcal vs 4p + 4c + 9f) and USDA values.
--
-- Wrong values:
-- - Thomas' English Muffin (224) said 175 kcal/100 g while its macros give ~226; the USDA branded entry (10587,
--   barcoded) says 246. 224 merges into 10587 ("English Muffin" becomes an alias).
-- - Premier Protein Chocolate Shake (832) had one serving, "shake" = 10 g, which made its per-100 g values wrong. Its
--   logs move to the barcoded entry's "1 Shake" (330 g) and 832 merges into 5489; the broken serving is dropped.
-- - Mission Flour Tortilla (844, a 36 g taco size) said 389 kcal/100 g while its macros give ~295: its calories take
--   the burrito-size tortilla's density (296) and it stays separate (another size).
-- - "Chicken" (11845) carries chicken breast values: it merges into chicken breast. The plain word "chicken" stays with
--   "chicken" (42, meat and skin), the food people log it as.
--
-- Variants under one vague name get names that say which variant they are. The most-logged one keeps the vague name
-- as an alias, so a plain search still lands on it; the other only matches its own words.
-- Names and aliases are backed up (CatalogueAuditBackup 'A14_variant_names'); merged logs as in A12.
DO $a14$
DECLARE r record;
BEGIN
  INSERT INTO public."CatalogueAuditBackup"(audit, "tableName", "rowId", before)
    SELECT 'A14_variant_names', 'FoodItem', f.id, pg_catalog.to_jsonb(f) - 'bgeBaseEmbedding' - 'adaEmbedding'
    FROM public."FoodItem" f WHERE f.id IN (812, 7766, 42, 178, 10530, 111, 11378, 356, 12611, 554, 15220, 1137, 12143, 844);
  INSERT INTO public."CatalogueAuditBackup"(audit, "tableName", "rowId", before)
    SELECT 'A14_fix_merge', 'LoggedFoodItem', l.id,
      pg_catalog.jsonb_build_object('foodItemId', l."foodItemId", 'servingId', l."servingId")
    FROM public."LoggedFoodItem" l WHERE l."foodItemId" IN (224, 832, 11845);

  -- Repointing logs is catalogue maintenance: each log keeps its own nutrition.
  PERFORM pg_catalog.set_config('app.meal_operation_write', 'true', true);
  UPDATE public."LoggedFoodItem" SET "servingId" = 12922 WHERE "servingId" = 3013;
  UPDATE public."UserFavoriteFoodItem" SET "servingId" = 12922 WHERE "servingId" = 3013;
  PERFORM public.merge_catalogue_food(5489, 832, 'A14_fix_merge');
  DELETE FROM public."Serving" s WHERE s.id = 3013
    AND NOT EXISTS (SELECT 1 FROM public."LoggedFoodItem" WHERE "servingId" = 3013)
    AND NOT EXISTS (SELECT 1 FROM public."UserFavoriteFoodItem" WHERE "servingId" = 3013);
  PERFORM public.merge_catalogue_food(10587, 224, 'A14_fix_merge');
  PERFORM public.merge_catalogue_food(812, 11845, 'A14_fix_merge');

  UPDATE public."FoodItem" SET "kcalPerServing" = round(("defaultServingWeightGram" * 2.96)::numeric, 1) WHERE id = 844;

  FOR r IN SELECT * FROM (VALUES
      (812, 'Chicken breast, skinless, cooked', 'chicken breast'),
      (7766, 'Chicken breast with skin, roasted', NULL),
      (42, 'Chicken, meat and skin, cooked', 'chicken'),
      (178, 'Greek yogurt, plain, nonfat', 'greek yogurt'),
      (10530, 'Greek yogurt, plain, whole milk', NULL),
      (111, 'Yogurt, plain, low fat', 'yogurt'),
      (11378, 'Yogurt, fruit, low fat', NULL),
      (356, 'Tomato sauce, canned', 'tomato sauce'),
      (12611, 'Pasta sauce, tomato', NULL),
      (554, 'Tuna, cooked', 'tuna'),
      (15220, 'Tuna, raw', NULL),
      (1137, 'Granola, homemade', 'granola'),
      (12143, 'Granola, low fat', NULL)
    ) AS v(id, name, alias) LOOP
    -- The vague name is an alias only on the everyday variant; a plain "chicken" alias left by a merge goes.
    UPDATE public."FoodItem" f SET name = r.name,
        "knownAs" = coalesce((SELECT pg_catalog.array_agg(DISTINCT a) FROM pg_catalog.unnest(
            coalesce(f."knownAs", ARRAY[]::text[]) || coalesce(ARRAY[r.alias], ARRAY[]::text[])) a
          WHERE a IS NOT NULL
            AND public.food_identity_part(a) <> public.food_identity_part(r.name)
            AND (r.alias IS NOT NULL AND public.food_identity_part(a) = public.food_identity_part(r.alias)
                 OR public.food_identity_part(a) NOT IN ('chicken', 'chicken breast', 'greek yogurt', 'yogurt',
                   'tomato sauce', 'tuna', 'granola'))), ARRAY[]::text[])
      WHERE f.id = r.id;
  END LOOP;
END
$a14$;
NOTIFY pgrst, 'reload schema';
