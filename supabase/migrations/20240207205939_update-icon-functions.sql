drop function if exists "public"."get_top_foodicon_embedding_similarity"(food_item_id integer);

set check_function_bodies = off;

CREATE OR REPLACE FUNCTION public.get_top_foodimage_foodid_similarity(food_item_id integer)
 RETURNS TABLE(food_icon_id integer, cosine_similarity double precision)
 LANGUAGE sql
AS $function$
    SELECT 
        fi.id AS food_icon_id, 
        1 - (fi."bgeBaseEmbedding" <=> (SELECT "bgeBaseEmbedding" FROM "FoodItem" WHERE id = food_item_id)) AS cosine_similarity
    FROM "FoodImage" fi
    WHERE fi."bgeBaseEmbedding" IS NOT NULL 
    ORDER BY cosine_similarity DESC 
    LIMIT 5
$function$
;


