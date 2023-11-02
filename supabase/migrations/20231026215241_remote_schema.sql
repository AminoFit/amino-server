set check_function_bodies = off;

CREATE OR REPLACE FUNCTION public.get_cosine_results(p_embedding_cache_id integer)
 RETURNS TABLE(id integer, name text, brand text, embedding text, cosine_similarity double precision)
 LANGUAGE sql
AS $function$
    SELECT 
        id, 
        name, 
        brand, 
        "bgeBaseEmbedding"::text AS embedding,
        1 - ("bgeBaseEmbedding" <=> (SELECT "bgeBaseEmbedding" FROM "foodEmbeddingCache" WHERE id = p_embedding_cache_id)) AS cosine_similarity 
    FROM "FoodItem" 
    WHERE "bgeBaseEmbedding" IS NOT NULL 
    ORDER BY cosine_similarity DESC 
    LIMIT 5
$function$
;


