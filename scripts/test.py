import psycopg2
from dotenv import load_dotenv
from psycopg2 import extras  # Importing extras
import os
from urllib.parse import urlparse, urlunparse
from tqdm import tqdm  # Import tqdm for the progress bar


def clean_database_url(db_url):
    """
    Removes query parameters from the database URL to make it compatible with psycopg2.
    """
    parsed_url = urlparse(db_url)
    # Reconstruct the URL without query parameters
    return urlunparse((parsed_url.scheme, parsed_url.netloc, parsed_url.path, None, None, None))

def get_row_count(dest_db_url):
    """
    Get the count of rows in the target database.
    """
    with psycopg2.connect(dest_db_url) as conn:
        with conn.cursor() as cursor:
            cursor.execute('SELECT COUNT(*) FROM public."UsdaFoodItemEmbedding"')
            return cursor.fetchone()[0]

def fetch_next_batch(source_db_url, fdc_id, batch_size=1000):  # Updated batch_size to 1000
    """
    Fetches the next batch of data from the source database.
    """
    with psycopg2.connect(source_db_url) as conn:
        with conn.cursor() as cursor:
            cursor.execute(
                'SELECT * FROM public."UsdaFoodItemEmbedding" WHERE "fdcId" > %s ORDER BY "fdcId" ASC LIMIT %s',
                (fdc_id, batch_size)
            )
            return cursor.fetchall()

def get_max_fdc_id(dest_db_url):
    """
    Get the maximum fdcId from the target database.
    """
    with psycopg2.connect(dest_db_url) as conn:
        with conn.cursor() as cursor:
            cursor.execute('SELECT MAX("fdcId") FROM public."UsdaFoodItemEmbedding"')
            return cursor.fetchone()[0] or 0

def fetch_next_batch(source_db_url, fdc_id, batch_size=10):
    """
    Fetches the next batch of data from the source database.
    """
    with psycopg2.connect(source_db_url) as conn:
        with conn.cursor() as cursor:
            cursor.execute(
                'SELECT * FROM public."UsdaFoodItemEmbedding" WHERE "fdcId" > %s ORDER BY "fdcId" ASC LIMIT %s',
                (fdc_id, batch_size)
            )
            return cursor.fetchall()

def insert_batch(dest_db_url, rows):
    """
    Inserts a batch of rows into the target database. Updates the row if fdcId is different.
    """
    with psycopg2.connect(dest_db_url) as conn:
        with conn.cursor() as cursor:
            psycopg2.extras.execute_batch(cursor, '''
                INSERT INTO public."UsdaFoodItemEmbedding" (
                    id, "fdcId", "foodName", "foodBrand", "brandOwner", "bgeLargeEmbedding", "bgeBaseEmbedding"
                ) VALUES (%s, %s, %s, %s, %s, %s, %s)
                ON CONFLICT (id) DO UPDATE SET
                    "fdcId" = EXCLUDED."fdcId",
                    "foodName" = EXCLUDED."foodName",
                    "foodBrand" = EXCLUDED."foodBrand",
                    "brandOwner" = EXCLUDED."brandOwner",
                    "bgeLargeEmbedding" = EXCLUDED."bgeLargeEmbedding",
                    "bgeBaseEmbedding" = EXCLUDED."bgeBaseEmbedding"
                WHERE public."UsdaFoodItemEmbedding"."fdcId" != EXCLUDED."fdcId";
            ''', rows)
            conn.commit()

def main():
    load_dotenv('.env.prod')

    source_db_url = clean_database_url(os.getenv('DATABASE_URL'))
    dest_db_url = clean_database_url(os.getenv('SUPABASE_PG_URI'))

    # Initialize progress bar
    max_fdc_id = get_max_fdc_id(dest_db_url)
    total_rows_to_migrate = get_row_count(source_db_url) - get_row_count(dest_db_url)
    progress_bar = tqdm(total=total_rows_to_migrate)

    while True:
        rows = fetch_next_batch(source_db_url, max_fdc_id, 200)  # Fetch in batches of 1000

        if not rows:
            print("No more rows to migrate.")
            break

        insert_batch(dest_db_url, rows)
        max_fdc_id = get_max_fdc_id(dest_db_url)  # Update max_fdc_id for next iteration

        # Update progress bar
        progress_bar.update(len(rows))

    progress_bar.close()

if __name__ == "__main__":
    main()