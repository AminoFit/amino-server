-- A12: duplicate foods by name. Pairs whose names mean the same food (name embeddings >= 0.93), that Jev confirmed
-- are the same product (confidence >= 0.9, judged by name and brand), and whose calories per 100 g agree within 10%,
-- merge into the most-logged food (then the better source): 591 foods into 536 survivors. A food only
-- merges when Jev confirmed it against the survivor itself, so no chain of look-alikes merges variants.
-- merge_catalogue_food (A4/A5) moves logs, favourites, servings, icons and aliases and backs the dropped food up.
-- Here each moved log's food and serving are backed up too, so the batch can be undone. Two different barcodes
-- are two products, and a meal being resolved right now is skipped (a later run picks it up).
DO $merge$
DECLARE pair record; merged integer := 0; skipped integer := 0;
BEGIN
  -- Repointing a log is catalogue maintenance, not a meal change: each log keeps its own nutrition.
  PERFORM pg_catalog.set_config('app.meal_operation_write', 'true', true);
  FOR pair IN SELECT * FROM (VALUES
    -- rice cakes → Rice Cake
    (185, 317),
    -- 2% Fat Milk → 2% milk
    (30, 363),
    -- Dressing, Creamy Ginger → Creamy Ginger Dressing
    (470, 471),
    -- Blueberry, Protein Bars → Blueberry Protein Bar
    (443, 455),
    -- Blueberry Protein Bar, Blueberry → Blueberry Protein Bar
    (443, 7666),
    -- Plain Bagels → Bagels, Plain
    (432, 427),
    -- spicy tuna avocado sushi roll → spicy tuna avocado roll
    (492, 505),
    -- pho soup broth → pho broth
    (524, 320),
    -- blueberry → blueberries
    (520, 67),
    -- egg white → egg whites
    (488, 14),
    -- 86% Cacao Intense Dark Chocolate → Intense Dark 86% Cacao Dark Chocolate
    (89, 454),
    -- Intense Dark 86% Cacao Dark Chocolate, Intense Dark 86% Caca → Intense Dark 86% Cacao Dark Chocolate
    (89, 2796),
    -- Blue Raspberry Flavored  Hydration Drink → Hydration Drink, Blue Raspberry
    (583, 584),
    -- latte coffee → latte
    (115, 615),
    -- carrots → carrot
    (44, 625),
    -- ground turkey 99% lean → 99% lean ground turkey
    (835, 838),
    -- Chicken Stir Fry → stir fried chicken
    (882, 915),
    -- shrimp dumpling → shrimp dumplings
    (1016, 259),
    -- English Muffins → English Muffin
    (224, 1057),
    -- tomato slice → tomato slices
    (949, 1055),
    -- mixed vegetables salad → mixed vegetable salad
    (577, 1083),
    -- Cool Mint Chocolate Energy Bar → Clif Bar - Cool Mint Chocolate
    (711, 1032),
    -- 21 Whole Grain & Seeds → 21 Whole Grains And Seeds Organic Bread
    (944, 1088),
    -- Organic Bread, Whole Grains and Seeds → 21 Whole Grains And Seeds Organic Bread
    (944, 1828),
    -- Organic 21 Whole Grains And Seeds Bread, 21 Whole Grains And → 21 Whole Grains And Seeds Organic Bread
    (944, 2933),
    -- fries → french fries
    (1128, 735),
    -- milk fat free → fat free milk
    (822, 1105),
    -- cinnamon bagels → cinnamon bagel
    (1214, 244),
    -- roast chicken → roasted chicken
    (303, 1254),
    -- mixed vegetable → mixed vegetables
    (936, 1204),
    -- potatoes mashed → mashed potatoes
    (43, 1255),
    -- hard boiled egg → hard boiled eggs
    (106, 1371),
    -- shrimps → shrimp
    (1278, 330),
    -- vodka pasta → pasta with vodka sauce
    (476, 1348),
    -- Popcorn → Popcorn
    (1401, 1343),
    -- fresh parsley → Parsley, Fresh
    (1457, 842),
    -- chia seed pudding → Chia Pudding
    (624, 1411),
    -- Red Onions → red onion
    (1421, 1285),
    -- chicken thighs → chicken thigh
    (792, 1558),
    -- meatball → meatballs
    (1293, 1532),
    -- mushroom → mushrooms
    (1584, 50),
    -- Coffee Creamer, Sweet & Creamy → Sweet & Creamy Creamer
    (1725, 1745),
    -- Sweet & Creamy Coffee Creamer, Sweet & Creamy → Sweet & Creamy Creamer
    (1725, 2615),
    -- whole eggs → whole egg
    (1813, 501),
    -- Frosted Strawberry → pop tarts frosted strawberry
    (1389, 1749),
    -- Pop Tarts, Frosted Strawberry → pop tarts frosted strawberry
    (1389, 12463),
    -- cheez it → cheez its
    (807, 1864),
    -- scrambled egg → scrambled eggs
    (7329, 782),
    -- eggs scrambled → scrambled eggs
    (7329, 1923),
    -- tuna fish → tuna
    (554, 2042),
    -- Oats ''N Honey Granola Bar → Crunchy Granola Bars, Oats ''n Honey
    (687, 2051),
    -- Granola Bars, Oats ''N Honey, Crunchy → Crunchy Granola Bars, Oats ''n Honey
    (687, 8378),
    -- mcdonalds chicken nuggets → mcdonalds chicken mcnuggets
    (1993, 2053),
    -- Mcdonald''S, Chicken Mcnuggets → mcdonalds chicken mcnuggets
    (1993, 12212),
    -- chicken nugget → Chicken Nuggets
    (416, 2092),
    -- shredded cheddar → shredded cheddar cheese
    (1625, 2100),
    -- Chick-Fil-A Chicken Sandwich → chick fil a chicken sandwich
    (2123, 2128),
    -- S''mores Protein Bar → S''Mores Protein Bar, S''Mores
    (7450, 1895),
    -- S''Mores Flavor Protein Bar → S''Mores Protein Bar, S''Mores
    (7450, 2177),
    -- cracker → crackers
    (1, 2210),
    -- potatoes → potato
    (2231, 732),
    -- kiwi fruits → kiwi fruit
    (1075, 2218),
    -- turkey meatballs → turkey meatball
    (2225, 2262),
    -- green apples → green apple
    (1479, 2221),
    -- cooked red bell pepper → cooked red bell peppers
    (2306, 1033),
    -- spicy tuna roll → Spicy Tuna Rolls
    (192, 2289),
    -- spicy tuna sushi roll → Spicy Tuna Rolls
    (192, 13390),
    -- raw red bell peppers → red bell pepper raw
    (843, 2315),
    -- chicken tender → chicken tenders
    (1146, 2322),
    -- mandarin oranges → mandarin orange
    (31, 2324),
    -- walnut → walnuts
    (354, 2356),
    -- Roasted Potato → roasted potatoes
    (1160, 2395),
    -- chocolate chip → chocolate chips
    (1962, 2408),
    -- chicken breast baked → baked chicken breast
    (761, 2368),
    -- beef burritos → beef burrito
    (1815, 2409),
    -- Light Multi Grain English Muffins, Multi Grain → Light Multi-Grain English Muffin
    (1810, 2522),
    -- Light Multi Grain English Muffins, Light Multi Grain → Light Multi-Grain English Muffin
    (1810, 10678),
    -- Extreme Milk Chocolate Flavored Gold Standard 100% Whey Prot → Extreme Milk Chocolate Flavored Gold Standard 100% Whey Prot
    (2432, 2433),
    -- Extreme Milk Chocolate Flavor 100% Whey Gold Standard Protei → Extreme Milk Chocolate Flavored Gold Standard 100% Whey Prot
    (2432, 12097),
    -- Cookies → Biscoff Cookie
    (2537, 2532),
    -- Biscoff Cookies → Biscoff Cookie
    (2537, 2591),
    -- Hershey''S, Kisses, Milk Chocolate → Hershey''S Kisses, Milk Chocolate
    (2540, 2541),
    -- Kisses, Milk Chocolate → Hershey''S Kisses, Milk Chocolate
    (2540, 7549),
    -- Hershey''S, Kisses, Milk Chocolate With Almonds → Hershey''S Kisses, Milk Chocolate With Almonds Candy
    (2542, 2543),
    -- Tomatoes, Sun-Dried → Sun-Dried Tomatoes
    (2619, 2620),
    -- Coconut Water, Original → Original Coconut Water, Original
    (2651, 2653),
    -- The Original Coconut Water, Original → Original Coconut Water, Original
    (2651, 7538),
    -- Mt. Olive, Kosher Dills → Mt. Olive, Kosher Dill
    (2524, 2663),
    -- Dave''S Killer Bread, Organic Whole Wheat Bread → Whole Wheat Bread
    (943, 2766),
    -- Chile Limon Clasico Mild Chicharrones Fried Pork Rinds, Chil → Clasico Mild Chile Limon Chicharrones Fried Pork Rinds, Clas
    (2714, 2715),
    -- Intense Dark 72% Cacao Dark Chocolate, Intense Dark 72% Caca → Intense Dark 72% Cacao Dark Chocolate, Intense Dark
    (1043, 2771),
    -- 72% Cacao Dark Chocolate → Intense Dark 72% Cacao Dark Chocolate, Intense Dark
    (1043, 6587),
    -- 72% Dark Intense Ghirardelli Chocolate → Intense Dark 72% Cacao Dark Chocolate, Intense Dark
    (1043, 11591),
    -- burger patty → hamburger patty
    (1984, 2802),
    -- Bread, Whole Wheat → Whole Wheat Bread
    (2819, 942),
    -- Danish Blue Cheese, Danish Blue → Danish Blue Cheese
    (2820, 2821),
    -- Kellogg''S Mini-Wheats Cereal Frosted 2.1oz → Kellogg''S Mini-Wheats Cereal Frosted
    (2838, 2839),
    -- Frosted Mini Wheats → Kellogg''S Mini-Wheats Cereal Frosted
    (2838, 13788),
    -- Gold Standard 100% Whey Protein 24 G Powder Drink Mix, Vanil → Vanilla Ice Cream Flavored Gold Standard 100% Whey Protein P
    (2904, 2905),
    -- Vanilla Ice Cream Gold Standard 100% Whey Protein Powder Dri → Vanilla Ice Cream Flavored Gold Standard 100% Whey Protein P
    (2904, 11764),
    -- Vanilla Soymilk, Vanilla → Silk Vanilla, Soymilk
    (2945, 2946),
    -- Beef Patty Flame Grilled, Beef Patty  → Flame Grilled Beef Patty
    (2957, 2958),
    -- Pears, Raw → Pear, Raw
    (2950, 547),
    -- Goya, Black Beans → Black Beans
    (2985, 2983),
    -- Chocolate Protein Shake → Chocolate Protein Shake, Chocolate
    (2986, 268),
    -- Noodles, Chow Mein → chow mein noodles
    (2335, 3132),
    -- brazil nut → Brazil Nuts
    (3117, 81),
    -- Celery, Raw → raw celery
    (1758, 3136),
    -- Fajita, Chicken → chicken fajita
    (1959, 3190),
    -- Cafe Latte Flavored High Protein Shakes, Cafe Latte → Cafe Latte High Protein Shake, Cafe Latte
    (3197, 3198),
    -- Cafe Latte Flavored High Protein Shake, Cafe Latte → Cafe Latte High Protein Shake, Cafe Latte
    (3197, 3199),
    -- Bread, White → white bread
    (21, 3147),
    -- Gorton''S, Shrimp Scampi, Garlic Butter, Garlic Butter → Garlic Butter Shrimp Scampi, Garlic Butter
    (3204, 3205),
    -- French Vanilla Flavored Coffee Creamer, French Vanilla → French Vanilla Coffee Creamer
    (1742, 3219),
    -- Milk Chocolate Candy → Milk Chocolate
    (3235, 3236),
    -- Chicken Wing, (Barbecue Flavored, Glazed, Frozen) → Chicken, Wing, Frozen, Glazed, Barbecue Flavored
    (3252, 1120),
    -- Snickers, Candy Bar → Snickers, Snickers
    (2783, 3261),
    -- Crispy Chocolate Coconut Flavor Hero Protein Bar, Crispy Cho → Crispy Chocolate Coconut Hero Protein Bar, Crispy Chocolate 
    (3195, 3264),
    -- 2% Reduced Fat Ultra-Filtered Milk, Chocolate → 2% Reduced Fat Ultra-Filtered Chocolate Milk
    (1713, 3273),
    -- Chocolate 2% Reduced Fat Ultra- Filtered Milk, Chocolate → 2% Reduced Fat Ultra-Filtered Chocolate Milk
    (1713, 4554),
    -- Chocolate Iced Doughnuts With Sprinkles, Chocolate Iced With → Chocolate Iced Doughnuts With Sprinkles, Chocolate
    (1113, 3287),
    -- chicken and broccoli with brown sauce → chicken and broccoli in brown sauce
    (1060, 3320),
    -- Strawberry Lemonade → Lemonade, Strawberry
    (3305, 3304),
    -- Frosted Strawberry Mini Donuts, Frosted Strawberry → Mini Donuts, Frosted Strawberry
    (3387, 3388),
    -- Campbell''S Pasta Spaghettios → Spaghettios
    (3409, 3410),
    -- Bananas, Raw → Banana, Raw
    (3427, 3428),
    -- Peanut Butter Eggs Milk Chocolate, Peanut Butter → Reese''S, Milk Chocolate, Peanut Butter Egg
    (3411, 3413),
    -- Cheese Flavored Snacks, Crunchy → Crunchy, Cheese Flavored Snacks
    (3467, 3468),
    -- Crunchy Cheese Flavored Snacks, Cheese → Crunchy, Cheese Flavored Snacks
    (3467, 4687),
    -- Cheese, Cheddar → cheddar cheese
    (225, 3493),
    -- Sausage, Egg & Cheese Biscuit Sandwiches, Sausage, Egg & Che → Sausage, Egg & Cheese Biscuit Sandwich, Sausage, Egg & Chees
    (3569, 3570),
    -- M&M''S, Candy, Peanut → M&M''S, Peanut
    (3607, 3609),
    -- Cookie, Oatmeal → oatmeal cookies
    (1125, 3582),
    -- oatmeal cookie → oatmeal cookies
    (1125, 11214),
    -- Egg, Whole, Raw, Fresh → Egg, Whole, Raw
    (2065, 3685),
    -- Peanut Butter Pie Flavored Protein Bars, Peanut Butter Pie → Peanut Butter Pie Flavored Protein Bar, Peanut Butter Pie
    (3699, 3700),
    -- whole wheat dinner roll → Roll, Whole Wheat
    (3721, 1829),
    -- reeses peanut butter cup → Reese''S, Peanut Butter Cups
    (3752, 2061),
    -- Peanut Butter Cups, Milk Chocolate → Reese''S, Milk Chocolate Peanut Butter Cups
    (3753, 3754),
    -- Buckwheat Groats (Cooked, Roasted) → Buckwheat Groats, Roasted, Cooked
    (3777, 1704),
    -- Chocolate Protein Bars, Chocolate → Chocolate Protein Bar, Chocolate
    (3742, 3745),
    -- Lemonade With Blueberry Juice Blend, Lemonade With Blueberry → Simply Lemonade With Blueberry
    (3787, 3788),
    -- Croissant, Cheese → cheese croissant
    (1397, 3798),
    -- Whey Protein Baked Bar, Peanut Butter → Peanut Butter Flavored Whey Protein Baked Bars, Peanut Butte
    (3613, 3614),
    -- Total All Natural Lowfat (2% Milkfat) Greek Strained Yogurt → Total 2% Milkfat Greek Strained Yogurt
    (3806, 3807),
    -- Zero Calorie Sweetener Packets → Sweetener, Zero Calorie, Packets
    (1312, 3834),
    -- Breaded Mozzarella Sticks → Breaded Mozzarella Sticks
    (3852, 3853),
    -- Breaded Mozzarella Sticks, Mozzarella → Breaded Mozzarella Sticks
    (3852, 10568),
    -- Hot Cocoa Mix, Milk Chocolate → Milk Chocolate Hot Cocoa Mix, Milk Chocolate
    (3865, 3866),
    -- Dot''S, Homestyle Pretzels → Homestyle Pretzels, Homestyle
    (3891, 3892),
    -- Strawberry Flavor Triple Zero Blended Greek Nonfat Yogurt, S → Triple Zero Nonfat Blended Greek Yogurt, Strawberry
    (215, 3900),
    -- Basil, Fresh → fresh basil
    (1009, 3918),
    -- Shredded Low-Moisture Part-Skim Mozzarella Cheese, Mozzarell → Cheese, Mozzarella, Low Moisture, Part-Skim, Shredded
    (4019, 4021),
    -- Chili Lime Tortilla Style Protein Chips, Chili Lime → Chili Lime Flavor Tortilla Style Protein Chips, Chili Lime
    (1746, 4064),
    -- Cheese, Feta → feta cheese
    (133, 4084),
    -- Cookies & Cream Protein Bar, Cookies & Cream → Cookies & Cream Protein Bar
    (6023, 4191),
    -- Cookies & Cream Flavored Protein Bar → Cookies & Cream Protein Bar
    (6023, 2358),
    -- Quick 1-Minute 100% Whole Grain Oats → 100% Whole Grain Quick 1-Minute Oats, 100% Whole Grain
    (4196, 4197),
    -- Oats, 100% Whole Grain, Quick 1-Minute → 100% Whole Grain Quick 1-Minute Oats, 100% Whole Grain
    (4196, 13418),
    -- Berry Blast Juicy Fruit Snacks, Berry Blast → Juicefuls Juicy Fruit Snacks, Berry Blast
    (4221, 4222),
    -- Maple & Brown Sugar Flavored Instant Oatmeal, Maple & Brown  → Maple & Brown Sugar Instant Oatmeal, Maple & Brown Sugar
    (1426, 4238),
    -- Instant Oatmeal - Maple & Brown Sugar → Maple & Brown Sugar Instant Oatmeal, Maple & Brown Sugar
    (1426, 9065),
    -- Almonds, Roasted Coffee → Coffee Almonds
    (4299, 4300),
    -- Cookies ''N'' Creme Bars, Cookies ''N'' Creme → Cookies ''N'' Creme Bar, Cookies ''N'' Creme
    (4276, 4277),
    -- Hershey''S, Candy Bar, Cookies ''N'' Creme, Cookies ''N'' Cr → Cookies ''N'' Creme Bar, Cookies ''N'' Creme
    (4276, 11235),
    -- Peanut Butter Chocolate Chip Chewy Granola Bars → Quaker Chewy Granola Bars Peanut Butter Chocolate Chip .84z
    (4324, 4325),
    -- Pasta, Cooked → cooked pasta
    (1644, 4395),
    -- Cheeseburger (Mcdonalds) → Mcdonald''S, Cheeseburger
    (4385, 4384),
    -- Carrots, Raw → raw carrot
    (1247, 4397),
    -- fruity pebbles → fruity pebbles cereal
    (1241, 4427),
    -- sesame seed → sesame seeds
    (4415, 1703),
    -- Strawberry Lowfat Yogurt, Strawberry → Classic Strawberry Low Fat Yogurt, Strawberry
    (4389, 4428),
    -- Milk Chocolate → M&M''S, Milk Chocolate
    (4484, 4485),
    -- Milk Chocolate Flavor Max Protein Nutrition Shake, Milk Choc → Max Protein Nutrition Shake, Milk Chocolate
    (4480, 4481),
    -- Breakfast Bars, Blueberry Almond → Blueberry Almond Breakfast Bars, Blueberry Almond
    (4587, 4588),
    -- Kosher Baby Dill, Kosher → Mt. Olive Kosher Baby Dill Pickles
    (4552, 4553),
    -- 1% Fat Milk → 1% milk
    (4599, 1049),
    -- Kellogg''S Pop-Tarts Frosted Brown Sugar Cinnamon 14oz → Kellogg''S Pop-Tarts Frosted Brown Sugar Cinnamon 28.2oz
    (4601, 4602),
    -- Organic Bagels, Boomin'' Berry → Boomin'' Berry Organic Bagels
    (1099, 4622),
    -- Chocolate Peanut Butter Cereal, Chocolate Peanut Butter → Chocolate Peanut Butter Cereal
    (935, 4656),
    -- Instant Lunch Ramen Noodle Soup With Shrimp, Shrimp → Instant Lunch, Ramen Noodle Soup, Shrimp
    (4654, 4655),
    -- French Vanilla Coffee Creamer → french vanilla coffee creamer
    (1313, 4673),
    -- Baked Snack Crackers → cheez it baked snack cheese crackers
    (1175, 4727),
    -- red beans → red bean
    (292, 4701),
    -- Beef Stew with Potatoes and Vegetables in Gravy (Including C → Beef Stew With Potatoes And Vegetables Including Carrots, Br
    (4695, 1617),
    -- Fast Foods, Submarine Sandwich, Oven Roasted Chicken On Whit → Subway, Oven Roasted Chicken Sub On White Bread With Lettuce
    (4764, 4766),
    -- Protein Bar, Chocolate Sea Salt → Chocolate Sea Salt
    (294, 4822),
    -- Chocolate Sea Salt Protein Bar, Chocolate Sea Salt → Chocolate Sea Salt
    (294, 4823),
    -- Turkey Breast, Sliced, Prepackaged → sliced turkey breast
    (2096, 4836),
    -- Squares Dark Chocolate → Dark Chocolate Squares
    (4856, 4857),
    -- Original Hot Sauce, Original → Hot Sauce
    (4875, 4876),
    -- General Tso Chicken → general tsos chicken
    (1218, 4877),
    -- glazed doughnut → glazed donut
    (4893, 1116),
    -- Canada Dry, Ginger Ale → Ginger Ale
    (4903, 4902),
    -- Ranch Tortilla Style Protein Chips, Ranch → Quest Ranch Tortilla Style Protein Chips
    (4996, 4995),
    -- Newman''S Own, Olive Oil & Vinegar Dressing → Olive Oil & Vinegar Dressing
    (4920, 4921),
    -- Chocolate Peanut Butter Bars → Chocolate Peanut Butter Bar
    (4973, 4974),
    -- Milk Chocolate With Soft Fondant Center Creme Egg, Milk Choc → Creme Egg Milk Chocolate Eggs With Soft Fondant Center
    (5054, 5055),
    -- Alcoholic Beverage, Wine, Table, White → Wine, Table, White
    (5097, 5098),
    -- Milk Chocolate Mini Eggs → Mini Eggs, Milk Chocolate
    (4939, 5077),
    -- Papayas, Raw → Papaya, Raw
    (5039, 5040),
    -- Soda → Dr Pepper, Soda
    (3415, 5176),
    -- Lime Unsweetened Sparkling Water, Lime → Unsweetened Lime Sparkling Water, Unsweetened Lime
    (5162, 5163),
    -- Snacks, Potato Chips, Lightly Salted → Potato Chips, Lightly Salted
    (5207, 5211),
    -- Kellogg''S Pop-Tarts Whole Grain Chocolate 1.7oz → Kellogg''S Pop-Tarts Whole Grain Chocolate
    (5191, 5192),
    -- White Chocolate Candy → Candies, White Chocolate
    (5226, 5227),
    -- pork sausages → Pork Sausage
    (2474, 5315),
    -- Ice Cream, Vanilla → vanilla ice cream
    (119, 5335),
    -- Sugar Free Lemonade, Lemon → Sugar Free Lemonade
    (5337, 5338),
    -- triscuit crackers → Triscuit Crackers Original
    (4881, 5339),
    -- Los Cidrines, Pan Sobao Sweet Bread → Sweet Bread
    (5390, 5386),
    -- The Original Potato Crisps, Original → Original Potato Crisps, Original
    (5399, 5400),
    -- Yoo-Hoo, Chocolate Drink, Chocolate, Chocolate → Yoo-Hoo, Chocolate Drink
    (5477, 5478),
    -- custard filled doughnut → Doughnut, Custard-Filled
    (5482, 581),
    -- 2% cottage cheese → cottage cheese 2%
    (1818, 5487),
    -- High Protein Shake, Chocolate → Chocolate High Protein Shake, Chocolate
    (5489, 4547),
    -- Peanut Butter Powder, Peanut Butter → PBFit Original Peanut Butter Powder
    (4486, 5528),
    -- Mcdonald''S, Sausage Mcmuffin With Egg → Sausage McMuffin with Egg
    (5544, 5130),
    -- Cookies And Cream Flavored Ice Cream, Cookies And Cream → Cookies And Cream Ice Cream, Cookies And Cream
    (5622, 4515),
    -- Plum, Raw → Plums, Raw
    (5678, 5679),
    -- Ham & Cheese Omelets, Ham & Cheese → Ham & Cheese Omelets
    (4024, 5680),
    -- Bread, Pita → pita bread
    (1920, 5756),
    -- Perfect Pasta, Meat Ravioli → Meat Ravioli
    (5849, 5850),
    -- Apples & Cinnamon Flavored Instant Oatmeal, Apples & Cinnamo → Apples & Cinnamon Instant Oatmeal, Apples & Cinnamon
    (5862, 5863),
    -- Cakesters Soft Snack Cakes → Cakesters Soft Snack Cakes, Cakesters
    (5938, 5940),
    -- Cheddar Stick Cheese → Cheddar Cheese Sticks
    (5882, 5890),
    -- Strawberry Banana High Protein Milk Shake, Strawberry Banana → High Protein Milk Shake Strawberry Banana
    (727, 5943),
    -- Core Power, High Protein Milk Shake, Strawberry, Banana → High Protein Milk Shake Strawberry Banana
    (727, 6293),
    -- Tamarind Soda, Tamarind → Tamarind Soda
    (5952, 5956),
    -- Jarritos, Natural Flavor Soda, Tamarind → Tamarind Soda
    (5952, 5954),
    -- Classic Ranch Dressing, Classic Ranch → Classic Ranch Dressing
    (6030, 6031),
    -- French''S, Tomato Ketchup → Tomato Ketchup
    (5995, 5994),
    -- Hazelnut Spread, with Cocoa → Hazelnut Spread With Cocoa, Hazelnut Spread
    (6066, 1618),
    -- Honey Buns → Honey Bun
    (6139, 6140),
    -- Yogurt With Strawberries, Vanilla → Vanilla Yogurt With Strawberry
    (6174, 6176),
    -- Wish-Bone, Buffalo Ranch Dressing → Buffalo Ranch Dressing, Buffalo Ranch
    (6199, 6200),
    -- potato wedge → potato wedges
    (5137, 6263),
    -- Potato Chips → Uncle Ray''S, Potato Chips
    (6272, 6273),
    -- Frosted Soft Sugar Cookies With Fun Frosting And Colorful Sp → Frosted Soft Sugar With Fun Froasting And Colorful Sprinkles
    (6307, 6308),
    -- Great Value, Finely Shredded Cheese, Fiesta Blend → Great Value, Finely Shredded Fiesta Blend Cheese
    (6562, 6329),
    -- Fudge Stripes Minis Cookies, Fudge Stripes → Keebler, Mini Fudge Stripes Cookies, Original
    (6406, 6405),
    -- jello sugar free → sugar free jello
    (5705, 6408),
    -- Lay''S, Classic Potato Chips → Potato Chips, Classic
    (6426, 6425),
    -- lays classic potato chips → Potato Chips, Classic
    (6426, 688),
    -- Classic Potato Chips → Potato Chips, Classic
    (6426, 11654),
    -- Mayonnaise Made With Avocado Oil → Avocado Oil Mayonnaise
    (6435, 6436),
    -- Mayonnaise, Chipotle → Chipotle Mayonnaise
    (6469, 6470),
    -- Bread, Multigrain → Multigrain Bread
    (2205, 6444),
    -- Cosmic Brownies With Chocolate Chip Candy → Cosmic Brownie With Chocolate Chip Candy, Chocolate Chip
    (6452, 6453),
    -- Double Chocolate Chip Soft & Chewy Protein Cookies, Double C → Quest Soft & Chewy Cookie Double Chocolate Chip
    (6526, 6525),
    -- Meat Stick, Original → Slim Jim Original Stick
    (6555, 6556),
    -- Lactose Free Lowfat 1% Milk → Milk, Lactose Free, Low Fat (1%)
    (6527, 6528),
    -- rice cracker → Rice Crackers
    (6548, 2028),
    -- Doritos, Tortilla Chips, Cool Ranch, Cool Ranch → Cool Ranch Flavored Tortilla Chips, Cool Ranch
    (6569, 6570),
    -- pistachio → pistachios
    (1453, 6576),
    -- Strawberry Kefir Cultured Lowfat Milk, Strawberry → Lowfat Strawberry Kefir
    (6589, 6027),
    -- Kefir, Lowfat, Strawberry, Lifeway → Lowfat Strawberry Kefir
    (6589, 6026),
    -- Almondmilk, Dark Chocolate → Almond Dark Chocolate Almondmilk
    (6636, 6637),
    -- Nacho Cheese Tortilla Chips, Nacho Cheese → Nacho Cheese Flavored Tortilla Chips, Nacho Cheese
    (6270, 6642),
    -- Salted Caramel Ready-To-Drink Protein Shake, Salted Caramel → Salted Caramel Protein Shake
    (889, 6710),
    -- Sandwich, Philly Cheesesteak → Philly Cheesesteak Sandwiches
    (6665, 6666),
    -- Danish Choice, Preserves, Apricot → Danish Choice, Apricot Preserve
    (6733, 6734),
    -- Macaroni & Cheese Dinner → Kraft, Macaroni & Cheese Dinner
    (6688, 6690),
    -- Peas, Green, Raw → Green Peas, Raw
    (6706, 6707),
    -- Breakfast Sausage → Breakfast Sausage
    (5133, 6763),
    -- Original Low Fat Yogurt, Harvest Peach → Yoplait Original Harvest Peach Low Fat Yogurt
    (6773, 6774),
    -- Harvest Peach Low Fat Yogurt, Harvest Peach → Yoplait Original Harvest Peach Low Fat Yogurt
    (6773, 14466),
    -- Street Tacos Corn Tortillas, Corn → Street Tacos Corn Tortillas
    (6794, 6795),
    -- Strawberry Banana Low Fat Yogurt, Strawberry Banana → Yoplait Original Strawberry Banana Low Fat Yogurt
    (6818, 6820),
    -- Strawberry Banana Flavored Smooth Style Original Low Fat Yog → Yoplait Original Strawberry Banana Low Fat Yogurt
    (6818, 6821),
    -- Fruit Flavored Snacks, Strawberry Peach, Orange Cherry, Rasp → Gushers Fruit Flavored Snacks Flavor Mixers, Strawberry Peac
    (6860, 6861),
    -- avocados → Avocado
    (137, 6908),
    -- Peanut Butter, Creamy → Skippy, Natural Creamy Peanut Butter Spread, Creamy
    (3426, 6950),
    -- Blow Pop Assorted Bubble Gum Filled Pops, Assorted → Blow Pop, Bubble Gum Filled Pops, Assorted
    (6904, 6905),
    -- Core Power Strawberry Banana Protein Milk Shake → Core Power High Protein Milk Shake Strawberry Banana
    (1915, 6955),
    -- Bagels, Multigrain → Bagel, Multigrain
    (6962, 6963),
    -- Strawberry Melon Iced Tea, Strawberry Melon → Strawberry Melon Flavor Iced Tea, Strawberry Melon
    (7012, 7013),
    -- Harris Teeter, Almond Slices → Almond Slices
    (7025, 7026),
    -- Bread, Naan → naan bread
    (2215, 7064),
    -- Blue Raspberry Flavored Slush, Blue Raspberry → Blue Raspberry Slush, Blue Raspberry
    (7068, 7069),
    -- Pulp Free 100% Orange Juice, Orange → Pulp Free Orange Juice, Pulp Free
    (7059, 7060),
    -- mango ice pop → Mango Fruit Ice Pops, Mango
    (6991, 7093),
    -- Lindt, Lindor - Milk Chocolate Truffles → Lindt, Lindor, Milk Chocolate Truffle
    (7154, 7155),
    -- Fruit & Nut Bar → Kind, Fruit & Nut Bar
    (7187, 3939),
    -- 12pc Tuna Avocado Roll Wr, Tuna Avocado → Tuna Avocado Roll Wr, Tuna Avocado
    (7208, 7210),
    -- Unsalted Almonds → unsalted almonds
    (7244, 7239),
    -- Almonds, Unsalted → unsalted almonds
    (7244, 7238),
    -- Italian Dressing, Italian → Italian Dressing
    (7337, 7339),
    -- Tortilla, Whole Wheat → whole wheat tortilla
    (2246, 7341),
    -- Chocolate Peanut Butter Organic Nut Butter Filled Energy Bar → Chocolate Peanut Butter Organic Nut Butter Filled Energy Bar
    (7350, 7351),
    -- Energy Drink, Cherry Slush → Cherry Slush Energy Drink
    (7408, 7471),
    -- The Original Nooks & Crannies English Muffins → Nooks & Crannies English Muffins, Original
    (7515, 7516),
    -- Milk Chocolate → Hershey''S, Milk Chocolate
    (7524, 7525),
    -- Peanut Butter Creamy → Creamy Peanut Butter
    (7531, 7533),
    -- Sweet & Salty Nut Granola Bars, Roasted Mixed Nut → Nature Valley Sweet & Salty Nut Roasted Mixed Nut Granola Ba
    (7571, 7572),
    -- Dark Chocolate Almond & Coconut Fruit & Nut Bars, Dark Choco → Fruit & Nut Bar, Dark Chocolate Almond & Coconut
    (7593, 7594),
    -- Mandarin Oranges In Juice, Mandarin In Juice → Mandarin Oranges In Fruit Juice, Mandarin In Fruit Juice
    (7655, 7656),
    -- scrambled eggs with veggies → scrambled eggs with vegetables
    (1188, 7671),
    -- protein shake whey → whey protein shake
    (300, 7637),
    -- Sugars, Brown → brown sugar
    (1839, 7664),
    -- Mozzarella Cheese → Great Value, Mozzarella Cheese
    (7675, 7676),
    -- Bread, Whole Wheat, Toasted → whole wheat toast
    (500, 7684),
    -- Rice, Fried, With Chicken → chicken fried rice
    (7769, 4984),
    -- Oven Fries → Oven Fries
    (7771, 7772),
    -- Pebbles Flavor Iso100 Hydrolyzed Protein Powder, Pebbles → Pebbles Flavor Iso 100 Hydrolyzed Protein Powder, Pebbles
    (7819, 7831),
    -- Fruity Pebbles Flavor ISO 100 Hydrolyzed Protein Powder → Pebbles Flavor Iso 100 Hydrolyzed Protein Powder, Pebbles
    (7819, 9495),
    -- Cookies and Cream Protein Powder → Cookies & Cream Protein Powder, Cookies & Cream
    (7851, 7852),
    -- High Protein 30 G Shakes, Chocolate Peanut Butter, Chocolate → High Protein 30 G Shake, Chocolate Peanut Butter, Chocolate 
    (5733, 7862),
    -- Cheese Sticks, Cheese Snack, Cheddar-Mozzarella → Cheddar-Mozzarella Cheese Sticks
    (7966, 7967),
    -- Spicy Nacho Tortilla Chips, Spicy Nacho → Doritos, Tortilla Chips, Spicy Nacho, Spicy Nacho
    (7978, 7979),
    -- Spicy Nacho Flavored Tortilla Chips, Spicy Nacho → Doritos, Tortilla Chips, Spicy Nacho, Spicy Nacho
    (7978, 12927),
    -- Dark Chocolate Almond Sea Salt Bar, Dark Chocolate Almond Se → Dark Chocolate Almond & Sea Salt Bar
    (245, 8054),
    -- Old El Paso Restaurant Style 6 Grande Flour Tortillas → Restaurant Style Flour Tortilla Grande
    (965, 8109),
    -- Fritos Flavor Twists Honey Bbq Corn Snacks  9.75 Ounce Plast → Fritos Flavor Twists Honey Bbq 2 Ounce Plastic Bag
    (8080, 8081),
    -- 100% Fruit Juice Smoothie, Amazing Mango → Bolthouse Farms, 100% Fruit Juice Smoothie, Amazing Mango, A
    (6551, 8094),
    -- Mountain Dew, Soda → mountain dew
    (457, 8128),
    -- Original Zero Net Carbs Tortillas, Original → Zero Net Carbs Original Tortillas
    (1599, 8136),
    -- Swiss Rolls Cakes → Swiss Rolls
    (8167, 8168),
    -- graham cracker → Graham Crackers
    (8192, 2448),
    -- Beef Sticks → Beef Stick
    (2698, 8245),
    -- Original Beef Stick, Original → Beef Stick
    (2698, 12327),
    -- Strawberry Granola Minis, Strawberry → Strawberry Granola Minis, Strawberry
    (8134, 8257),
    -- Large White Eggs → Food Lion, Grade A Large White Eggs
    (8303, 8302),
    -- Grade A Large White Eggs → Food Lion, Grade A Large White Eggs
    (8303, 8304),
    -- Jalapeno Flavored Kettle Cooked Potato Chips, Jalapeno → Kettle Cooked Potato Chips, Jalapeno
    (8394, 8395),
    -- Kellogg''S Froot Loops Cereal 21.7oz → Kellogg''S Froot Loops Cereal 3.1oz
    (10080, 8469),
    -- Kellogg''S Froot Loops Cereal .95oz → Kellogg''S Froot Loops Cereal 3.1oz
    (10080, 8468),
    -- Pineapple Peach Flavored Master Brew Kombucha, Pineapple Pea → Pineapple Peach Master Brew Kombucha, Pineapple Peach
    (8472, 8473),
    -- Kellogg''S, Frosted Flakes, Frosted Corn Flake Cereal → Cereal, Frosted Flakes
    (8498, 8499),
    -- caramelized onion → caramelized onions
    (948, 8518),
    -- Maple Glazed Doughnut Flavored Protein Bars, Maple Glazed Do → Maple Glazed Doughnut Flavored Protein Bar, Maple Glazed Dou
    (8546, 8547),
    -- Three Berry Blend → Three Berry Blend, Flavor, Three Berry
    (2677, 8588),
    -- Juice Cocktail, Cranberry → Ocean Spray, Cranberry Juice Cocktail
    (8585, 8586),
    -- Birthday Cake Flavor Protein Bars, Birthday Cake → Birthday Cake Flavor Protein Bar, Birthday Cake
    (8544, 8545),
    -- Great Value, 1% Low Fat Milk → 1% Lowfat Milk
    (8597, 8598),
    -- french fries wendys → Wendy''S, French Fries
    (8676, 2352),
    -- Mcdonald''S, Double Cheeseburger → Double Cheeseburger (Mcdonalds)
    (8633, 8632),
    -- Cold Brew Coffee With Almondmilk → Cold Brew Coffee With Almond Milk
    (3039, 8621),
    -- Great Value, 2% Reduced Fat Milk → Reduced Fat 2% Milk
    (8700, 8701),
    -- cream cheese bagel → Bagel with Cream Cheese
    (1602, 8731),
    -- Kiwi Strawberry Flavored Sparkling Water, Kiwi Strawberry → Sparkling Water, Kiwi Strawberry
    (8734, 8735),
    -- Original Crackers With Sea Salt, Original With Sea Salt → Original With Sea Salt Crackers, Original With Sea Salt
    (8706, 8707),
    -- Hamburger Bun → Hamburger Buns
    (8634, 8756),
    -- Kids → Sour Patch Kids
    (8833, 151),
    -- Smoked Snack Stick, Original → Original Snack Sticks, Smoked
    (8848, 8845),
    -- Original Crackers, Original → The Original Crackers, The Original
    (5252, 8904),
    -- Original Beef Jerky → Beef Jerky, Original
    (8936, 8937),
    -- Protein Bar, Chocolate Deluxe → Bar, Chocolate Deluxe
    (8965, 8966),
    -- Original Fully Cooked Pork Sausage Patties, Original → Great Value Fully Cooked Original Pork Sausage Patties
    (9008, 9005),
    -- French Vanilla Flavored Original Low Fat Yogurt, French Vani → Yoplait Original French Vanilla Low Fat Yogurt
    (8729, 8987),
    -- Sugars, Powdered → powdered sugar
    (8908, 9036),
    -- Ice Cream Bars → Ice Cream Bar
    (9070, 9071),
    -- Core Power, High Protein Milk Shake, Chocolat → Chocolate High Protein Milk Shake, Chocolate
    (9076, 2853),
    -- Chocolate Flavour High Protein Milk Shake, Chocolate → Chocolate High Protein Milk Shake, Chocolate
    (9076, 12219),
    -- Apricots, Raw → Apricot, Raw
    (5759, 9130),
    -- Figs, Raw → Fig, Raw
    (3172, 9156),
    -- Protein Bars, Chocolate Dough → Chocolate Dough Protein Bar, Chocolate Dough
    (9223, 9116),
    -- Bagel, Whole Wheat → whole wheat bagel
    (139, 9176),
    -- Grilled Chicken Breast Cutlets → Grilled Chicken Breast Cutlet
    (9245, 9246),
    -- Chunk Light Tuna In Water, Chunk Light In Water → Starkist, Chunk Light Tuna In Water
    (9348, 9347),
    -- Half And Half Coffee Creamer, Half And Half → half and half creamer
    (952, 9357),
    -- Microwave Popcorn, Butter Lovers → Act Ii, Microwave Popcorn, Butter Lovers
    (8129, 9412),
    -- Bell Peppers → bell pepper
    (754, 9420),
    -- O''Dang, Hummus Sauce → Hummus Sauce
    (9465, 9466),
    -- red bell pepper → red bell peppers
    (545, 9471),
    -- shrimp sushi roll → Sushi Roll, Shrimp
    (8722, 9494),
    -- Bread, Wheat → wheat bread
    (1835, 9508),
    -- sports drink → sport drinks
    (3636, 9562),
    -- Protein Bars → Protein Bar
    (7739, 9576),
    -- Little Duck Organics, Tiny Gummies → Tiny Gummies
    (9598, 9599),
    -- Quarter Pounder (Mcdonalds) → mcdonalds quarter pounder
    (902, 9595),
    -- Flamin'' Hot Cheese Flavored Snacks, Flamin'' Hot → Cheese Flavored Snacks, Flamin'' Hot
    (4473, 9604),
    -- Shrimp Flavor Ramen Noodle Soup, Shrimp → Shrimp Ramen Noodle Soup, Shrimp
    (9687, 8611),
    -- Sea Salt & Vinegar Flavored Kettle Cooked Potato Chips, Sea  → Sea Salt & Vinegar Kettle Cooked Potato Chips, Sea Salt & Vi
    (7230, 9651),
    -- Unsweetened Apple Fruit Puree Pouches, Unsweetened Apple → Unsweetened Apple Fruit Puree Pouch, Unsweetened Apple
    (9695, 9697),
    -- chocolate chip cookies → chocolate chip cookie
    (302, 9708),
    -- Original Mini Semisoft Cheeses, Original → Original Mini Semisoft Cheese, Original
    (9696, 9698),
    -- Gummi Worms Candy, Gummi Worms → Gummi Worms
    (9717, 9718),
    -- Fisher, Peanuts, Dry Roasted → Dry Roasted Peanuts
    (9727, 9726),
    -- Fruit Slices → Fruit Slices Candy, Fruit Slices
    (9780, 9781),
    -- Radishes, Raw → Radish, Raw
    (6715, 9803),
    -- Jelly, Concord Grape → Smucker''S, Concord Grape Jelly
    (9855, 9857),
    -- Cupcake, Red Velvet → Red Velvet Cupcake
    (9821, 9822),
    -- mozzarella → Mozzarella Cheese
    (979, 9817),
    -- Shredded Low-Moisture Part-Skim Mozzarella Cheese → Great Value, Shredded Low-Moisture Part-Skim Mozzarella Chee
    (9929, 9930),
    -- Peanut Butter Breakfast Cereal Bar, Peanut Butter → Breakfast Bar, Peanut Butter
    (9945, 9920),
    -- Cheese, Swiss → Swiss Cheese
    (9951, 7328),
    -- Zero Ultra Energy Drink → Zero Ultra Energy Drink, Zero Ultra
    (3756, 9966),
    -- Bread, Wheat, Sprouted → Bread, Sprouted Wheat
    (8718, 9965),
    -- Fast Foods, Submarine Sandwich, Sweet Onion Chicken Teriyaki → Subway, Sweet Onion Chicken Teriyaki Sub On White Bread With
    (10031, 10033),
    -- Premium Sharp Cheddar → Black Diamond, Premium Cheddar Cheese, Sharp Cheddar
    (6604, 10038),
    -- Ruffles, Potato Chips, Sour Cream & Onion, Sour Cream & Onio → Sour Cream ''n Onion Potato Chips
    (10075, 6566),
    -- Sour Cream & Onion Flavored Potato Chips, Sour Cream & Onion → Sour Cream ''n Onion Potato Chips
    (10075, 14232),
    -- M&M''S, Chocolate Candies → M&M''S, Chocolate Candy
    (10077, 10078),
    -- Chocolate Chip Flavored Soft & Chewy Protein Cookie, Chocola → Protein Cookie, Chocolate Chip
    (10328, 9214),
    -- Chocolate Chip Soft & Chewy Protein Cookies, Chocolate Chip → Protein Cookie, Chocolate Chip
    (10328, 10092),
    -- Chocolate Chip Protein Cookie, Chocolate Chip → Protein Cookie, Chocolate Chip
    (10328, 12444),
    -- Italian Enriched Bread, Italian → D''Italiano Italian Bread Enriched by D''Italiano
    (10113, 10111),
    -- Mangos, Raw → Mango, Raw
    (1953, 10106),
    -- Original Pork Sausage Patties, Original → Original Pork Sausage Patties
    (10130, 10124),
    -- Honey Ham Ultra Thin, Honey → Ultra Thin Ham, Honey
    (10122, 10127),
    -- Protein Granola Bars → Protein Granola Bar
    (10139, 10140),
    -- Cheddar Cheese Sticks, Cheddar → Crystal Farms, Cheddar Cheese Sticks
    (10131, 10132),
    -- Oikos Triple Zero Banana Creme Flavored Yogurt → Banana Creme Flavor Triple Zero Blended Greek Nonfat Yogurt,
    (10152, 10153),
    -- Hillshire Farm, Oven Roasted Turkey Breast → Oven Roasted Turkey Breast
    (10187, 10177),
    -- Pasture Raised Fresh Eggs → Pasture Raised Eggs
    (10297, 10299),
    -- ham and cheese sandwich on baguette → ham and cheese on a baguette
    (7984, 10358),
    -- Frosted Chocolate Cake With Creamy Filling, Frosted Chocolat → Frosted Chocolate Cake With Creamy Filling, Frosted Chocolat
    (4708, 10425),
    -- Snyder''S Of Hanover Pretzels, Snaps 100 Calorie Packs, 10 C → Snyder''S Of Hanover, 100 Calories Pack Snaps Pretzels
    (10376, 10377),
    -- French Bread Singles, Pepperoni Pizzas → Pepperoni French Bread Topped With Pizza Sauce, Mozzarella C
    (7999, 10478),
    -- Chicken Sausage → Chicken Sausage
    (10520, 10521),
    -- Spicy Ketchup, Spicy → Spicy Ketchup
    (10750, 10752),
    -- Baked or Broiled Cod → Fish, Cod, Baked Or Broiled
    (10765, 636),
    -- Chicken Flavor Ramen Noodles Soup, Chicken → Chicken Flavor Ramen Noodle Soup, Chicken
    (3375, 10777),
    -- Tea, Ginger → ginger tea
    (1838, 10800),
    -- Blueberry Waffles → blueberry egg waffles
    (10801, 10048),
    -- Sparkling Natural Mineral Water → S. Pellegrino, Sparkling Natural Mineral Water
    (10809, 10810),
    -- Creamy Tomato Soup, Creamy Tomato → Creamy Tomato Soup
    (10788, 10789),
    -- Simply Granola Oats, Honey, & Almonds, Oats, Honey & Almonds → Oats, Honey & Almonds Simply Granola, Oats, Honey & Almonds
    (10871, 10872),
    -- Chicken Bologna, Chicken → Chicken Bologna
    (10867, 10868),
    -- Non Fat Milk → Nonfat Milk
    (10930, 3446),
    -- Milk Chocolate Truffle Bars → Milk Chocolate Truffle Bar
    (11061, 11064),
    -- gummy bear → gummy bears
    (11035, 150),
    -- Spicy Sweet Chili Flavored Tortilla Chips, Spicy Sweet Chili → Doritos, Tortilla Chips, Spicy Sweet Chili, Spicy Sweet Chil
    (11100, 11101),
    -- Zero Sugar Original Oatmilk → Unsweetened Original Zero Sugar Non-Dairy Oatmilk, Unsweeten
    (11130, 978),
    -- Protein-Rich Shake Strawberry, Strawberry → Strawberry Protein Rich Shake
    (2037, 11193),
    -- Homestyle Baked Beans → Baked Beans
    (11180, 11181),
    -- beef tacos → beef taco
    (1641, 11254),
    -- Sliced Provolone Natural Cheese With Natural Smoke Flavor, P → Provolone Natural Cheese Slices With Smoke Flavor, Provolone
    (11248, 11321),
    -- Peanut Butter Protein Bars, Peanut Butter → Peanut Butter Protein Bar, Peanut Butter
    (3653, 11294),
    -- Hamburger (Mcdonalds) → Hamburger
    (11345, 6206),
    -- Oatmeal Creme Pies Cookies → Oatmeal Creme Pie
    (9378, 11415),
    -- Snackers - Classic Hummus with Pretzels → Classic Hummus with Pretzels
    (1324, 11422),
    -- Protein Bar, Chewy Chocolate Chip → Chewy Chocolate Chip Bar
    (11448, 1163),
    -- Chewy Chocolate Chip Bar, Chewy Chocolate Chip → Chewy Chocolate Chip Bar
    (11448, 11449),
    -- Sour Cream and Onion Pringles → Sour Cream & Onion
    (1954, 11457),
    -- Sargento, Light String Cheese → String Cheese, Light
    (9219, 11539),
    -- Cereal → Cheerios Cereal
    (3435, 11527),
    -- Maple & Brown Sugar Protein Instant Oatmeal, Maple & Brown S → Instant Oatmeal Protein - Maple Brown Sugar
    (11554, 6424),
    -- Potato Chips, Ruffled, Cheese Flavored → Cheese Flavored Potato Chips, Cheese
    (11546, 11545),
    -- fried eggs → Fried Egg
    (681, 11573),
    -- Unsweetened Vanilla Flavored Almond Milk, Unsweetened Vanill → almond milk unsweetened vanilla
    (871, 11603),
    -- Potato Popped Chip Snack, Barbeque → Popchips, Popped Chip Snack, Barbeque Potato
    (11630, 11631),
    -- Dark Chocolate Nuts & Sea Salt Bars → Dark Chocolate Nuts & Sea Salt Bar
    (2550, 11636),
    -- Berries ''N Cherries Fruit Snacks, Berries N Cherries → Fruit Snacks, Berries ''N Cherries
    (11694, 11695),
    -- turkey sausages → turkey sausage
    (1533, 11802),
    -- Chips Ahoy! Cookies Original 1x25.3 Oz → Chips Ahoy! Cookies Original 1x13 Oz
    (10234, 11839),
    -- Original Chocolate Chip Cookies, Original Chocolate Chip → Chocolate Chip Cookies, Original
    (1834, 11840),
    -- Original Real Chocolate Chip Cookies, Original → Chocolate Chip Cookies, Original
    (1834, 11842),
    -- Egg → eggs
    (15, 11848),
    -- Chicken Ramen Noodle Soup → Chicken Flavor Ramen Noodle Soup, Chicken
    (3374, 11858),
    -- Ramen Noodle Soup, Chicken → Chicken Flavor Ramen Noodle Soup, Chicken
    (3374, 13129),
    -- Hoffy, Bacon Wrapped Hot Dogs → Bacon Wrapped Hot Dogs
    (11873, 11874),
    -- 100% Whole Wheat English Muffins, 100% Whole Wheat → 100% Whole Wheat English Muffins
    (11868, 11869),
    -- Orange, Cherry, Grape Flavored Ice Pops, Orange, Cherry, Gra → Ice Pops, Orange/Cherry/Grape
    (9441, 11876),
    -- Protein Chewy Bar - Peanut, Almond & Dark Chocolate → Nature Valley Protein Peanut Butter Dark Chocolate Chewy Bar
    (11883, 1165),
    -- Apple Apricot Sauce, Apple Apricot → Santa Cruz Organic, Apple Apricot Sauce
    (11895, 11896),
    -- Honey Mustard → French''S, Honey Mustard
    (11945, 11946),
    -- pad thai chicken → chicken pad thai
    (375, 11953),
    -- Sugar Free Hazelnut Coffee Creamer → Hazelnut Flavor Sugar Free Coffee Creamer, Hazelnut
    (11960, 11959),
    -- Gummy Clusters Candy, Gummy Clusters → Gummy Clusters Candy
    (11986, 11987),
    -- Noodles, Egg, Enriched, Cooked → Egg Noodles (Enriched, Cooked)
    (8401, 12036),
    -- Mtn Dew, Code Red, Soda, With A Rush Of Cherry Flavor → Mountain Dew, Code Red, Flavored Dew Soda, Cherry, Cherry
    (12064, 12065),
    -- Cheese (Thin Crust Pizzas) → Little Caesars 14" Cheese Pizza, Thin Crust
    (12086, 10623),
    -- Creamy Peanut Butter → Creamy Peanut Butter, Creamy
    (12090, 2711),
    -- Extra Dark 70% Cocoa Chocolate Truffles, Extra Dark → Extra Dark Chocolate 70% Cocoa Truffles, Extra Dark Chocolat
    (12092, 12094),
    -- Greek Nonfat Yogurt, Plain → Kroger, Plain Nonfat Greek Yogurt, Original
    (12107, 12108),
    -- Cantaloupe Melon → cantaloupe
    (763, 12191),
    -- Bread, Rye → rye bread
    (1449, 12197),
    -- croquette → croquettes
    (12205, 12204),
    -- Banana → chiquita banana
    (3323, 12281),
    -- Apricot, Dried → dried apricots
    (1078, 12323),
    -- High Protein 30 G Shakes, Cake Batter Delight, Cake Batter D → 30 G Protein High Protein Shake, Cake Batter Delight, Cake B
    (12324, 12325),
    -- Peanut Butter Cup Flavored Protein Bars, Peanut Butter Cup → Peanut Butter Cup Flavored Protein Bar, Peanut Butter Cup
    (12350, 12351),
    -- Applesauce, Apple → Applesauce
    (12389, 12390),
    -- Tyson, Chicken Nuggets → Chicken Nuggets
    (12414, 12413),
    -- Lemon Lime Prime Hydration Drink → Lemon Lime Hydration Drink, Lemon Lime
    (12416, 12418),
    -- Boston Baked Beans Candy Coated Peanuts → Boston Baked Beans, Candy Coated Peanuts
    (12429, 12430),
    -- Cookies & Cream Bar Cake → Cookies & Cream Bar Cake Made With Oreo
    (4709, 12450),
    -- Crisp Wafers Bars, Milk Chocolate → Crisp Wafers In Milk Chocolate Bars, Crisp Wafers
    (10695, 12545),
    -- empanadas → empanada
    (102, 12556),
    -- Burger King, Double Cheeseburger → Double Cheeseburger (Burger King)
    (12600, 12601),
    -- Deluxe Macaroni & Cheese Dinner → Deluxe Macaroni & Cheese Dinner, Deluxe Macaroni & Cheese
    (12582, 12581),
    -- Peanut Butter Filling Cracker Sandwiches, Peanut Butter → Crackers, Sandwich, Peanut Butter Filled (Ritz)
    (9644, 12596),
    -- Caramel High Protein Shake, Caramel → Protein Shake, Caramel
    (5340, 12707),
    -- Sausage Snack Sticks → Sausage Snack Stick
    (12728, 12729),
    -- pizza pepperoni → pepperoni pizza
    (815, 12735),
    -- Beef Jerky, Original → Original Beef Jerky, Original
    (4348, 12789),
    -- Fruit & Nut Chewy Trail Mix Granola Bars, Fruit & Nut → Nature Valley Trail Mix Fruit & Nut Chewy Granola Bar
    (12809, 12810),
    -- Chocolate Sandwich Cookies, Chocolate → Chocolate Sandwich Cookies
    (8117, 12812),
    -- Wegmans, Creme Cake, Carrot Walnut, Carrot Walnut → Creme Cake, Carrot, Walnut
    (12869, 12870),
    -- Bubly Sparkling Water → Sparkling Water
    (10727, 12861),
    -- hotpot → hot pot
    (11740, 12907),
    -- Sports Drink, Mountain Berry Blast → Mountain Berry Blast Mixed Berry Flavored Sports Drink, Moun
    (12874, 12875),
    -- Banana & Strawberry Flavor Smoothie → Danimals Smoothie Strawberry Banana Flavor
    (12937, 12938),
    -- Smoothie, Strawberry Banana Flavor → Danimals Smoothie Strawberry Banana Flavor
    (12937, 12960),
    -- White Cheddar Flavor Popcorn, White Cheddar → Popcorn, White Cheddar
    (12878, 12879),
    -- Snack Mix, Cheese Fix → Cheese Fix Flavored Snack Mix, Cheese Fix
    (12147, 12950),
    -- StarKist Wild Caught Light Tuna in Water → Tuna, Light, Wild Caught
    (12536, 12932),
    -- Chocolate Peanut Butter Pie Keto Protein Bars, Chocolate Pea → Chocolate Peanut Butter Pie Keto Protein Bar, Chocolate Pean
    (13014, 13015),
    -- Dry Rice Noodles → Rice Noodles, Dry
    (13100, 4982),
    -- dark chocolate by Ghirardelli → Dark Chocolate
    (1006, 13150),
    -- Corn Chips → Great Value, Corn Chips
    (13157, 13156),
    -- Natural White Cheddar Cheese, Sea-Salted Roasted Almonds & D → Natural White Cheddar Cheese, Sea-Salted Roasted Almonds & D
    (13226, 13227),
    -- Shortbread Cookie → Shortbread Cookies
    (997, 13228),
    -- Buttermilk Power Cakes Flapjack & Waffle Mix, Buttermilk → Buttermilk Power Cakes Flapjack & Waffle Mix, Buttermilk
    (13205, 13204),
    -- cold brew coffee → cold brew
    (207, 13243),
    -- Sea Salt Veggie Straws Potato & Vegetable Snack, Sea Salt → Sea Salt Veggie Straws Potato & Vegetable Snack, Sea Salt Ve
    (13304, 13305),
    -- Strawberry, Blueberry, Cherry, Raspberry & Orange Fruit Flav → Fruity Snacks, Strawberry, Blueberry, Cherry, Raspberry & Or
    (13260, 13261),
    -- sushi roll → sushi rolls
    (621, 13391),
    -- Pepperoni Deep Dish Singles Pizza, Pepperoni → Singles Deep Dish Pepperoni Pizza
    (13454, 13455),
    -- sushi salmon roll → salmon sushi roll
    (239, 13461),
    -- Extra Wide Egg Noodles → 365 Everyday Value, Enriched Extra Wide Egg Noodles
    (13503, 13463),
    -- Breakfast Bowl, Bacon, Eggs, Potatoes & Cheddar Cheese → Bacon Eggs, Potatoes, Bacon & Cheddar Cheese Breakfast Bowl,
    (13420, 13516),
    -- Classic Almond Butter → Almond Butter, Classic
    (13529, 13528),
    -- Spread, Hazelnut Chocolate → Hazelnut Chocolate Spread
    (1444, 13531),
    -- Yellow Mustard, Yellow → First Street Yellow Mustard
    (13538, 13539),
    -- Sprite, Lemon-Lime Soda, Lemon-Lime  → Sprite, Lemon-Lime Soda
    (3179, 13536),
    -- Original Pretzel Crisps → Snack Factory Pretzel Crisps, Original, 7.2 Oz
    (13546, 13547),
    -- Peanut Butter Protein Bars, Peanut Butter → Peanut Butter Protein Bar, Peanut Butter
    (13587, 13588),
    -- Soft & Chewy Ropes, Cherry Punch → Sweetarts, Soft & Chewy Ropes, Cherry Punch
    (13559, 13558),
    -- Creamy Unsweetened Peanut Butter, Creamy → Unsweetened Creamy Peanut Butter, Unsweetened Creamy
    (13621, 13623),
    -- Smartfood, Popcorn, White Cheddar Cheese, White Cheddar Chee → White Cheddar Popcorn, White Cheddar
    (13613, 10877),
    -- white cheddar popcorn → White Cheddar Popcorn, White Cheddar
    (13613, 12484),
    -- Fish, Sea Bass, Mixed Species, Cooked, Dry Heat → Sea Bass (Mixed Species, Cooked, Dry Heat)
    (1744, 13607),
    -- Part Skim Mozzarella Cheese → Cheese, Mozzarella, Part Skim
    (4380, 13661),
    -- Swiss Miss Indulgent Collection Dark Chocolate Flavor Hot Co → Dark Chocolate Indulgent Collection Hot Cocoa Mix, Dark Choc
    (13764, 13763),
    -- Brown Rice Noodles, Maifun → Maifun Brown Rice Noodles
    (13744, 13785),
    -- whey isolate protein → whey protein isolate
    (11768, 13807),
    -- Whey Isolate → whey protein isolate
    (11768, 15218),
    -- Chocolate Chip Cookies, Chocolate Chip → Chocolate Chip Cookies
    (531, 13853),
    -- Minis Cookie Bars, Caramel, Milk Chocolate → Minis Cookie Bars
    (13913, 13914),
    -- The Original Corn Chips → The Original Corn Chips, Original
    (13893, 13894),
    -- Light Greek Vanilla Nonfat Yogurt, Light Greek Vanilla → Great Value, Light Greek Nonfat Yogurt, Vanilla, Vanilla
    (7160, 13904),
    -- Old Fashioned Oats, Old Fashioned → Oats, Old Fashioned, 100% Wole Grain, Rolled
    (686, 13921),
    -- Orange Mango Unsweetened Sparkling Water, Orange Mango → Sparkling Water, Orange Mango
    (13963, 13964),
    -- Peanut Butter, Extra Crunchy → Extra Crunchy Peanut Butter
    (13991, 13992),
    -- Unflavored Whey Protein Isolate Protein Powder, Unflavored → Unflavored Whey Protein Isolate Protein Powder
    (13984, 4780),
    -- Crunchy Granola Bars → Granola Bars, Crunchy
    (14034, 14035),
    -- Hickory Smoked Canadian Bacon, Hickory Smoked → Hickory Smoked Canadian Bacon
    (14046, 14047),
    -- Kitchen Accomplice, Beef Stock Concentrate → Beef Stock Concentrate
    (14005, 14008),
    -- Italian Style Mini Meatballs → Mini Italian-Style Meatballs
    (14053, 14057),
    -- Almond Creamer, Vanilla → Vanilla Almond Creamer
    (8846, 14139),
    -- Nature Valley Oats & Dark Chocolate Protein Granola Cereal → Protein Granola, Oats & Dark Chocolate
    (1989, 14107),
    -- Cheese, Colby Jack → Colby Jack Cheese
    (14162, 7085),
    -- Crunchy Peanut Butter Spread → Jif, Crunchy Peanut Butter Spread
    (14169, 14170),
    -- Flavored Juice Drink, Kiwi Strawberry → Kiwi Strawberry Flavored Juice Drink, Kiwi Strawberry
    (12943, 14175),
    -- Lemon Protein Bars, Lemon → Lemon Protein Bar, Lemon
    (14215, 14216),
    -- Fruit Punch Flavor Energy Drink, Fruit Punch → Fruit Punch Energy Drink, Fruit Punch
    (14206, 14207),
    -- Green Tea With Ginseng And Honey → Arizona, Green Tea With Ginseng And Honey
    (14198, 14199),
    -- 100% Juice, Apple → Mott''S, 100% Apple Juice, Original
    (14217, 13897),
    -- Original French Vanilla Creme Protein Energy Bar → Protein Energy Bar, Original French Vanilla Creme
    (14235, 14236),
    -- Vanilla Shake → vanilla shake by In-N-Out
    (14265, 14260),
    -- Vanilla Icelandic Style Skyr Strained Nonfat Yogurt, Vanilla → Vanilla Icelandic Style Skyr Strained Non-Fat Yogurt, Vanill
    (6377, 14255),
    -- ny pizza slice → new york pizza slice
    (2638, 14295),
    -- Egg Sandwich On Biscuit, With Sausage → sausage and egg biscuit
    (9702, 14303),
    -- Strawberry Jam, Strawberry → Strawberry Jam
    (14336, 14337),
    -- Pepper Jack Natural Cheese, Honey Roasted Peanuts & Raisins  → Balanced Breaks Pepper Jack Natural Cheese, Honey Roasted Pe
    (13769, 14415),
    -- Matcha Iced Latte with Skim Milk - Medium → Matcha Iced Latte with Skim Milk - Medium
    (14430, 14429),
    -- Crisp Chicken Burrito → Crisp Chicken Burrito
    (14505, 14504),
    -- Chili Cheese Flavored Corn Chips, Chili Cheese → Fritos, Corn Chips, Chili Cheese, Chili Cheese
    (11691, 14506),
    -- Rotisserie Seasoned Chicken Breast With Rib Meat Ultra-Thin  → Chicken Breast With Rotisserie Style Seasonings With Rib Mea
    (14488, 14489),
    -- Half & Half Iced Tea Lemonade, Lite → Lite Half & Half Iced Tea Lemonade
    (14534, 14536),
    -- avocado egg breakfast sandwich → egg avocado breakfast sandwich
    (14370, 14563),
    -- Chocolatey Delight Flavored Crunchy Rice & Wheat Flakes With → Chocolatey Delight Flavored Crunchy Wheat & Rice Flakes With
    (13448, 14574),
    -- Double Chocolate Flavor Plant-Based Protein Shake, Double Ch → Evolve Plant-Based Protein Shake Double Chocolate
    (14593, 14594),
    -- Evolve Protein Shake, Double Chocolate → Evolve Plant-Based Protein Shake Double Chocolate
    (14593, 14858),
    -- Strawberry Flavored Ready-To-Drink Meal, Strawberry → Strawberry Drink Meal, Strawberry
    (14649, 14650),
    -- Original Meal Replacement Shake, Creamy Milk Chocolate → Creamy Milk Chocolate Flavored Original Meal Replacement Sha
    (14604, 14605),
    -- Chocolate Flavored Protein Shake, Chocolate → Chocolate Protein Shake, Chocolate
    (14597, 14598),
    -- Old Wisconsin, Snack Bites Beef Sausage → Beef Bites Sausage, Beef
    (9410, 14681),
    -- Brownies, Chocolate Fudge Brownie → Chocolate Fudge Brownie
    (14573, 14765),
    -- Brownies, Chocolate Fudge → Chocolate Fudge Brownie
    (14573, 14812),
    -- Empire Apples, Empire → Empire Apples
    (14783, 14787),
    -- Original Recipe Ghee Clarified Butter, Original Recipe → Ghee Butter, Original Recipe
    (14813, 13497),
    -- Peanuts, Raw → raw peanuts
    (7167, 14853),
    -- Lucky 7 Multigrain Sourdough → Lucky 7 Multigrain Sourdough, Lucky 7 Multigrain
    (14862, 14917),
    -- Golden Grahams Cereal → Golden Grahams Cereal
    (14920, 14921),
    -- oats (dry) → dry oats
    (70, 14907),
    -- Ghee Clarified Butter, Himalayan Pink Salt → Himalayan Pink Salt Ghee Clarified Butter, Himalayan Pink Sa
    (14919, 14937),
    -- Unflavored Zero Carb Protein Powder → Zero Carb Protein Powder, Unflavored, Unflavored
    (3686, 14999),
    -- Wonton Strips, Wonton → Wonton Strips
    (14889, 14890),
    -- Whole Vitamin D Milk → Kroger, Vitamin D Whole Milk, Grade A
    (15022, 15023),
    -- Root Beer → Barq''S, Root Beer Soda
    (15100, 15101),
    -- parsnip → Parsnips
    (15074, 752),
    -- Wonderful brand pistachios → Wonderful Pistachios
    (12746, 15109),
    -- Mini Pretzels Snacks → Mini Pretzels
    (15139, 15140),
    -- Vanilla Bean Whey Protein Powder Blend, Vanilla Bean → Whey Protein Powder Blend, Vanilla Bean
    (758, 15146),
    -- Brownie Batter Protein Bar Puffs, Brownie Batter → Brownie Batter Puff Protein Bars
    (357, 15160),
    -- Plain Crepe → Crepe, Plain
    (2647, 15237),
    -- Coke → Cola
    (2968, 15232)
  ) AS p(keep_id, drop_id) LOOP
    IF NOT EXISTS (SELECT 1 FROM public."FoodItem" WHERE id = pair.keep_id)
       OR NOT EXISTS (SELECT 1 FROM public."FoodItem" WHERE id = pair.drop_id)
       OR EXISTS (SELECT 1 FROM public."FoodItem" k, public."FoodItem" d WHERE k.id = pair.keep_id AND d.id = pair.drop_id
                  AND k.gtin IS NOT NULL AND d.gtin IS NOT NULL AND k.gtin <> d.gtin)
       OR EXISTS (SELECT 1 FROM public."LoggedFoodItem" l JOIN public."Message" m ON m.id = l."messageId"
                  WHERE l."foodItemId" = pair.drop_id AND m."activeOperationId" IS NOT NULL)
    THEN skipped := skipped + 1; CONTINUE; END IF;
    INSERT INTO public."CatalogueAuditBackup"(audit, "tableName", "rowId", before)
      SELECT 'A12_name_duplicate_merge', 'LoggedFoodItem', l.id,
        pg_catalog.jsonb_build_object('foodItemId', l."foodItemId", 'servingId', l."servingId", 'mergedInto', pair.keep_id)
      FROM public."LoggedFoodItem" l WHERE l."foodItemId" = pair.drop_id;
    PERFORM public.merge_catalogue_food(pair.keep_id, pair.drop_id, 'A12_name_duplicate_merge');
    merged := merged + 1;
  END LOOP;
  RAISE NOTICE 'A12: % foods merged, % skipped', merged, skipped;
END
$merge$;
NOTIFY pgrst, 'reload schema';
