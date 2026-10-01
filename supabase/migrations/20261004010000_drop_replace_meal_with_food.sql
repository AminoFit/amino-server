-- Logged meals are never rewritten when a recipe is saved from them (owner, 2026-09-30): "change this meal to 1
-- portion" is gone, and with it the function that replaced a meal's rows.
DROP FUNCTION IF EXISTS public.replace_meal_with_food(uuid, integer, integer[], jsonb);
NOTIFY pgrst, 'reload schema';
