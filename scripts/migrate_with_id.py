import asyncio
import asyncpg
from dotenv import load_dotenv
import os
from urllib.parse import urlparse, urlunparse
from tqdm import tqdm

BATCH_SIZE = 200  # Adjust as needed

def clean_database_url(db_url):
    parsed_url = urlparse(db_url)
    return urlunparse((parsed_url.scheme, parsed_url.netloc, parsed_url.path, None, None, None))

async def find_missing_ids(conn, table_name):
    return await conn.fetch(
        f'''
        WITH RECURSIVE MissingIds AS (
            SELECT 1 as id
            UNION ALL
            SELECT id + 1 FROM MissingIds WHERE id < (SELECT max(id) FROM {table_name})
        )
        SELECT id FROM MissingIds WHERE id NOT IN (SELECT id FROM {table_name})
        '''
    )

async def fetch_rows_by_ids(conn, table_name, ids):
    return await conn.fetch(
        f'SELECT * FROM {table_name} WHERE id = ANY($1::int[])', ids
    )

async def insert_batch(conn, table_name, rows):
    # Prepare the statement for deleting conflicting rows
    delete_statement = f'DELETE FROM {table_name} WHERE "fdcId" = $1'

    # Prepare the statement for inserting rows
    insert_statement = f'''
        INSERT INTO {table_name} (
            id, "fdcId", "foodName", "foodBrand", "brandOwner", "bgeLargeEmbedding", "bgeBaseEmbedding"
        ) VALUES ($1, $2, $3, $4, $5, $6, $7)
    '''

    for row in rows:
        # Check if a row with the same fdcId exists in the target database
        existing_row = await conn.fetchrow(
            f'SELECT 1 FROM {table_name} WHERE "fdcId" = $1', row['fdcId']
        )

        # If a conflict is found, delete the existing row
        if existing_row:
            await conn.execute(delete_statement, row['fdcId'])

        # Insert the new row
        await conn.execute(insert_statement, 
                        row['id'], row['fdcId'], row['foodName'], row['foodBrand'], 
                        row['brandOwner'], row['bgeLargeEmbedding'], row['bgeBaseEmbedding'])

async def main():
    load_dotenv('.env.prod')
    source_db_url = clean_database_url(os.getenv('DATABASE_URL'))
    dest_db_url = clean_database_url(os.getenv('SUPABASE_PG_URI'))
    table_name = 'public."UsdaFoodItemEmbedding"'

    source_conn = await asyncpg.connect(source_db_url)
    dest_conn = await asyncpg.connect(dest_db_url)

    missing_ids = await find_missing_ids(dest_conn, table_name)
    missing_ids = [row['id'] for row in missing_ids]

    total_missing = len(missing_ids)
    progress_bar = tqdm(total=total_missing, desc="Migrating Missing Data", unit=" row")

    fetch_task = None
    insert_task = None

    for i in range(0, total_missing, BATCH_SIZE):
        batch_ids = missing_ids[i:i + BATCH_SIZE]

        # Wait for the previous insert task to complete before starting a new fetch
        if insert_task:
            await insert_task
            insert_task = None

        # Fetch next batch while the current one is being inserted
        if fetch_task:
            rows = await fetch_task
            fetch_task = asyncio.create_task(fetch_rows_by_ids(source_conn, table_name, batch_ids))
            insert_task = asyncio.create_task(insert_batch(dest_conn, table_name, rows))
            progress_bar.update(len(rows))
        else:
            fetch_task = asyncio.create_task(fetch_rows_by_ids(source_conn, table_name, batch_ids))

    # Ensure the last batch is processed
    if fetch_task:
        rows = await fetch_task
        if rows:
            await insert_batch(dest_conn, table_name, rows)
            progress_bar.update(len(rows))

    progress_bar.close()
    await source_conn.close()
    await dest_conn.close()

if __name__ == "__main__":
    asyncio.run(main())
