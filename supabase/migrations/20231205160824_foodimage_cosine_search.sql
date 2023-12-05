set check_function_bodies = off;

CREATE OR REPLACE FUNCTION public.get_top_foodimage_embedding_similarity(p_embedding_cache_id integer)
 RETURNS TABLE(food_image_id integer, image_description text, cosine_similarity double precision)
 LANGUAGE sql
AS $function$
    SELECT 
        fi.id AS food_image_id, 
        fi."imageDescription" AS image_description,
        1 - (fi."bgeBaseEmbedding" <=> (SELECT "bgeBaseEmbedding" FROM "foodEmbeddingCache" WHERE id = p_embedding_cache_id)) AS cosine_similarity
    FROM "FoodImage" fi
    WHERE fi."bgeBaseEmbedding" IS NOT NULL 
    ORDER BY cosine_similarity DESC 
    LIMIT 5
$function$
;