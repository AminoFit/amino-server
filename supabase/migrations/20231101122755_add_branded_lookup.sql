set check_function_bodies = off;

CREATE OR REPLACE FUNCTION public.get_branded_usda_embedding("embeddingId" integer)
 RETURNS TABLE("fdcId" integer, "foodName" text, "foodBrand" text, "bgeBaseEmbedding" text, "cosineSimilarity" double precision)
 LANGUAGE sql
AS $function$
    SELECT 
              "fdcId", 
              "foodName", 
              "foodBrand", 
              "bgeBaseEmbedding"::text, 
              1 - ("bgeBaseEmbedding" <=> (SELECT "bgeBaseEmbedding" FROM "foodEmbeddingCache" WHERE id = "embeddingId")) AS "cosineSimilarity" 
          FROM 
              "UsdaFoodItemEmbedding" 
          WHERE 
              "foodBrand" IS NOT NULL
              AND "bgeBaseEmbedding" is not null
          ORDER BY 
          ("bgeBaseEmbedding" <#> (SELECT "bgeBaseEmbedding" FROM "foodEmbeddingCache" 
          WHERE id = "embeddingId")) ASC
          LIMIT 5
$function$
;


CREATE OR REPLACE FUNCTION public.get_unbranded_usda_embedding("embeddingId" integer)
 RETURNS TABLE("fdcId" integer, "foodName" text, "foodBrand" text, "bgeBaseEmbedding" text, "cosineSimilarity" double precision)
 LANGUAGE sql
AS $function$
    SELECT 
              "fdcId", 
              "foodName", 
              "foodBrand", 
              "bgeBaseEmbedding"::text, 
              1 - ("bgeBaseEmbedding" <=> (SELECT "bgeBaseEmbedding" FROM "foodEmbeddingCache" WHERE id = "embeddingId")) AS "cosineSimilarity" 
          FROM 
              "UsdaFoodItemEmbedding" 
          WHERE 
              "foodBrand" IS NULL OR "foodBrand" = ''
              AND "bgeBaseEmbedding" is not null
          ORDER BY 
          ("bgeBaseEmbedding" <#> (SELECT "bgeBaseEmbedding" FROM "foodEmbeddingCache" 
          WHERE id = "embeddingId")) ASC
          LIMIT 5
$function$
;


