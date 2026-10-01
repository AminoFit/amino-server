-- Recipes are thought of in portions only (owner, 2026-09-30): the "whole recipe" serving goes. A log that used it
-- keeps its grams and unit text (LoggedFoodItem.servingId is ON DELETE SET NULL).
DELETE FROM public."Serving" s USING public."FoodItem" f
  WHERE f.id = s."foodItemId" AND f."recipePortions" IS NOT NULL AND s."servingName" = 'whole recipe';
