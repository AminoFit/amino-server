# Modified Script for Database Migration with Asynchronous Handling and Efficiency
import asyncio
import asyncpg
from dotenv import load_dotenv
import os
from urllib.parse import urlparse, urlunparse
from tqdm import tqdm

BATCH_SIZE = 250

def clean_database_url(db_url):
    parsed_url = urlparse(db_url)
    return urlunparse((parsed_url.scheme, parsed_url.netloc, parsed_url.path, None, None, None))

async def fetch_next_batch(conn, table_name, last_id, batch_size=BATCH_SIZE):
    return await conn.fetch(
        f'SELECT id, "fdcId" FROM {table_name} WHERE id > $1 ORDER BY id ASC LIMIT $2',
        last_id, batch_size
    )

async def check_batch_in_target(conn, rows, table_name):
    rows_to_insert = []
    rows_to_update = []
    for row in rows:
        # Await each query's completion before continuing to the next
        existing_row = await conn.fetchrow(
            f'SELECT "fdcId" FROM {table_name} WHERE id = $1', row['id'])
        if not existing_row:
            rows_to_insert.append(row['id'])
        elif existing_row['fdcId'] != row['fdcId']:
            rows_to_update.append(row['id'])
    return rows_to_insert, rows_to_update

async def fetch_full_rows(conn, table_name, row_ids):
    return await conn.fetch(f'SELECT * FROM {table_name} WHERE id = ANY($1::int[])', row_ids)

async def insert_or_update_batch(conn, table_name, rows_to_insert, rows_to_update):
    if rows_to_insert:
        full_rows_to_insert = await fetch_full_rows(conn, table_name, rows_to_insert)
        await conn.executemany(
            f'''
            INSERT INTO {table_name} (
                id, "fdcId", "foodName", "foodBrand", "brandOwner", "bgeLargeEmbedding", "bgeBaseEmbedding"
            ) VALUES ($1, $2, $3, $4, $5, $6, $7)
            ''', 
            [(row['id'], row['fdcId'], row['foodName'], row['foodBrand'], row['brandOwner'], 
              row['bgeLargeEmbedding'], row['bgeBaseEmbedding']) for row in full_rows_to_insert]
        )
    
    if rows_to_update:
        full_rows_to_update = await fetch_full_rows(conn, table_name, rows_to_update)
        await conn.executemany(
            f'''
            UPDATE {table_name} SET
                "fdcId" = $2,
                "foodName" = $3,
                "foodBrand" = $4,
                "brandOwner" = $5,
                "bgeLargeEmbedding" = $6,
                "bgeBaseEmbedding" = $7
            WHERE id = $1
            ''', 
            [(row['id'], row['fdcId'], row['foodName'], row['foodBrand'], row['brandOwner'], 
              row['bgeLargeEmbedding'], row['bgeBaseEmbedding']) for row in full_rows_to_update]
        )

async def main():
    load_dotenv('.env.prod')
    source_db_url = clean_database_url(os.getenv('DATABASE_URL'))
    dest_db_url = clean_database_url(os.getenv('SUPABASE_PG_URI'))
    table_name = 'public."UsdaFoodItemEmbedding"'

    source_conn = await asyncpg.connect(source_db_url)
    dest_conn = await asyncpg.connect(dest_db_url)

    last_id = 480 * 250
    progress_bar = tqdm(desc="Migrating Data", unit=" batch")

    try:
        while True:
            rows = await fetch_next_batch(source_conn, table_name, last_id, BATCH_SIZE)
            if not rows:
                print("No more rows to migrate.")
                break

            rows_to_insert, rows_to_update = await check_batch_in_target(dest_conn, rows, table_name)
            if rows_to_insert or rows_to_update:
                await insert_or_update_batch(dest_conn, table_name, rows_to_insert, rows_to_update)

            last_id = rows[-1]['id']
            progress_bar.update(1)

    except KeyboardInterrupt:
        print(f"Interrupted! Last processed ID: {last_id}")
    finally:
        progress_bar.close()
        await source_conn.close()
        await dest_conn.close()

if __name__ == "__main__":
    asyncio.run(main())