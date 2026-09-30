-- A15: the most-logged same-name foods with different nutrition (pairs with 3 or more logs), decided food by food
-- (by Claude, reviewed with the user; not Flash). The calories-vs-macros arithmetic alone never marks an entry wrong:
-- fibre, sugar alcohols and label rounding make it unreliable. An entry is wrong only on strong evidence (0 kcal potato
-- chips, per-serving values stored as per 100 g, cereal at 150 kcal/100 g, 32 g protein in rice cakes, a shake with a
-- 10 g serving); ambiguous pairs are left alone.
--
-- 1. Merges: the same product entered twice (generics up to ~25% apart keep the most-logged entry's values), or a
--    wrong entry into its correct twin. Logs are backed up as in A12.
-- 2. "Greek yogurt, plain, whole milk" (10530) had unstrained values (117 kcal, 4.1 g protein): it takes strained
--    whole-milk Greek yogurt's values from the catalogue entry that has them (1540: 97 kcal, 9 g protein), which then
--    merges into it.
-- 3. Renames where the variant is established: mushrooms 28 (boiled) vs 22 (raw), lentils 116 (cooked) vs 353 (dry),
--    steel cut oats 379 (dry), whipped cream 257 (aerosol topping), grilled chicken breast 195 (with skin) vs 148
--    (skinless; people mean skinless, so the plain words go there), Lean Body's 414 kcal "shake" (the powder), and
--    "Barbecue Sauce" at 75 kcal with 3.9 g sugar (a low-sugar sauce, like the sugar-free ones at 31-81 kcal; the plain
--    words go to regular barbecue sauce, 172). The plain words stay as an alias on the everyday variant only.
-- 4. A wrong entry that can't merge because both carry a barcode (a barcode must keep finding its product) is fixed in
--    place. Most of these were per-serving values stored against the wrong weight, not wrong calories: the creamer
--    (30 kcal is a 15 g tablespoon, not 100 g), Froot Loops (150 kcal is a 39 g serving), Ruffles sour cream and onion
--    (150 kcal is 28 g) and Slim Jim (40 kcal is an 8 g stick) get their serving weight. Ruffles and Welch's at 0 kcal
--    take their twin's values per 100 g, and the Core Power bottle at 241 kcal takes the bottle's 170 kcal values.
-- 5. Past logs of clearly wrong entries (the wrong foods here, 10530 and Thomas' muffin merged in A14) take their
--    nutrition from the food they now point at. Not recomputed where the logged calories were already right: the Premier
--    shake from A14 (its 245 g serving made each shake ~160 kcal), the creamer and Froot Loops (logged per serving at the
--    serving's calories). Old values are backed up (CatalogueAuditBackup 'A15_recompute').
DO $a15$
DECLARE pair record; r record; merged integer := 0; skipped integer := 0; recomputed integer := 0;
BEGIN
  PERFORM pg_catalog.set_config('app.meal_operation_write', 'true', true);
  -- Logs to recompute, captured before the merges repoint them.
  CREATE TEMP TABLE a15_recompute ON COMMIT DROP AS
    SELECT l.id FROM public."LoggedFoodItem" l WHERE l."foodItemId" IN (124,2075,2755,3617,6879,7088,8844,10530,10811,10987)
    UNION SELECT b."rowId" FROM public."CatalogueAuditBackup" b
      WHERE b.audit = 'A14_fix_merge' AND b."tableName" = 'LoggedFoodItem' AND (b.before ->> 'foodItemId')::integer = 224;

  -- 10530 takes strained whole-milk Greek yogurt's values (1540's per 100 g, at 10530's own serving weight).
  INSERT INTO public."CatalogueAuditBackup"(audit, "tableName", "rowId", before)
    SELECT 'A15_values', 'FoodItem', f.id, pg_catalog.to_jsonb(f) - 'bgeBaseEmbedding' - 'adaEmbedding' FROM public."FoodItem" f WHERE f.id = 10530;
  UPDATE public."FoodItem" t SET
      "kcalPerServing" = s."kcalPerServing" / s."defaultServingWeightGram" * t."defaultServingWeightGram",
      "proteinPerServing" = s."proteinPerServing" / s."defaultServingWeightGram" * t."defaultServingWeightGram",
      "carbPerServing" = s."carbPerServing" / s."defaultServingWeightGram" * t."defaultServingWeightGram",
      "totalFatPerServing" = s."totalFatPerServing" / s."defaultServingWeightGram" * t."defaultServingWeightGram",
      "satFatPerServing" = s."satFatPerServing" / s."defaultServingWeightGram" * t."defaultServingWeightGram",
      "transFatPerServing" = s."transFatPerServing" / s."defaultServingWeightGram" * t."defaultServingWeightGram",
      "fiberPerServing" = s."fiberPerServing" / s."defaultServingWeightGram" * t."defaultServingWeightGram",
      "sugarPerServing" = s."sugarPerServing" / s."defaultServingWeightGram" * t."defaultServingWeightGram",
      "addedSugarPerServing" = s."addedSugarPerServing" / s."defaultServingWeightGram" * t."defaultServingWeightGram",
      "lastUpdated" = now()
    FROM public."FoodItem" s WHERE t.id = 10530 AND s.id = 1540 AND s."defaultServingWeightGram" > 0;

  FOR pair IN SELECT * FROM (VALUES
    (397, 1181, 'mixed salad = mixed greens (same values)'),
    (397, 1089, 'Mixed Salad Greens = mixed greens'),
    (812, 766, 'cooked chicken breast = skinless breast'),
    (42, 431, 'cooked chicken = meat and skin'),
    (812, 1159, 'roasted chicken breast = skinless breast'),
    (42, 303, 'roasted chicken = meat and skin'),
    (178, 549, 'Fat Free Greek Yogurt = plain nonfat'),
    (178, 1986, 'plain greek yogurt has plain nonfat values'),
    (178, 124, 'nonfat greek yogurt at 82 kcal with 12 g carbs: wrong'),
    (10530, 1540, 'plain whole milk greek yogurt = 10530 corrected'),
    (9506, 2075, 'Quaker chocolate rice cakes with 32 g protein: wrong; Quaker''s label entry kept'),
    (1278, 14018, 'Shrimp = shrimp'),
    (1278, 828, 'cooked shrimp = shrimp (same values)'),
    (14103, 15219, 'Mushrooms (22) = white mushrooms, raw'),
    (14103, 2805, 'Mushrooms, Raw = white mushrooms, raw'),
    (1489, 12301, 'Sausage (GPT4 estimate) = sausage'),
    (1235, 3352, 'Ham = ham'),
    (1335, 11648, 'Protein Bar (GPT4 estimate) = protein bar'),
    (2467, 2468, 'iceberg lettuce twice'),
    (215, 335, 'Oikos Triple Zero blended twice'),
    (4247, 12428, 'Pork Chop = pork chop'),
    (2735, 8352, 'Porridge with dry-oat values = porridge'),
    (1798, 2988, 'Biryani With Chicken = chicken biryani'),
    (14307, 13122, 'Evergood chicken chorizo twice'),
    (715, 10453, 'Cappuccino = cappuccino'),
    (9076, 12219, 'Core Power chocolate twice (same values)'),
    (1003, 5549, 'Core Power chocolate with Elite values = Elite'),
    (1478, 3856, 'Quesadilla, Chicken = chicken quesadilla'),
    (1243, 1525, 'milk tea = tea with milk'),
    (1724, 11588, 'Cinnamon (GPT4, 317) = Cinnamon (261; USDA ~247)'),
    (760, 14302, 'Soy Milk = soy milk'),
    (659, 5820, 'Quinoa (Cooked) = cooked quinoa'),
    (3080, 5198, 'Meat = meat'),
    (3080, 11950, 'Meat (GPT4) = meat'),
    (238, 7207, 'Sushi Roll Tuna = tuna sushi roll'),
    (336, 1087, 'chocolate brownie = Brownie'),
    (2283, 9010, 'dal = Dal'),
    (134, 5607, 'Chicken Shawarma with 6.4 g protein = chicken shawarma'),
    (239, 10714, 'Sushi Roll, Salmon = salmon sushi roll'),
    (7818, 8534, 'Oikos vanilla (GPT4) = Triple Zero vanilla'),
    (7917, 14922, 'Chicken Caesar Wrap twice'),
    (10833, 689, 'Chobani plain greek = Chobani non-fat plain'),
    (2106, 13200, 'Egg McMuffin twice'),
    (11922, 331, 'a2 2% milk twice'),
    (14523, 14493, 'Dunkin caramel swirl iced coffee twice'),
    (1398, 4177, 'Coffee, Iced Latte = iced latte'),
    (457, 1263, 'Mountain Dew at 31 = mountain dew (49 is right)'),
    (1287, 1081, 'Mini Babybel = babybel'),
    (7981, 14443, 'shrimp fried rice twice'),
    (10985, 10987, 'Minute Maid apple juice at 67 (100% juice is ~46)'),
    (2151, 1353, 'Energy Drink = energy drink'),
    (3618, 3617, 'Great Value light greek: 100 kcal with 0 g carbs'),
    (5916, 8568, 'Big Y mixed vegetables twice'),
    (812, 4118, 'boneless skinless chicken breast = skinless breast'),
    (812, 761, 'baked chicken breast = skinless breast'),
    (42, 2441, 'baked chicken = meat and skin'),
    (7089, 7088, 'Ruffles at 0 kcal'),
    (3769, 3770, '90/10 ground beef twice'),
    (4142, 1307, 'Monster twice'),
    (1212, 742, 'Sweet Cinnamon Bun = cinnamon bun'),
    (3469, 3470, 'Quest chocolate peanut butter crispy twice'),
    (3806, 3807, 'Fage Total 2% twice'),
    (4917, 6338, 'Roast Beef (GPT4) = roast beef'),
    (1742, 3218, 'French Vanilla creamer at 30 (per-serving values as per 100)'),
    (8848, 8844, 'Slim Jim at 125 (~480)'),
    (8848, 8845, 'Slim Jim twice'),
    (7665, 10572, 'Lentil Curry = lentil curry'),
    (903, 1996, '10 McNuggets twice'),
    (6688, 8275, 'Kraft mac and cheese dinner twice'),
    (13562, 2755, 'Core Power vanilla at 71 kcal (170 per 414 ml)'),
    (13406, 8937, 'Oberto beef jerky twice'),
    (190, 12771, 'beef noodle soup twice'),
    (12611, 1760, 'tomato pasta sauce = Pasta sauce, tomato'),
    (8233, 8232, 'Froot Loops at 150 (dry cereal ~385)'),
    (4594, 8453, 'strawberry smoothie twice'),
    (9348, 9352, 'StarKist chunk light in water twice'),
    (6878, 6879, 'Welch''s fruit snacks at 0 kcal'),
    (1575, 3810, 'Kirkland organic 1% milk twice'),
    (10075, 10811, 'Ruffles sour cream and onion at 150'),
    (7146, 9974, 'Fanta pineapple twice')
  ) AS p(keep_id, drop_id, why) LOOP
    IF NOT EXISTS (SELECT 1 FROM public."FoodItem" WHERE id = pair.keep_id)
       OR NOT EXISTS (SELECT 1 FROM public."FoodItem" WHERE id = pair.drop_id)
       OR EXISTS (SELECT 1 FROM public."FoodItem" k, public."FoodItem" d WHERE k.id = pair.keep_id AND d.id = pair.drop_id
                  AND k.gtin IS NOT NULL AND d.gtin IS NOT NULL AND k.gtin <> d.gtin)
       OR EXISTS (SELECT 1 FROM public."LoggedFoodItem" l JOIN public."Message" m ON m.id = l."messageId"
                  WHERE l."foodItemId" = pair.drop_id AND m."activeOperationId" IS NOT NULL)
    THEN skipped := skipped + 1; RAISE NOTICE 'A15 skipped % -> %', pair.drop_id, pair.keep_id; CONTINUE; END IF;
    INSERT INTO public."CatalogueAuditBackup"(audit, "tableName", "rowId", before)
      SELECT 'A15_merge', 'LoggedFoodItem', l.id,
        pg_catalog.jsonb_build_object('foodItemId', l."foodItemId", 'servingId', l."servingId", 'mergedInto', pair.keep_id, 'why', pair.why)
      FROM public."LoggedFoodItem" l WHERE l."foodItemId" = pair.drop_id;
    PERFORM public.merge_catalogue_food(pair.keep_id, pair.drop_id, 'A15_merge');
    merged := merged + 1;
  END LOOP;

  -- Wrong entries kept for their barcodes are fixed in place (backed up first).
  INSERT INTO public."CatalogueAuditBackup"(audit, "tableName", "rowId", before)
    SELECT 'A15_values', 'FoodItem', f.id, pg_catalog.to_jsonb(f) - 'bgeBaseEmbedding' - 'adaEmbedding'
    FROM public."FoodItem" f WHERE f.id IN (3218, 8232, 10811, 8844, 7088, 6879, 2755);
  UPDATE public."FoodItem" SET "defaultServingWeightGram" = 15, "lastUpdated" = now() WHERE id = 3218 AND "defaultServingWeightGram" = 100;
  UPDATE public."FoodItem" SET "defaultServingWeightGram" = 39, "lastUpdated" = now() WHERE id = 8232 AND "defaultServingWeightGram" = 100;
  UPDATE public."FoodItem" SET "defaultServingWeightGram" = 28, "lastUpdated" = now() WHERE id = 10811 AND "defaultServingWeightGram" = 100;
  UPDATE public."FoodItem" SET "defaultServingWeightGram" = 8, "lastUpdated" = now() WHERE id = 8844 AND "defaultServingWeightGram" = 32;
  -- Ruffles and Welch's at 0 kcal: their twin's values per 100 g, at their own serving weight. Core Power's 340 g bottle:
  -- the bottle's values (170 kcal, 26 g protein) from 13562's bottle.
  FOR pair IN SELECT * FROM (VALUES (7089, 7088, false), (6878, 6879, false), (13562, 2755, true)) AS p(keep_id, drop_id, per_serving) LOOP
    UPDATE public."FoodItem" t SET
        "kcalPerServing" = s."kcalPerServing" * CASE WHEN pair.per_serving THEN 1 ELSE t."defaultServingWeightGram" / s."defaultServingWeightGram" END,
        "proteinPerServing" = s."proteinPerServing" * CASE WHEN pair.per_serving THEN 1 ELSE t."defaultServingWeightGram" / s."defaultServingWeightGram" END,
        "carbPerServing" = s."carbPerServing" * CASE WHEN pair.per_serving THEN 1 ELSE t."defaultServingWeightGram" / s."defaultServingWeightGram" END,
        "totalFatPerServing" = s."totalFatPerServing" * CASE WHEN pair.per_serving THEN 1 ELSE t."defaultServingWeightGram" / s."defaultServingWeightGram" END,
        "satFatPerServing" = s."satFatPerServing" * CASE WHEN pair.per_serving THEN 1 ELSE t."defaultServingWeightGram" / s."defaultServingWeightGram" END,
        "transFatPerServing" = s."transFatPerServing" * CASE WHEN pair.per_serving THEN 1 ELSE t."defaultServingWeightGram" / s."defaultServingWeightGram" END,
        "fiberPerServing" = s."fiberPerServing" * CASE WHEN pair.per_serving THEN 1 ELSE t."defaultServingWeightGram" / s."defaultServingWeightGram" END,
        "sugarPerServing" = s."sugarPerServing" * CASE WHEN pair.per_serving THEN 1 ELSE t."defaultServingWeightGram" / s."defaultServingWeightGram" END,
        "addedSugarPerServing" = s."addedSugarPerServing" * CASE WHEN pair.per_serving THEN 1 ELSE t."defaultServingWeightGram" / s."defaultServingWeightGram" END,
        "lastUpdated" = now()
      FROM public."FoodItem" s WHERE t.id = pair.drop_id AND s.id = pair.keep_id AND s."defaultServingWeightGram" > 0;
  END LOOP;

  FOR r IN SELECT * FROM (VALUES
      (4, 'Chicken breast with skin, grilled', ARRAY[]::text[]),
      (232, 'Chicken breast, skinless, grilled', ARRAY['grilled chicken breast','grilled chicken']),
      (1584, 'Mushrooms, white, cooked', ARRAY['mushrooms']),
      (1278, 'Shrimp, cooked', ARRAY['shrimp']),
      (709, 'Steel cut oats, dry', ARRAY['steel cut oats']),
      (1675, 'Lentils, cooked', ARRAY['lentils']),
      (5497, 'Lentils, dry', ARRAY[]::text[]),
      (1201, 'Whipped cream, aerosol', ARRAY['whipped cream']),
      (11057, 'Heavy cream, whipped', ARRAY[]::text[]),
      (179, 'Protein Shake Powder, Strawberry', ARRAY[]::text[]),
      (480, 'Barbecue sauce, low sugar', ARRAY[]::text[]),
      (2172, 'Barbecue sauce', ARRAY['bbq sauce','barbecue sauce'])
    ) AS v(id, name, aliases) LOOP
    INSERT INTO public."CatalogueAuditBackup"(audit, "tableName", "rowId", before)
      SELECT 'A15_variant_names', 'FoodItem', f.id, pg_catalog.to_jsonb(f) - 'bgeBaseEmbedding' - 'adaEmbedding'
      FROM public."FoodItem" f WHERE f.id = r.id;
    -- Plain words are an alias only on the variant they are meant for.
    UPDATE public."FoodItem" f SET name = r.name,
        "knownAs" = coalesce((SELECT pg_catalog.array_agg(DISTINCT a) FROM pg_catalog.unnest(coalesce(f."knownAs", ARRAY[]::text[]) || r.aliases) a
          WHERE public.food_identity_part(a) <> public.food_identity_part(r.name)
            AND (public.food_identity_part(a) IN (SELECT public.food_identity_part(x) FROM pg_catalog.unnest(r.aliases) x)
                 OR public.food_identity_part(a) NOT IN ('barbecue sauce', 'bbq sauce', 'grilled chicken', 'grilled chicken breast', 'lentils', 'mushrooms', 'shrimp', 'steel cut oats', 'whipped cream'))), ARRAY[]::text[])
      WHERE f.id = r.id;
  END LOOP;

  INSERT INTO public."CatalogueAuditBackup"(audit, "tableName", "rowId", before)
    SELECT 'A15_recompute', 'LoggedFoodItem', l.id, pg_catalog.jsonb_build_object('foodItemId', l."foodItemId", 'grams', l.grams,
      'kcal', l.kcal, 'proteinG', l."proteinG", 'carbG', l."carbG", 'totalFatG', l."totalFatG", 'satFatG', l."satFatG",
      'transFatG', l."transFatG", 'fiberG', l."fiberG", 'sugarG', l."sugarG", 'addedSugarG', l."addedSugarG")
    FROM public."LoggedFoodItem" l JOIN a15_recompute x ON x.id = l.id;
  UPDATE public."LoggedFoodItem" l SET
      kcal = l.grams * f."kcalPerServing" / f."defaultServingWeightGram",
      "proteinG" = l.grams * f."proteinPerServing" / f."defaultServingWeightGram",
      "carbG" = l.grams * f."carbPerServing" / f."defaultServingWeightGram",
      "totalFatG" = l.grams * f."totalFatPerServing" / f."defaultServingWeightGram",
      "satFatG" = l.grams * f."satFatPerServing" / f."defaultServingWeightGram",
      "transFatG" = l.grams * f."transFatPerServing" / f."defaultServingWeightGram",
      "fiberG" = l.grams * f."fiberPerServing" / f."defaultServingWeightGram",
      "sugarG" = l.grams * f."sugarPerServing" / f."defaultServingWeightGram",
      "addedSugarG" = l.grams * f."addedSugarPerServing" / f."defaultServingWeightGram"
    FROM a15_recompute x, public."FoodItem" f
    WHERE x.id = l.id AND f.id = l."foodItemId" AND f."defaultServingWeightGram" > 0 AND l.grams > 0;
  GET DIAGNOSTICS recomputed = ROW_COUNT;
  RAISE NOTICE 'A15: % merged, % skipped, % logs recomputed', merged, skipped, recomputed;
END
$a15$;
NOTIFY pgrst, 'reload schema';
