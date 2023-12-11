import asyncio
import asyncpg
import csv
import os
from dotenv import load_dotenv
from aiofiles import open as aio_open
from tqdm import tqdm
from urllib.parse import urlparse, urlunparse

BATCH_SIZE = 100

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

async def fetch_next_batch(conn, table_name, fdc_id, batch_size=BATCH_SIZE):
    """
    Asynchronously fetches the next batch of data from the database.
    """
    return await conn.fetch(
        f'SELECT * FROM {table_name} WHERE "fdcId" > $1 ORDER BY "fdcId" ASC LIMIT $2',
        fdc_id, batch_size
    )

async def fetch_last_fdc_id_from_csv(csv_file_path):
    """
    Reads the last line of the CSV file to find the last fdcId processed.
    """
    last_fdc_id = 0
    try:
        async with aio_open(csv_file_path, 'r') as file:
            last_line = await file.readlines()[-1]
            last_fdc_id = int(last_line.split(',')[1])  # Assuming fdcId is the second column
    except (FileNotFoundError, IndexError):
        pass
    return last_fdc_id

async def write_rows_to_csv(csv_file_path, rows):
    """
    Writes rows to a CSV file. The file opening and closing are asynchronous, 
    but the actual writing is done synchronously.
    """
    async with aio_open(csv_file_path, 'a', newline='') as file:
        writer = csv.writer(await file)  # Get the synchronous file object
        writer.writerows(rows)  # Write rows synchronously


async def main():
    load_dotenv('.env.prod')
    source_db_url = clean_database_url(os.getenv('DATABASE_URL'))
    table_name = 'public."UsdaFoodItemEmbedding"'
    csv_file_path = '/Users/seb/Documents/USDA_Data/migrated_data.csv'  # Path to your CSV file

    source_conn = await asyncpg.connect(source_db_url)

    last_fdc_id = await fetch_last_fdc_id_from_csv(csv_file_path)
    total_rows_to_migrate = await get_row_count(source_conn, table_name) - last_fdc_id
    progress_bar = tqdm(total=total_rows_to_migrate)

    while True:
        rows = await fetch_next_batch(source_conn, table_name, last_fdc_id, BATCH_SIZE)
        if not rows:
            print("No more rows to migrate.")
            break

        await write_rows_to_csv(csv_file_path, rows)
        last_fdc_id = rows[-1][1]  # Assuming fdcId is the second column in rows
        progress_bar.update(len(rows))

    progress_bar.close()
    await source_conn.close()

if __name__ == "__main__":
    asyncio.run(main())
