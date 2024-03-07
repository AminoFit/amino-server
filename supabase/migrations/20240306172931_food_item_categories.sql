alter table "public"."FoodItem" add column "foodItemCategoryID" text;

alter table "public"."FoodItem" add column "foodItemCategoryName" text;

set check_function_bodies = off;

CREATE OR REPLACE FUNCTION public.calculate_user_streak(user_id uuid)
 RETURNS TABLE(localdate date, dailycount integer)
 LANGUAGE plpgsql
AS $function$
DECLARE
    user_tz text;
BEGIN
    -- Retrieve user's timezone
    SELECT "tzIdentifier" INTO user_tz FROM public."User" WHERE id = user_id;

    -- Return the filtered and counted logged food items
    RETURN QUERY SELECT
        ("consumedOn" AT TIME ZONE 'UTC' AT TIME ZONE user_tz)::date AS localDate,
        COUNT(*) AS dailyCount
    FROM public."LoggedFoodItem"
    WHERE "userId" = user_id AND "deletedAt" IS NULL
    GROUP BY localDate
    HAVING COUNT(*) > 0
    ORDER BY localDate DESC;
END;
$function$
;


