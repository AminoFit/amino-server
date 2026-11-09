-- USDA vector search gets an index back: IVFFlat at half precision.
--
-- The full-precision HNSW index on "UsdaFoodItemEmbedding"."bgeBaseEmbedding"
-- (about 1.9 GB) was dropped on 2026-11-08 to shrink the database before the
-- Postgres 17 upgrade, which left search_usda_database scanning all 470k
-- embeddings (about 25 s per search). With that index, the 26 searches since
-- 2026-10-27 averaged about 1 s.
--
-- Not HNSW again: on this 1 GB instance a half-precision HNSW graph (about
-- 1 GB to build) didn't fit in memory, and the build slowed to ~40 rows/s
-- waiting on disk (cancelled after 11 min at 171k of 470k rows). IVFFlat
-- clusters the rows into lists and builds in minutes with little memory; a
-- search reads the `probes` nearest lists (25 of 690, about 17k rows).
-- Checked against an exact scan on 6 cached queries: 10 probes found 26 of
-- the 30 true top-5 rows (~90 ms); 25 probes found all of them (~250 ms).
-- pgvector 0.8.2 (installed with the upgrade) indexes halfvec: 2 bytes per
-- dimension instead of 4. The function still reports the similarity at full
-- precision.
--
-- The query vector is read once into a variable, so the ORDER BY is a plain
-- parameter the planner can hand to the index.
--
-- Run with psql outside a transaction, so the build can outlast the role's
-- statement timeout. It blocks writes to "UsdaFoodItemEmbedding" while it
-- runs (nothing writes to it); reads go on.

SET statement_timeout = 0;
SET maintenance_work_mem = '256MB';

CREATE INDEX IF NOT EXISTS "UsdaFoodItemEmbedding_bgeBaseEmbedding_ivf_idx"
  ON public."UsdaFoodItemEmbedding"
  USING ivfflat (("bgeBaseEmbedding"::halfvec(768)) halfvec_ip_ops)
  WITH (lists = 690);

CREATE OR REPLACE FUNCTION public.search_usda_database(embedding_id integer, limit_amount integer DEFAULT 5)
 RETURNS TABLE("fdcId" integer, "foodName" text, "foodBrand" text, "brandOwner" text, "cosineSimilarity" double precision)
 LANGUAGE plpgsql
 SET search_path = public, extensions
 SET ivfflat.probes = 25
AS $function$
DECLARE
    query_embedding vector(768);
BEGIN
    SELECT c."bgeBaseEmbedding" INTO query_embedding
    FROM "foodEmbeddingCache" c
    WHERE c.id = embedding_id;

    IF query_embedding IS NULL THEN
        RETURN;
    END IF;

    RETURN QUERY
    SELECT
        u."fdcId",
        u."foodName",
        u."foodBrand",
        u."brandOwner",
        1 - (u."bgeBaseEmbedding" <=> query_embedding) AS "cosineSimilarity"
    FROM
        "UsdaFoodItemEmbedding" u
    WHERE
        u."foodBrand" IS NOT NULL
        AND u."bgeBaseEmbedding" IS NOT NULL
    ORDER BY
        (u."bgeBaseEmbedding"::halfvec(768)) <#> (query_embedding::halfvec(768))
    LIMIT limit_amount;
END;
$function$;

ANALYZE public."UsdaFoodItemEmbedding";
