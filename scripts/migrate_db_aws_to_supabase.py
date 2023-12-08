import psycopg2
from dotenv import load_dotenv
import os
import concurrent.futures
import signal
from urllib.parse import urlparse, urlunparse
from tqdm import tqdm  # Import tqdm for the progress bar

def calculate_total_rows(source_db_url):
    """
    Calculate the total number of rows in the source database.
    """
    with psycopg2.connect(source_db_url) as conn:
        with conn.cursor() as cursor:
            cursor.execute('SELECT COUNT(*) FROM public."UsdaFoodItemEmbedding"')
            return cursor.fetchone()[0]

def calculate_initial_progress(dest_db_url):
    """
    Calculate the initial progress based on the rows already in the destination database.
    """
    with psycopg2.connect(dest_db_url) as conn:
        with conn.cursor() as cursor:
            cursor.execute('SELECT COUNT(*) FROM public."UsdaFoodItemEmbedding"')
            return cursor.fetchone()[0]

def clean_database_url(db_url):
    """
    Removes query parameters from the database URL to make it compatible with psycopg2.
    """
    parsed_url = urlparse(db_url)
    # Reconstruct the URL without query parameters
    return urlunparse((parsed_url.scheme, parsed_url.netloc, parsed_url.path, None, None, None))

# Load the .env.prod file
load_dotenv('.env.prod')

# Environment variables for database URLs
# Clean the DATABASE_URL
source_db_url = clean_database_url(os.getenv('DATABASE_URL'))
dest_db_url = clean_database_url(os.getenv('SUPABASE_PG_URI'))

# Batch size and number of parallel workers
BATCH_SIZE = 100
NUM_WORKERS = 5  # Adjust based on your system's capabilities

# Setting up a global variable for graceful shutdown
shutdown_flag = False

def fetch_data(fdc_id, batch_size):
    """
    Fetches a batch of data from the source database.
    """
    with psycopg2.connect(source_db_url) as conn:
        with conn.cursor() as cursor:
            cursor.execute(
                'SELECT * FROM public."UsdaFoodItemEmbedding" WHERE "fdcId" > %s ORDER BY "fdcId" ASC LIMIT %s', 
                (fdc_id, batch_size)
            )
            return cursor.fetchall()

def insert_data(rows):
    """
    Inserts a batch of data into the destination database.
    Returns the number of rows successfully inserted.
    """
    rows_inserted = 0
    if rows:
        with psycopg2.connect(dest_db_url) as conn:
            with conn.cursor() as cursor:
                for row in rows:
                    cursor.execute('''
                        INSERT INTO public."UsdaFoodItemEmbedding" (
                            id, "fdcId", "foodName", "foodBrand", "brandOwner", "bgeLargeEmbedding", "bgeBaseEmbedding"
                        ) VALUES (%s, %s, %s, %s, %s, %s, %s)
                        ON CONFLICT ("fdcId") DO NOTHING;
                    ''', row)
                # Check the number of rows successfully inserted
                rows_inserted = cursor.rowcount
                conn.commit()
    return rows_inserted

def signal_handler(signum, frame):
    """
    Handles interrupt signal for graceful shutdown.
    """
    global shutdown_flag
    shutdown_flag = True
    print("Shutdown signal received. Exiting gracefully...")

def main():
    # Register the signal handler for Ctrl+C
    signal.signal(signal.SIGINT, signal_handler)

    with psycopg2.connect(dest_db_url) as conn:
        with conn.cursor() as cursor:
            cursor.execute('SELECT MAX("fdcId") FROM public."UsdaFoodItemEmbedding"')
            max_fdc_id = cursor.fetchone()[0] or 0
        total_rows = calculate_total_rows(source_db_url)
    initial_progress = calculate_initial_progress(dest_db_url)

    # Create a tqdm progress bar
    progress_bar = tqdm(total=total_rows, initial=initial_progress, desc="Migrating Rows", unit="row")

    # Use ThreadPoolExecutor for parallel execution
    with concurrent.futures.ThreadPoolExecutor(max_workers=NUM_WORKERS) as executor:
        future_to_batch = {}

        while True:
            if shutdown_flag and not future_to_batch:
                break  # Exit the loop if shutdown is flagged and no futures are pending

            if not shutdown_flag:
                rows = fetch_data(max_fdc_id, BATCH_SIZE)
                if not rows:
                    break  # Exit if no more rows to migrate

                # Submit the insert task to the executor
                future = executor.submit(insert_data, rows)
                future_to_batch[future] = rows

                # Update max_fdc_id for the next batch
                max_fdc_id = rows[-1][1]

            # Check for completion of any futures
            done, _ = concurrent.futures.wait(
                future_to_batch, timeout=0, return_when=concurrent.futures.FIRST_COMPLETED
            )

            for future in done:
                inserted_rows = future.result()
                progress_bar.update(inserted_rows)  # Update progress bar based on actual inserted rows
                print(f"Batch inserted: {inserted_rows} rows")  # Feedback about the batch
                del future_to_batch[future]

        progress_bar.close()
        print("Migration completed.")

if __name__ == "__main__":
    main()
