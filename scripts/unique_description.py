import pandas as pd
import json

file_path = '/Users/seb/Documents/USDA_Data/legacy/food.csv'

# Read the CSV file into a DataFrame
df = pd.read_csv(file_path)

# Filter rows where 'data_type' is 'sr_legacy_food'
df_filtered = df[df['data_type'] == 'sr_legacy_food'].copy()

# Normalize the 'description' to ensure consistent casing
df_filtered['description'] = df_filtered['description'].str.upper()

# Sort the DataFrame by 'description', 'publication_date' (descending), and 'fdc_id' (descending)
df_filtered.sort_values(by=['description', 'publication_date', 'fdc_id'], ascending=[True, False, False], inplace=True)

# Group by 'description' and aggregate 'fdc_id' into a list, excluding the first occurrence
grouped = df_filtered.groupby('description').apply(lambda x: x['fdc_id'].tolist()[1:]).reset_index(name='old_fdc_ids')

# Drop duplicate 'description', keeping the first occurrence
df_unique = df_filtered.drop_duplicates(subset='description', keep='first')

# Merge the unique DataFrame with the grouped 'fdc_id's
df_merged = pd.merge(df_unique, grouped, on='description', how='left')

# Fill NaN in 'old_fdc_ids' with empty list
df_merged['old_fdc_ids'] = df_merged['old_fdc_ids'].apply(lambda x: x if isinstance(x, list) else [])

# Convert 'old_fdc_ids' to a JSON string
df_merged['old_fdc_ids'] = df_merged['old_fdc_ids'].apply(json.dumps)

# Save the result to a new CSV file
output_path = '/Users/seb/Documents/USDA_Data/legacy/shortened_file.csv'
df_merged.to_csv(output_path, index=False)

print(f"File shortened and saved as '{output_path}'")
