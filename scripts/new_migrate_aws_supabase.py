#This is the one that works!
import asyncio
import asyncpg
from dotenv import load_dotenv
import os
from urllib.parse import urlparse, urlunparse
from tqdm import tqdm

BATCH_SIZE = 250

def clean_database_url(db_url):
    """ 
    Removes query parameters from the database URL to make it compatible with psycopg2.
    """
    parsed_url = urlparse(db_url)
    # Reconstruct the URL without query parameters
    return urlunparse((parsed_url.scheme, parsed_url.netloc, parsed_url.path, None, None, None))


async def get_row_count(conn, table_name):
    """
    Asynchronously get the count of rows in the specified table.
    """
    row = await conn.fetchrow(f'SELECT COUNT(*) FROM {table_name}')
    return row[0]

async def get_max_fdc_id(conn, table_name):
    """
    Asynchronously get the maximum fdcId from the specified table.
    """
    row = await conn.fetchrow(f'SELECT MAX("fdcId") FROM {table_name}')
    return row[0] or 0

async def fetch_next_batch(conn, table_name, fdc_id, batch_size=BATCH_SIZE):
    """
    Asynchronously fetches the next batch of data from the database.
    """
    return await conn.fetch(
        f'SELECT * FROM {table_name} WHERE "fdcId" > $1 ORDER BY "fdcId" ASC LIMIT $2',
        fdc_id, batch_size
    )

async def insert_batch(conn, table_name, rows):
    """
    Asynchronously inserts a batch of rows into the target database.
    """
    await conn.executemany(f'''
        INSERT INTO {table_name} (
            id, "fdcId", "foodName", "foodBrand", "brandOwner", "bgeLargeEmbedding", "bgeBaseEmbedding"
        ) VALUES ($1, $2, $3, $4, $5, $6, $7)
        ON CONFLICT (id) DO UPDATE SET
            "fdcId" = EXCLUDED."fdcId",
            "foodName" = EXCLUDED."foodName",
            "foodBrand" = EXCLUDED."foodBrand",
            "brandOwner" = EXCLUDED."brandOwner",
            "bgeLargeEmbedding" = EXCLUDED."bgeLargeEmbedding",
            "bgeBaseEmbedding" = EXCLUDED."bgeBaseEmbedding"
        WHERE {table_name}."fdcId" != EXCLUDED."fdcId";
    ''', rows)

async def main():
    load_dotenv('.env.prod')
    source_db_url = clean_database_url(os.getenv('DATABASE_URL'))
    dest_db_url = clean_database_url(os.getenv('SUPABASE_PG_URI'))
    table_name = 'public."UsdaFoodItemEmbedding"'

    source_conn = await asyncpg.connect(source_db_url)
    dest_conn = await asyncpg.connect(dest_db_url)

    max_fdc_id = await get_max_fdc_id(dest_conn, table_name)
    total_rows_to_migrate = await get_row_count(source_conn, table_name) - await get_row_count(dest_conn, table_name)
    progress_bar = tqdm(total=total_rows_to_migrate)

    fetch_task = asyncio.create_task(fetch_next_batch(source_conn, table_name, max_fdc_id, BATCH_SIZE))
    while True:
        rows = await fetch_task
        if not rows:
            print("No more rows to migrate.")
            break

        fetch_task = asyncio.create_task(fetch_next_batch(source_conn, table_name, max_fdc_id, BATCH_SIZE))
        await insert_batch(dest_conn, table_name, rows)
        max_fdc_id = await get_max_fdc_id(dest_conn, table_name)
        progress_bar.update(len(rows))

    await fetch_task  # Ensure the last fetch task is completed
    progress_bar.close()
    await source_conn.close()
    await dest_conn.close()

if __name__ == "__main__":
    asyncio.run(main())
