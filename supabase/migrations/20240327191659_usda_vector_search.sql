set check_function_bodies = off;

CREATE OR REPLACE FUNCTION public.search_usda_database(embedding_id integer, limit_amount integer DEFAULT 5)
 RETURNS TABLE("fdcId" integer, "foodName" text, "foodBrand" text, "brandOwner" text, "cosineSimilarity" double precision)
 LANGUAGE plpgsql
AS $function$
BEGIN
    RETURN QUERY
    SELECT
        u."fdcId",
        u."foodName",
        u."foodBrand",
        u."brandOwner",
        1 - (u."bgeBaseEmbedding" <=> (SELECT "bgeBaseEmbedding" FROM "foodEmbeddingCache" WHERE id = embedding_id)) AS "cosineSimilarity"
    FROM
        "UsdaFoodItemEmbedding" u
    WHERE
        u."foodBrand" IS NOT NULL
        AND u."bgeBaseEmbedding" IS NOT NULL
    ORDER BY
        (u."bgeBaseEmbedding" <#> (SELECT "bgeBaseEmbedding" FROM "foodEmbeddingCache" WHERE id = embedding_id)) ASC
    LIMIT limit_amount;
END;
$function$
;


