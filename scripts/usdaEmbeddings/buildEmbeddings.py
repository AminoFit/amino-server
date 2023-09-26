import asyncio
from prisma import Prisma
from FlagEmbedding import FlagModel
import numpy as np
import time
import json

model = FlagModel('BAAI/bge-base-en-v1.5', use_fp16=False)

def vector_to_sql(value):
    return '{' + ','.join(map(str, value)) + '}'

def construct_sentence(item):
    if item['foodBrand']:
        return f"{item['foodName']} - {item['foodBrand']}"
    elif item['brandOwner']:
        return f"{item['foodName']} - {item['brandOwner']}"
    else:
        return item['foodName']

async def update_db(prisma, item, embedding):
    embedding_sql = vector_to_sql(embedding.tolist())
    food_name = item['foodName'].replace("'", "''")  # Escape single quotes for SQL
    food_brand = item.get('foodBrand', '').replace("'", "''")  # Handle NULL and escape single quotes
    brand_owner = item.get('brandOwner', '').replace("'", "''")  # Handle NULL and escape single quotes

    food_brand_condition = f"(\"foodBrand\" IS NULL AND '{food_brand}' IS NULL) OR \"foodBrand\" = '{food_brand}'"
    brand_owner_condition = f"(\"brandOwner\" IS NULL AND '{brand_owner}' IS NULL) OR \"brandOwner\" = '{brand_owner}'"

    sql_query = f"""
    UPDATE "UsdaFoodItemEmbedding"
    SET "bgeEmbedding" = '{embedding_sql}'::float[]
    WHERE "foodName" = '{food_name}'
    AND ({food_brand_condition})
    AND ({brand_owner_condition})
    RETURNING "foodName", "fdcId", "bgeEmbedding"::text;
    """

    updated_rows = await prisma.query_raw(sql_query)
    if (updated_rows is []):
        print("No rows updated.")
        print(sql_query)
        # for row in updated_rows:
        #     print(f"foodName: {row['foodName']}, fdcId: {row['fdcId']}, bgeEmbedding: {json.dumps(row['bgeEmbedding'])}")
        # proceed = input("Proceed? (y/n): ")
        # if proceed.lower() != 'y':
        #     print("Operation aborted.")
        #     return
    # else:
    #     print("No rows updated.")
    return updated_rows  # Returning the updated rows for further inspection, if needed


async def update_db_fdcId(prisma, item, embedding):
    embedding_sql = vector_to_sql(embedding.tolist())
    result = await prisma.query_raw(
        f"""
        UPDATE "UsdaFoodItemEmbedding"
        SET "bgeEmbedding" = '{embedding_sql}'::float[]
        WHERE "fdcId" = {item['fdcId']}
        """
    )

async def main():
    prisma = Prisma()
    await prisma.connect()

    total_rows = await prisma.query_raw("SELECT COUNT(*) FROM \"UsdaFoodItemEmbedding\"")
    total_rows = total_rows[0]['count']

    rows_with_embedding = await prisma.query_raw("SELECT COUNT(*) FROM \"UsdaFoodItemEmbedding\" WHERE \"bgeEmbedding\" IS NOT NULL")
    rows_with_embedding = rows_with_embedding[0]['count']
    
    print(f"Total rows: {total_rows}")
    print(f"Rows with embeddings: {rows_with_embedding}")

    batch_size = 128
    batches_processed = 0
    start_time = time.time()

    while True:
        try:
            current_time = time.time()
            elapsed_time = current_time - start_time
            #AND "foodBrand" ILIKE '%%'
            items_without_embeddings = await prisma.query_raw(
                f"""
                SELECT "fdcId", "foodName", "foodBrand", "brandOwner", CAST("bgeEmbedding" AS text)
                FROM "UsdaFoodItemEmbedding"
                WHERE "bgeEmbedding" IS NULL
                ORDER BY 
                    CASE
                        WHEN "foodBrand" IS NOT NULL THEN 1
                        WHEN "brandOwner" IS NOT NULL THEN 2
                        ELSE 3
                    END,
                    "foodName" ASC
                LIMIT {batch_size}
                """
            )

            if not items_without_embeddings:
                print("\nCompleted.")
                break
            # De-duplicate items based on "foodName", "foodBrand", and "brandOwner"
            unique_items = {}
            for item in items_without_embeddings:
                key = (item['foodName'], item.get('foodBrand', None), item.get('brandOwner', None))
                existing_item = unique_items.get(key, None)
                if existing_item is None or existing_item['fdcId'] < item['fdcId']:
                    unique_items[key] = item

            # Construct sentences and get embeddings for unique items
            sentences = [construct_sentence(item) for item in unique_items.values()]
            embeddings = model.encode(sentences)

            # Update the DB
            update_tasks = [
                update_db(prisma, item, embedding)
                for item, embedding in zip(unique_items.values(), embeddings)
            ]
            await asyncio.gather(*update_tasks)

            batches_processed += 1
            avg_time_per_batch = elapsed_time / batches_processed
            remaining_rows = total_rows - (rows_with_embedding + batch_size * batches_processed)
            estimated_time_remaining = avg_time_per_batch * (remaining_rows / batch_size)

            hours, remainder = divmod(int(estimated_time_remaining), 3600)
            minutes, seconds = divmod(remainder, 60)

            progress = round((rows_with_embedding + batch_size * batches_processed) / total_rows * 100, 2)

            print(f"\rProgress: {progress}% | Estimated time remaining: {hours}h {minutes}m {seconds}s", end='', flush=True)
        except Exception as e:
            print(f"\rAn error occurred: {e}")

    await prisma.disconnect()


asyncio.run(main())
