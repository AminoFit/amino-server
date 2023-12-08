import pandas as pd

# File paths
food_file_path = '/Users/seb/Documents/USDA_Data/branded/food.csv'
branded_food_file_path = '/Users/seb/Documents/USDA_Data/branded/branded_food.csv'
output_path = '/Users/seb/Documents/USDA_Data/branded/shortened_food.csv'

# Read branded_food.csv (consider reading in chunks if this file is also very large)
branded_food_df = pd.read_csv(branded_food_file_path, low_memory=False)

# Function to process each chunk of food.csv
def process_chunk(chunk):
    # Merge with branded_food data
    merged = pd.merge(chunk, branded_food_df, on='fdc_id', how='left')

    # Select necessary columns
    columns = ['fdc_id', 'description', 'brand_owner', 'brand_name', 'subbrand_name', 'gtin_upc', 'serving_size', 'serving_size_unit','household_serving_fulltext','package_weight']
    merged = merged[columns]

    # Rename 'description' column to 'name'
    merged.rename(columns={'description': 'name'}, inplace=True)

    return merged

# Process food.csv in chunks and append to list
chunk_size = 10000  # Adjust based on your system's memory
chunks = pd.read_csv(food_file_path, chunksize=chunk_size)
processed_chunks = [process_chunk(chunk) for chunk in chunks]

# Concatenate all processed chunks
final_df = pd.concat(processed_chunks)

# Deduplication based on 'name' and 'brand'
final_df.drop_duplicates(subset=['name', 'brand_owner', 'brand_name', 'subbrand_name'], inplace=True)

# Save to CSV
final_df.to_csv(output_path, index=False)

print(f"Processed file saved at {output_path}")
