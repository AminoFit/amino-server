import asyncio
import asyncpg
from FlagEmbedding import FlagModel
import numpy as np
import time
from dotenv import load_dotenv
import os
from urllib.parse import urlparse, urlunparse
import tqdm


# Load environment variables from .env file
load_dotenv(dotenv_path="prisma/.env")

# Fetch the DATABASE_URL from environment variables
DATABASE_URL = os.getenv("DATABASE_URL")

model = FlagModel('BAAI/bge-base-en-v1.5', use_fp16=False)
columnNameEmbedding = 'bgeBaseEmbedding'

def vector_to_sql(value):
    return '[' + ','.join(map(str, value)) + ']'

def construct_sentence(item):
    if item['foodBrand']:
        return f"{item['foodName']} - {item['foodBrand']} - {item['brandOwner']}"
    elif item['brandOwner']:
        return f"{item['foodName']} - {item['brandOwner']}"
    else:
        return item['foodName']
    
# async def batch_update_db(conn, items_with_embeddings):
#     sql_queries = []
#     for item, embedding in items_with_embeddings:
#         embedding_sql = vector_to_sql(embedding.tolist())
#         food_name = item['foodName'].replace("'", "''")
#         food_brand = item.get('foodBrand', '').replace("'", "''")
#         brand_owner = item.get('brandOwner', '').replace("'", "''")
        
#         food_brand_condition = f"(\"foodBrand\" IS NULL AND '{food_brand}' IS NULL) OR \"foodBrand\" = '{food_brand}'"
#         brand_owner_condition = f"(\"brandOwner\" IS NULL AND '{brand_owner}' IS NULL) OR \"brandOwner\" = '{brand_owner}'"

#         sql_query = f"""
#         UPDATE "UsdaFoodItemEmbedding"
#         SET "{columnNameEmbedding}" = '{embedding_sql}'::float[]
#         WHERE "foodName" = '{food_name}'
#         AND ({food_brand_condition})
#         AND ({brand_owner_condition});
#         """
#         sql_queries.append(sql_query)

#     # Join all the update statements and execute them in one transaction
#     combined_sql = "\n".join(sql_queries)
    
#     combined_sql = "\n".join(sql_queries)
#     await conn.execute(combined_sql)
    

async def batch_update_db_prepared(conn, items_with_embeddings):
    items_with_embeddings_list = list(items_with_embeddings)
    # print(f"Updating {len(items_with_embeddings_list)} items in the database")
    async with conn.transaction():
        for item, embedding in items_with_embeddings_list:
            # Pass the raw embedding list as the first parameter, not its string representation
            parameters = [item['foodName']]
            embedding_sql = vector_to_sql(embedding.tolist())
            
            food_brand = item.get('foodBrand')
            brand_owner = item.get('brandOwner')
            
            # Modify the SQL statement based on the available parameters
            if food_brand:
                brand_condition = f"\"foodBrand\" = ${2}"
                parameters.append(food_brand)
            else:
                brand_condition = "(\"foodBrand\" IS NULL OR \"foodBrand\" = '')"

            if brand_owner:
                owner_condition = f"\"brandOwner\" = ${3 if food_brand else 2}"
                parameters.append(brand_owner)
            else:
                owner_condition = "(\"brandOwner\" IS NULL OR \"brandOwner\" = '')"

            UPDATE_SQL = f"""
                UPDATE "UsdaFoodItemEmbedding"
                SET "{columnNameEmbedding}" = '{embedding_sql}'::vector 
                WHERE "foodName" = $1
                AND ({brand_condition})
                AND ({owner_condition});
            """

            await conn.execute(UPDATE_SQL, *parameters)


write_tasks = []

async def fetch_and_process(conn, pbar, batch_size, parallel_batches=8):
    
    # Multiplied the LIMIT in the query by parallel_batches
    QUERY_TO_FETCH_ITEMS_WITHOUT_EMBEDDINGS = f"""
                    SELECT "fdcId", "foodName", "foodBrand", "brandOwner", CAST("{columnNameEmbedding}" AS text)
                    FROM "UsdaFoodItemEmbedding"
                    WHERE "{columnNameEmbedding}" IS NULL
                    ORDER BY 
                        CASE
                            WHEN "foodBrand" IS NOT NULL THEN 1
                            WHEN "brandOwner" IS NOT NULL THEN 2
                            ELSE 3
                        END,
                        "foodName" ASC
                    LIMIT $1
                    """
    items_without_embeddings_prefetched = await conn.fetch(QUERY_TO_FETCH_ITEMS_WITHOUT_EMBEDDINGS, batch_size * parallel_batches)
    
    # print(f"Fetched {len(items_without_embeddings_prefetched)} items for processing")


    if not items_without_embeddings_prefetched:
        return 0, 0  # No more items to process


    total_items_processed = 0
    total_embedding_time = 0
    
    # print(f"Number of parallel batches: {parallel_batches}")

    for i in range(parallel_batches):
        items_without_embeddings = items_without_embeddings_prefetched[i * batch_size:(i + 1) * batch_size]
        if not items_without_embeddings:
            continue
        # The rest remains the same as your logic
        unique_items = {}
        for item in items_without_embeddings:
            key = (item['foodName'], item.get('foodBrand', None), item.get('brandOwner', None))
            existing_item = unique_items.get(key, None)
            if existing_item is None or existing_item['fdcId'] < item['fdcId']:
                unique_items[key] = item

        embedding_start_time = time.time()
        sentences = [construct_sentence(item) for item in unique_items.values()]
        embeddings = model.encode(sentences)
        total_embedding_time += time.time() - embedding_start_time
        
        #print(f"Number of pending write tasks: {len(write_tasks)}")
        await asyncio.gather(*write_tasks)
        #print(f"Items to be updated: {unique_items.values()}")
        #print(f"Number of unique items: {len(unique_items.values())}, Number of embeddings: {len(embeddings)}")
        task = asyncio.create_task(batch_update_db_prepared(conn, zip(unique_items.values(), embeddings)))
        write_tasks.append(task)
        total_items_processed += len(items_without_embeddings)
        # Update the progress bar here after each batch
        pbar.update(len(items_without_embeddings))
    
    # Wait for all dispatched tasks to finish
    print(f"Final number of pending write tasks: {len(write_tasks)}")
    await asyncio.gather(*write_tasks)
    write_tasks.clear()

    avg_embedding_time = total_embedding_time / parallel_batches
    return total_items_processed, avg_embedding_time

async def main():
    # Database connection
    parsed_url = urlparse(DATABASE_URL)
    sanitized_url = urlunparse((parsed_url.scheme, parsed_url.netloc, parsed_url.path, "", "", ""))
    conn = await asyncpg.connect(sanitized_url)
    
    try:
        result = await conn.fetchrow("SELECT COUNT(*) as count FROM \"UsdaFoodItemEmbedding\"")
        total_rows = result['count']
        result = await conn.fetchrow(f"SELECT COUNT(*) as count FROM \"UsdaFoodItemEmbedding\" WHERE \"{columnNameEmbedding}\" IS NOT NULL")
        rows_with_embedding = result['count']
        
        print(f"Total rows: {total_rows}")
        print(f"Rows with embeddings: {rows_with_embedding}")

        batch_size = 32
        batches_processed = 0
        total_embedding_time = 0
        total_db_time = 0
        ALPHA = 0.2
        ema_batch_time = None
        parallel_batches = 16
        fetched_count = 0
        # Update progress bar with the remaining rows
        pbar = tqdm.tqdm(total=total_rows - rows_with_embedding, desc="Processing rows", position=0, leave=True)

        while True:
            batch_start_time = time.time()

            try:
                actual_parallel_batches = (rows_with_embedding + fetched_count) // batch_size
                if actual_parallel_batches == 0:  # Handle case when fewer items than batch size are left.
                    actual_parallel_batches = 1
                
                fetched_count, embedding_time = await fetch_and_process(conn,pbar, batch_size, actual_parallel_batches)
                
                if fetched_count == 0 and embedding_time == 0:
                    print("\nProcessing completed.")
                    break
                
                # Update progress bar
                pbar.update(float(fetched_count))

                    
                # If there are no more items to process
                if not fetched_count:
                    pbar.close()
                    print("\nProcessing completed.")
                    break

                # Update metrics
                batches_processed += parallel_batches  # Incrementing by the number of parallel batches
                last_batch_time = (time.time() - batch_start_time)/parallel_batches
                total_embedding_time += embedding_time

                if ema_batch_time is None:
                    ema_batch_time = last_batch_time
                else:
                    ema_batch_time = (1 - ALPHA) * ema_batch_time + ALPHA * last_batch_time

                # Progress output
                rows_done = rows_with_embedding + fetched_count  # Increment by the actual number of items processed
                progress = round(rows_done / total_rows * 100, 2)
                estimated_time_remaining = ema_batch_time * ((total_rows - rows_done) / (batch_size * parallel_batches))  # Considering all batches
                hours, remainder = divmod(int(estimated_time_remaining), 3600)
                minutes, seconds = divmod(remainder, 60)
                # Instead of print, use tqdm's set_postfix to display additional info
                pbar.set_postfix(progress=f"{progress}%", 
                                estimated_time=f"{hours}h {minutes}m {seconds}s", 
                                last_batch_time=f"{last_batch_time:.2f}s", 
                                embedding_time=f"{embedding_time:.2f}s", 
                                refresh=False)
                pbar.refresh()

            except Exception as e:
                print(f"\rAn error occurred: {e}")
                print(f"\nAn error occurred: {e}")

        # Final stats after processing completes
        avg_embedding_time = total_embedding_time / batches_processed
        avg_db_time = total_db_time / batches_processed
        print(f"\n\nFinished processing!")
        print(f"Average embedding generation time: {avg_embedding_time:.2f}s")
        print(f"Average DB update time: {avg_db_time:.2f}s")
        
    finally:
        await conn.close()

    await conn.close()


asyncio.run(main())
