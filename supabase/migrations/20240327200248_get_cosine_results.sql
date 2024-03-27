drop function if exists "public"."get_cosine_results"(p_embedding_cache_id integer, amount_of_results integer);

set check_function_bodies = off;

CREATE OR REPLACE FUNCTION public.get_cosine_results(
    p_embedding_cache_id INTEGER,
    amount_of_results INTEGER DEFAULT 5
)
RETURNS TABLE (
    id INTEGER,
    name TEXT,
    brand TEXT,
    "foodInfoSource" TEXT,
    "externalId" TEXT,
    embedding TEXT,
    cosine_similarity DOUBLE PRECISION
)
LANGUAGE plpgsql
AS $function$
BEGIN
    RETURN QUERY
    SELECT
        FI.id,
        FI.name,
        FI.brand,
        FI."foodInfoSource"::TEXT,  -- Cast to TEXT
        FI."externalId",
        FI."bgeBaseEmbedding"::TEXT AS embedding,
        1 - (FI."bgeBaseEmbedding" <=> (SELECT FEC."bgeBaseEmbedding" FROM "foodEmbeddingCache" FEC WHERE FEC.id = p_embedding_cache_id)) AS cosine_similarity
    FROM
        "FoodItem" FI
    WHERE
        FI."bgeBaseEmbedding" IS NOT NULL
    ORDER BY
        cosine_similarity DESC
    LIMIT
        amount_of_results;
END;
$function$;

