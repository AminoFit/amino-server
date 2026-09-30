-- A13: the rest of A12's Jev-confirmed duplicates, whose calories per 100 g differ 10-15% (raw spinach 23 vs 27,
-- chicken wings 327 vs 288): 41 foods into 36 survivors. Each keeps the survivor's nutrition; past logs keep their own.
-- Same process and backups as A12 (pairs with two barcodes are skipped).
DO $merge$
DECLARE pair record; merged integer := 0; skipped integer := 0;
BEGIN
  -- Repointing a log is catalogue maintenance, not a meal change: each log keeps its own nutrition.
  PERFORM pg_catalog.set_config('app.meal_operation_write', 'true', true);
  FOR pair IN SELECT * FROM (VALUES
    -- Kale, Raw (43.0 kcal) → raw kale (49.0 kcal)
    (674, 609),
    -- rice and vegetables (111.4 kcal) → Rice with Vegetables (99.0 kcal)
    (1221, 1123),
    -- raw apple (52.0 kcal) → Apple, Raw (61.0 kcal)
    (2277, 787),
    -- Beans, Baked, Canned, With Pork And Tomato Sauce (94.0 kcal) → Baked Beans with Pork (Canned) (106.0 kcal)
    (2230, 2510),
    -- Cherry Tomatoes (21.0 kcal) → cherry tomatoes (18.0 kcal)
    (206, 2538),
    -- Mcdonald''S, Big Mac (257.0 kcal) → Big Mac (295.0 kcal)
    (80, 2664),
    -- Big Mac (Mcdonalds) (260.0 kcal) → Big Mac (295.0 kcal)
    (80, 10922),
    -- 85% Lean/15% Fat Ground Beef (240.0 kcal) → Ground Beef (85% Lean / 15% Fat) (215.0 kcal)
    (1266, 2859),
    -- Chicken & Vegetable Dumplings Korean Style Mini Wontons, Chi (164.3 kcal) → Korean Style Mini Wontons Chicken & Vegetable Dumplings (185.7 kcal)
    (1041, 2934),
    -- Blueberry Flavored Gluten Free Waffles, Blueberry (325.0 kcal) → Gluten Free Waffles, Blueberry (285.7 kcal)
    (3382, 3383),
    -- Spinach, Raw (27.0 kcal) → raw spinach (23.0 kcal)
    (1034, 4215),
    -- Heinz Tomato Ketchup (118.2 kcal) → Tomato Ketchup (117.6 kcal)
    (699, 4347),
    -- Ketchup, Tomato (133.3 kcal) → Tomato Ketchup (117.6 kcal)
    (699, 7977),
    -- Dannon, Light & Fit, Nonfat Yogurt, Strawberry Cheesecake, S (47.0 kcal) → Dannon Light & Fit Greek Strawberry Cheesecake Yogurt (53.2 kcal)
    (4535, 4536),
    -- Balsamic Vinaigrette Dressing, Balsamic Vinaigrette (354.8 kcal) → Ken''s Steakhouse Balsamic Vinaigrette (395.3 kcal)
    (4926, 4927),
    -- Pork, Fresh, Ground, Raw (263.0 kcal) → Pork, Ground, Raw (228.3 kcal)
    (5507, 5508),
    -- 1% Small Curd Cottage Cheese (80.0 kcal) → 1% Lowfat Small Curd Cottage Cheese (71.0 kcal)
    (5642, 5643),
    -- Mini Muffins (316.7 kcal) → Mini Muffins (366.7 kcal)
    (6225, 6226),
    -- Strawberry Organic Kefir Culture Whole Milk, Strawberry (70.8 kcal) → Strawberry Organic Kefir Cultured Whole Milk, Strawberry (79.2 kcal)
    (6571, 6572),
    -- Beef, Ground, Patty (272.0 kcal) → ground beef patty (232.0 kcal)
    (1535, 6750),
    -- Santa Cruz Organic, Apple Sauce (44.0 kcal) → Apple Sauce (50.0 kcal)
    (6927, 6926),
    -- Mcdonald''S, Filet-O-Fish (282.0 kcal) → Filet-O-Fish (250.0 kcal)
    (1995, 7261),
    -- Microwave Popcorn, Butter (406.3 kcal) → Buttery Microwave Popcorn, Buttery (352.9 kcal)
    (3573, 7752),
    -- rib eye steak (271.0 kcal) → Ribeye Steak (234.1 kcal)
    (8216, 869),
    -- Mixed Berry Triple Zero Blended Greek Yogurt (60.0 kcal) → Mixed Berry Flavor Triple Zero Blended Greek Nonfat Yogurt,  (66.7 kcal)
    (8471, 2166),
    -- Cheese, American (350.0 kcal) → american cheese (312.0 kcal)
    (1317, 9690),
    -- Chunk Light In Water Tuna (80.0 kcal) → Chunk Light Tuna In Water (88.9 kcal)
    (9352, 10074),
    -- Pudding, Butterscotch (109.0 kcal) → Butterscotch Pudding, Butterscotch (98.0 kcal)
    (10690, 10691),
    -- Potato, Baked, Peel Eaten (93.0 kcal) → Baked Potato (Peel Eaten) (109.0 kcal)
    (10886, 5593),
    -- Three Meat Sausage, Pepperoni, Beef Topping Cheese Stuffed C (245.3 kcal) → Three Meat Pepperoni, Sausage, Beef Pizza Topping Cheese Stu (276.9 kcal)
    (10908, 10910),
    -- Three Meat Sausage, Pepperoni, Beef Pizza Topping Cheese Stu (245.3 kcal) → Three Meat Pepperoni, Sausage, Beef Pizza Topping Cheese Stu (276.9 kcal)
    (10908, 10909),
    -- Potato Chips, Original (571.4 kcal) → Original Potato Chips, Original (500.0 kcal)
    (10874, 11871),
    -- Plain Nonfat Greek Yogurt (62.1 kcal) → Yogurt, Greek, Plain, Nonfat (61.0 kcal)
    (10832, 12766),
    -- plain nonfat greek yogurt (59.0 kcal) → Yogurt, Greek, Plain, Nonfat (61.0 kcal)
    (10832, 13411),
    -- Greek Nonfat Plain Yogurt (53.3 kcal) → Yogurt, Greek, Plain, Nonfat (61.0 kcal)
    (10832, 14549),
    -- Cherry Triple Zero Blended Greek Yogurt (60.0 kcal) → Cherry Flavor Triple Zero Blended Greek Nonfat Yogurt, Cherr (66.7 kcal)
    (13081, 1905),
    -- Chicken Wing (288.0 kcal) → chicken wings (327.5 kcal)
    (706, 13565),
    -- Burger King, Cheeseburger (290.0 kcal) → Cheeseburger (Burger King) (260.0 kcal)
    (13642, 13643),
    -- Digestion Shot With Ginger & Probiotics (34.1 kcal) → Digestion Shot With Ginger & Probiotics, Ginger & Probiotics (30.0 kcal)
    (13946, 13947),
    -- 100% Lactose Free 2% Reduced Fat Milk (60.3 kcal) → Lactose Free 2% Reduced Fat Milk (52.6 kcal)
    (9231, 14118),
    -- Shrimp Ramen Noodle Soup, Shrimp (397.8 kcal) → Shrimp Flavor Ramen Noodle Soup, Shrimp (452.4 kcal)
    (8612, 14703)
  ) AS p(keep_id, drop_id) LOOP
    IF NOT EXISTS (SELECT 1 FROM public."FoodItem" WHERE id = pair.keep_id)
       OR NOT EXISTS (SELECT 1 FROM public."FoodItem" WHERE id = pair.drop_id)
       OR EXISTS (SELECT 1 FROM public."FoodItem" k, public."FoodItem" d WHERE k.id = pair.keep_id AND d.id = pair.drop_id
                  AND k.gtin IS NOT NULL AND d.gtin IS NOT NULL AND k.gtin <> d.gtin)
       OR EXISTS (SELECT 1 FROM public."LoggedFoodItem" l JOIN public."Message" m ON m.id = l."messageId"
                  WHERE l."foodItemId" = pair.drop_id AND m."activeOperationId" IS NOT NULL)
    THEN skipped := skipped + 1; CONTINUE; END IF;
    INSERT INTO public."CatalogueAuditBackup"(audit, "tableName", "rowId", before)
      SELECT 'A13_close_duplicate_merge', 'LoggedFoodItem', l.id,
        pg_catalog.jsonb_build_object('foodItemId', l."foodItemId", 'servingId', l."servingId", 'mergedInto', pair.keep_id)
      FROM public."LoggedFoodItem" l WHERE l."foodItemId" = pair.drop_id;
    PERFORM public.merge_catalogue_food(pair.keep_id, pair.drop_id, 'A13_close_duplicate_merge');
    merged := merged + 1;
  END LOOP;
  RAISE NOTICE 'A13: % foods merged, % skipped', merged, skipped;
END
$merge$;
NOTIFY pgrst, 'reload schema';
