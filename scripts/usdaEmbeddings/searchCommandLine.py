import asyncio
from FlagEmbedding import FlagModel
from prisma import Prisma
import time

model = FlagModel('BAAI/bge-base-en-v1.5', use_fp16=False)

async def search_similar_foods(prisma, sentence):
    embedding = model.encode([sentence])[0]
    embedding_list = embedding.tolist()

    similar_foods = await prisma.query_raw(
    """
    WITH ranked_foods AS (
      SELECT DISTINCT ON ("foodName", "foodBrand", "brandOwner")
        "fdcId",
        "foodName",
        "foodBrand",
        "brandOwner",
        1 - ("bgeEmbedding" <=> $1::vector) AS cosine_similarity
      FROM "UsdaFoodItemEmbedding"
      WHERE "bgeEmbedding" IS NOT NULL
      AND "foodBrand" <> ''
      AND "largestFdcId" IS TRUE
      ORDER BY "foodName", "foodBrand", "brandOwner", "fdcId" DESC
    )
    SELECT "fdcId", "foodName", "foodBrand", "brandOwner", cosine_similarity
    FROM ranked_foods
    ORDER BY cosine_similarity DESC
    LIMIT 5;
    """,
    embedding_list
    )



    return similar_foods

async def search_similar_foods_inner(prisma, sentence):
    embedding = model.encode([sentence])[0]
    embedding_list = embedding.tolist()

    similar_foods = await prisma.query_raw(
        """
        WITH ranked_foods AS (
          SELECT 
            "fdcId",
            "foodName",
            "foodBrand",
            "brandOwner",
            ("bgeEmbedding" <#> $1::vector) * -1 AS cosine_similarity,
            RANK() OVER (PARTITION BY "foodName", "foodBrand", "brandOwner" ORDER BY (("bgeEmbedding" <#> $1::vector) * -1) DESC, "fdcId" DESC) AS rnk
          FROM "UsdaFoodItemEmbedding"
          WHERE "bgeEmbedding" IS NOT NULL
          AND "foodBrand" <> ''
        )
        SELECT "fdcId", "foodName", "foodBrand", "brandOwner", cosine_similarity
        FROM ranked_foods
        WHERE rnk = 1
        ORDER BY cosine_similarity DESC
        LIMIT 5;
        """,
        embedding_list
    )
    return similar_foods


async def search_similar_foods_not_unique(prisma, sentence):
    embedding = model.encode([sentence])[0]
    embedding_list = embedding.tolist()
    
    similar_foods = await prisma.query_raw(
        """
        SELECT "fdcId", "foodName", "foodBrand", "brandOwner", 1 - ("bgeEmbedding" <=> $1::vector) AS cosine_similarity, "bgeEmbedding"::text 
        FROM "UsdaFoodItemEmbedding"
        WHERE "bgeEmbedding" IS NOT NULL
        AND "foodBrand" <> ''
        ORDER BY cosine_similarity DESC
        LIMIT 5
        """,
        embedding_list
    )
    return similar_foods


async def main():
    prisma = Prisma()
    await prisma.connect()

    while True:
        search_term = input("\nEnter a search term (or type 'exit' to quit): ")
        
        if search_term.lower() == 'exit':
            break
        
        start_time = time.time()
        similar_foods = await search_similar_foods(prisma, search_term)
        elapsed_time = time.time() - start_time
        
        print(f"\nTop 5 similar foods(search took {elapsed_time:.3f} s):")
        for i, food in enumerate(similar_foods):
            print(f"{i+1}. {food['fdcId']} {food['foodName']} (Brand: {food.get('foodBrand', 'N/A')}, Owner: {food.get('brandOwner', 'N/A')}, Similarity: {food['cosine_similarity']})")
    
    await prisma.disconnect()

if __name__ == '__main__':
    asyncio.run(main())
