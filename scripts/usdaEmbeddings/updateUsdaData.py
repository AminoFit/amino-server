import asyncio
import asyncpg
import os
import requests
from urllib.parse import urlparse, urlunparse, urlencode
from dotenv import load_dotenv
from FlagEmbedding import FlagModel
import json
import time
from tqdm import tqdm  # Importing tqdm for progress bar

# Load environment variables from .env file
load_dotenv(dotenv_path="prisma/.env")

# Fetch the DATABASE_URL from environment variables
DATABASE_URL = os.getenv("DATABASE_URL")

# Fetch the USDA_API_KEY from environment variables
load_dotenv(dotenv_path=".env.local")
# Ensure you have this environment variable set
USDA_API_KEY = os.getenv("USDA_API_KEY")

model = FlagModel('BAAI/bge-base-en-v1.5', use_fp16=False)
columnNameEmbedding = 'bgeBaseEmbedding'

CONFIG_FILE = "api_request_count.cfg"

def read_config():
    if not os.path.exists(CONFIG_FILE):
        return {"count": 0, "timestamp": time.time()}
    
    with open(CONFIG_FILE, 'r') as file:
        return json.load(file)

def update_config(count):
    with open(CONFIG_FILE, 'w') as file:
        json.dump({"count": count, "timestamp": time.time()}, file)

def check_rate_limit():
    config = read_config()
    current_count = config["count"]
    last_timestamp = config["timestamp"]
    
    if time.time() - last_timestamp < 3600 and current_count > 500: # 3600 seconds = 1 hour
        print(f"Approaching rate limit. Current count: {current_count}. Waiting to continue...")
        time.sleep(3600 - (time.time() - last_timestamp))
        update_config(0)
    else:
        update_config(current_count + 1)

def vector_to_sql(value):
    return '[' + ','.join(map(str, value)) + ']'

def normalize_string(s: str) -> str:
    return ' '.join(word.capitalize() for word in s.split())

def construct_sentence(item):
    description = item.get('description', '')  # Using 'description'
    brand = item.get('brand', '')
    owner = item.get('owner', '')

    components = [description]

    # If brand and owner are the same (case insensitive), only append brand
    if brand and owner and brand.strip().lower() == owner.strip().lower():
        components.append(brand)
    else:
        if brand:
            components.append(brand)
        if owner:
            components.append(owner)

    # Filter out None or empty values before joining
    return " - ".join(filter(None, components))



async def cleanup_duplicates(conn):
    # DELETE rows that don't have the max fdcId for their foodName, foodBrand, and brandOwner combination
    await conn.execute("""
        WITH MaxFdcId AS (
            SELECT 
                "foodName", 
                "foodBrand", 
                "brandOwner", 
                MAX("fdcId") as max_fdcId
            FROM "UsdaFoodItemEmbedding"
            GROUP BY "foodName", "foodBrand", "brandOwner"
        )

        DELETE FROM "UsdaFoodItemEmbedding" u
        USING MaxFdcId m
        WHERE 
            u."foodName" = m."foodName" AND 
            (u."foodBrand" = m."foodBrand" OR (u."foodBrand" IS NULL AND m."foodBrand" IS NULL)) AND 
            (u."brandOwner" = m."brandOwner" OR (u."brandOwner" IS NULL AND m."brandOwner" IS NULL)) AND 
            u."fdcId" != m.max_fdcId;
    """)
    
def get_max_fdcId_for_dataType(data_type):
    SEARCH_API_URL = "https://api.nal.usda.gov/fdc/v1/foods/search"

    params = {
        "query": "",  # An empty query to retrieve results without filtering by keywords
        "dataType": [data_type],
        "pageSize": 1,
        "sortBy": "fdcId",
        "sortOrder": "desc",
        "api_key": USDA_API_KEY
    }

    response = requests.get(SEARCH_API_URL, params=params)
    data = response.json()

    if data and "foods" in data and data["foods"]:
        return data["foods"][0]["fdcId"]
    else:
        return None
    
def retrieve_max_fdcIds():
    data_types = ["Branded", "Foundation", "Survey (FNDDS)", "SR Legacy"]
    max_ids = {}

    for dt in data_types:
        max_ids[dt] = get_max_fdcId_for_dataType(dt)

    return max_ids


def get_usda_data(fdcIds):
    check_rate_limit()
    API_URL = "https://api.nal.usda.gov/fdc/v1/foods"
    
    # Convert the list of integers to a comma-separated string
    fdcIds_param = ','.join(map(str, fdcIds)) if isinstance(fdcIds, list) else str(fdcIds)
    
    requestParams = {
        "fdcIds": fdcIds_param,
        "format": "abridged",
        "api_key": USDA_API_KEY
    }

    try:
        # Construct the URL
        parsed_url = urlparse(API_URL)
        constructed_url = urlunparse((
            parsed_url.scheme,
            parsed_url.netloc,
            parsed_url.path,
            parsed_url.params,
            urlencode(requestParams),
            parsed_url.fragment
        ))

        response = requests.get(API_URL, params=requestParams)
        response_data = response.json()

        if not response_data:
            return None

        # Print the response data for debugging purposes
        #print(f"Response data: {json.dumps(response_data)}")

        # Assuming the response data is a list of food items
        # Extract relevant info and map it
        food_items = []
        for item in response_data:
            data_type = item.get("dataType")
            if data_type == "Branded":
                food_items.append({
                    "fdcId": item.get("fdcId"),
                    "description": item.get("description"),
                    "brand": item.get("brandOwner"),
                    "owner": item.get("brandOwner")
                })
            else:
                # For non-branded items, set brand and owner to None
                food_items.append({
                    "fdcId": item.get("fdcId"),
                    "description": item.get("description"),
                    "brand": None,
                    "owner": None
                })

        return food_items
    except Exception as e:
        print(f"Error fetching food details from USDA API: {e}")
        return None

async def find_starting_fdcId(conn):
    # Get the highest fdcId from our local database
    return await conn.fetchval(f"SELECT MAX(\"fdcId\") FROM \"UsdaFoodItemEmbedding\"")

def get_progress_bar(total, description):
    return tqdm(total=total, desc=description, dynamic_ncols=True, leave=True)

async def process_and_update(conn):
    max_fdcId_usda = retrieve_max_fdcIds()["Branded"]  # Assuming "Branded" is representative for highest ID.
    
    max_fdcId_db = await find_starting_fdcId(conn)
    # Adjust start if there's no record in DB
    if not max_fdcId_db:
        max_fdcId_db = 1
    else:
        max_fdcId_db += 1  # Start from the next fdcId

    # Progress bar initialization
    progress_bar = get_progress_bar(max_fdcId_usda - max_fdcId_db, f"Processing from {max_fdcId_db} to {max_fdcId_usda}")

    # Fetch data in batches from USDA
    BATCH_SIZE = 200
    for current_fdcId in range(max_fdcId_db, max_fdcId_usda + 1, BATCH_SIZE):
        # Get batch of data
        end_fdcId = min(current_fdcId + BATCH_SIZE - 1, max_fdcId_usda)
        fdcIds_range = list(range(current_fdcId, end_fdcId + 1))
        usda_data_batch = get_usda_data(fdcIds_range)

        if not usda_data_batch:
            progress_bar.update(BATCH_SIZE)  # Update progress bar
            continue

        # Sort by descending fdcId and keep highest fdcId for each unique (foodName, foodBrand, brandOwner) combination
        usda_data_batch.sort(key=lambda x: x['fdcId'], reverse=True)
        seen = set()
        unique_data_batch = []
        for item in usda_data_batch:
            key = (item.get('description', "").lower(), item.get('brand', "").lower() if item.get('brand') else None, item.get('owner', "").lower() if item.get('owner') else None)
            if key not in seen:
                seen.add(key)
                unique_data_batch.append(item)

        for item in unique_data_batch:
            sentence = construct_sentence(item)
            embedding = model.encode([sentence])[0]
            description = normalize_string(item.get('description', ""))
            brand = item.get('brand', None)
            owner = item.get('owner', None)

            existing_item = await conn.fetchrow("SELECT * FROM \"UsdaFoodItemEmbedding\" WHERE LOWER(\"foodName\")=LOWER($1) AND LOWER(\"foodBrand\")=LOWER($2) AND LOWER(\"brandOwner\")=LOWER($3)", description, brand if brand else '', owner if owner else '')

            if not existing_item:
                try:
                    await conn.execute(f"INSERT INTO \"UsdaFoodItemEmbedding\" (\"fdcId\", \"foodName\", \"foodBrand\", \"brandOwner\", \"{columnNameEmbedding}\") VALUES ($1, $2, $3, $4, $5)", item['fdcId'], description, brand, owner, vector_to_sql(embedding))
                except asyncpg.exceptions.UniqueViolationError:
                    pass  # Skip this item, since it already exists

        progress_bar.update(BATCH_SIZE)  # Update progress bar with the BATCH_SIZE
    progress_bar.close()

                
async def main(cleanUp=False):
    # Database connection
    parsed_url = urlparse(DATABASE_URL)
    sanitized_url = urlunparse((parsed_url.scheme, parsed_url.netloc, parsed_url.path, "", "", ""))
    conn = await asyncpg.connect(sanitized_url)
    try:
        if cleanUp:
            await cleanup_duplicates(conn)
        await process_and_update(conn)
    finally:
        await conn.close()

asyncio.run(main(cleanUp=False))