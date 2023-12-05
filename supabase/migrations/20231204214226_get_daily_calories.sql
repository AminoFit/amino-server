CREATE OR REPLACE FUNCTION public.get_daily_calories(log_date DATE, user_timezone TEXT)
RETURNS TABLE(
    userId UUID,
    consumed_date DATE,
    total_calories DOUBLE PRECISION,
    calorie_goal INTEGER
) LANGUAGE sql STABLE AS $$
WITH time_zone_adjustments AS (
    SELECT
        log_date AT TIME ZONE user_timezone AS start_of_day,
        (log_date + INTERVAL '1 day') AT TIME ZONE user_timezone - INTERVAL '1 second' AS end_of_day
)
SELECT 
    lfi."userId",
    DATE(lfi."consumedOn") AS consumed_date,
    SUM((lfi.grams / NULLIF(fi."defaultServingWeightGram", 0)) * fi."kcalPerServing") AS total_calories,
    u."calorieGoal"
FROM 
    public."LoggedFoodItem" lfi
JOIN 
    public."FoodItem" fi ON lfi."foodItemId" = fi.id
JOIN
    public."User" u ON lfi."userId" = u.id,
    time_zone_adjustments
WHERE 
    lfi."userId" = auth.uid()
    AND lfi."consumedOn" AT TIME ZONE 'UTC' >= time_zone_adjustments.start_of_day
    AND lfi."consumedOn" AT TIME ZONE 'UTC' < time_zone_adjustments.end_of_day
GROUP BY 
    lfi."userId", 
    DATE(lfi."consumedOn"),
    u."calorieGoal";
$$;
