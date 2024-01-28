set check_function_bodies = off;

CREATE OR REPLACE FUNCTION public.get_cosine_similarity_results(p_embedding_cache_id uuid, amount_of_results integer DEFAULT 5)
 RETURNS TABLE(id uuid, name text, brand text, embedding text, cosine_similarity double precision)
 LANGUAGE plpgsql
AS $function$
BEGIN
    RETURN QUERY
    SELECT 
        id, 
        name, 
        brand, 
        "bgeBaseEmbedding"::text AS embedding,
        1 - ("bgeBaseEmbedding" <=> (SELECT "bgeBaseEmbedding" 
                                     FROM "foodEmbeddingCache" 
                                     WHERE id = p_embedding_cache_id)) AS cosine_similarity 
    FROM 
        "FoodItem" 
    WHERE 
        "bgeBaseEmbedding" IS NOT NULL 
    ORDER BY 
        cosine_similarity DESC 
    LIMIT 
        amount_of_results;
END;
$function$
;


