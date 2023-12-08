import pandas as pd

# Function to standardize column names
def standardize_column_names(df):
    # Strip leading/trailing spaces from column names
    df.columns = df.columns.str.strip()
    return df

# Read the CSV files
branded_foods_df = pd.read_csv('/Users/seb/Documents/USDA_Data/branded/food_joined.csv')
foundation_foods_df = pd.read_csv('/Users/seb/Documents/USDA_Data/foundation/food_joined.csv')
legacy_foods_df = pd.read_csv('/Users/seb/Documents/USDA_Data/legacy/food_joined.csv')

# Standardize column names in each dataframe
branded_foods_df = standardize_column_names(branded_foods_df)
foundation_foods_df = standardize_column_names(foundation_foods_df)
legacy_foods_df = standardize_column_names(legacy_foods_df)

# Combine the dataframes
combined_df = pd.concat([branded_foods_df, foundation_foods_df, legacy_foods_df], axis=0, ignore_index=True)

# Sort by 'fdc_id' and another column (if available) that indicates row reliability
# For example, if there is a 'last_updated' column, you can use that
# combined_df = combined_df.sort_values(by=['fdc_id', 'last_updated'], ascending=[True, False])

# Drop duplicates, keeping the first row for each 'fdc_id'
combined_df = combined_df.drop_duplicates(subset=['fdc_id'])

# Ensure 'fdc_id' is the first column
combined_df = combined_df[['fdc_id'] + [col for col in combined_df.columns if col != 'fdc_id']]

# Save the merged file
combined_df.to_csv('/Users/seb/Documents/USDA_Data/merged_foods.csv', index=False)
