import asyncio
import asyncpg
import os
import requests
from urllib.parse import urlparse, urlunparse
from dotenv import load_dotenv
from FlagEmbedding import FlagModel
import json
import time
from urllib.parse import urlencode
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

import os

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

    if brand:
        components.append(brand)
    if owner:
        components.append(owner)

    # Filter out None values before joining
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
    # Get the highest fdcId from our local database for the current data type
    return await conn.fetchval(f"SELECT MAX(\"fdcId\") FROM \"UsdaFoodItemEmbedding\"")

def generate_probe_points(low, high, max_points=100):
    prob_amount = min(max_points, high - low + 1)  # The number of points to probe, up to 100
    step = (high - low) // (prob_amount - 1)
    return [low + step * i for i in range(prob_amount)]

def combined_search(low, high, probe_count=10):
    if low > high:
        return low

    probe_points = generate_probe_points(low, high, max_points=probe_count)
    usda_data = get_usda_data(probe_points)
    existing_fdcIds = [item['fdcId'] for item in usda_data if item]

    # All points have data
    if len(existing_fdcIds) == len(probe_points):
        return combined_search(probe_points[-1] + 1, high, probe_count)

    # All points are missing
    elif len(existing_fdcIds) == 0:
        return combined_search(low, probe_points[0] - 1, probe_count)

    # We're in the boundary region
    else:
        missing_points = list(set(probe_points) - set(existing_fdcIds))
        if missing_points:
            first_missing_point = missing_points[0]
            return binary_search_missing_fdcId(probe_points[0], first_missing_point - 1)
        else:
            # This is an edge case where all probed points exist, but not necessarily consecutively.
            # Return the lowest probed point.
            return probe_points[0]

    

def binary_search_missing_fdcId(low, high):
    if low > high:
        return low

    midpoint = (low + high) // 2
    usda_data = get_usda_data([midpoint])

    if not usda_data:  # If midpoint is missing
        return binary_search_missing_fdcId(low, midpoint - 1)
    else:
        return binary_search_missing_fdcId(midpoint + 1, high)

def find_next_missing_fdcId(max_fdcId_db, max_fdcId_usda):
    return combined_search(max_fdcId_db, max_fdcId_usda)


def get_progress_bar(total, description):
    return tqdm(total=total, desc=description, dynamic_ncols=True, leave=True)

async def process_and_update(conn):
    max_ids_from_usda = retrieve_max_fdcIds()
    data_types = ["Branded", "Foundation", "Survey (FNDDS)", "SR Legacy"]

    for data_type in data_types:
        max_fdcId_db = await find_starting_fdcId(conn)
        max_fdcId_usda = max_ids_from_usda[data_type]

        # Adjust start if there's no record in DB for the current datatype
        if not max_fdcId_db:
            max_fdcId_db = max_fdcId_usda - 1

        # Locate the range of missing items
        start_fdcId = find_next_missing_fdcId(max_fdcId_db, max_fdcId_usda)
        print(f"Starting from fdcId: {start_fdcId}")

        # Progress bar initialization
        progress_bar = get_progress_bar(max_fdcId_usda - start_fdcId + 1, f"Processing {data_type}")

        # Fetch data in batches from USDA
        BATCH_SIZE = 200
        for current_fdcId in range(start_fdcId, max_fdcId_usda + 1, BATCH_SIZE):
            # Get batch of data
            end_fdcId = min(current_fdcId + BATCH_SIZE - 1, max_fdcId_usda)
            fdcIds_range = list(range(current_fdcId, end_fdcId + 1))
            usda_data_batch = get_usda_data(fdcIds_range)

            if not usda_data_batch:
                progress_bar.update(BATCH_SIZE)  # Update progress bar
                continue

            for item in usda_data_batch:
                sentence = construct_sentence(item)
                embedding = model.encode([sentence])[0]
                description = normalize_string(item.get('description', ""))
                brand = item.get('brand', None)
                owner = item.get('owner', None)

                existing_item = await conn.fetchrow("SELECT * FROM \"UsdaFoodItemEmbedding\" WHERE \"foodName\"=$1 AND \"foodBrand\"=$2 AND \"brandOwner\"=$3", description, brand, owner)

                if not existing_item:
                    await conn.execute(f"INSERT INTO \"UsdaFoodItemEmbedding\" (\"fdcId\", \"foodName\", \"foodBrand\", \"brandOwner\", \"{columnNameEmbedding}\") VALUES ($1, $2, $3, $4, $5)", item['fdcId'], description, brand, owner, vector_to_sql(embedding))

            progress_bar.update(BATCH_SIZE)  # Update progress bar with the BATCH_SIZE
        progress_bar.close()
                
async def main(cleanUp=False):
    # Database connection
    parsed_url = urlparse(DATABASE_URL)
    sanitized_url = urlunparse(
        (parsed_url.scheme, parsed_url.netloc, parsed_url.path, "", "", ""))
    conn = await asyncpg.connect(sanitized_url)
    try:
        if cleanUp:
            await cleanup_duplicates(conn)
        await process_and_update(conn)
    finally:
        await conn.close()

asyncio.run(main(cleanUp=False))

#get_usda_data([2515543,2550000, 2600000])