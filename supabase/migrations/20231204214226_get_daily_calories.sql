-- Function to calculate total daily calories for the authenticated user
CREATE OR REPLACE FUNCTION public.get_daily_calories(log_date DATE)
RETURNS TABLE(
    user_id UUID,
    consumed_date DATE,
    total_calories DOUBLE PRECISION
) LANGUAGE sql SECURITY DEFINER STABLE AS $$
SELECT 
    lfi."userId",
    DATE(lfi."consumedOn") AS consumed_date,
    SUM((lfi.grams / NULLIF(fi."defaultServingWeightGram", 0)) * fi."kcalPerServing") AS total_calories
FROM 
    public."LoggedFoodItem" lfi
JOIN 
    public."FoodItem" fi ON lfi."foodItemId" = fi.id
WHERE 
    lfi."userId" = auth.uid() AND
    DATE(lfi."consumedOn") = log_date
GROUP BY 
    lfi."userId", 
    DATE(lfi."consumedOn");
$$;