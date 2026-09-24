-- The old taxonomy assigned F-8-3 to both Celery and Tomatoes. Preserve Celery
-- rows and move only rows that were explicitly labelled Tomatoes.
update public."FoodItem"
set "foodItemCategoryID" = 'F-8-11'
where "foodItemCategoryID" = 'F-8-3'
  and "foodItemCategoryName" = 'Tomatoes';
