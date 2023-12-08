import pandas as pd
import numpy as np
import matplotlib.pyplot as plt

def analyze_nutrient_data_and_energy_error(file_path):
    # Load the CSV file with low_memory=False to avoid DtypeWarning
    df = pd.read_csv(file_path, low_memory=False)

    # Check if 'fdc_id' column is read correctly
    if 'fdc_id' not in df.columns:
        print("Warning: 'fdc_id' column is missing or not named correctly in the CSV file.")
        return

    # Define the columns of interest
    energy_columns = ["Energy", "Energy (kJ)", "Energy (Atwater General Factors)", "Energy (Atwater Specific Factors)"]
    carb_columns = ["Carbohydrate, by difference", "Carbohydrate, by summation"]
    sugar_columns = ["Sugars, Total", "Sugars, added", "Sugars, intrinsic"]
    fat_columns = ["Total lipid (fat)", "Total fat (NLEA)"]
    protein_column = ["Protein"]

    # Convert Energy (kJ) to kcal (1 kJ = 0.239 kcal)
    df['Energy (kJ)'] = df['Energy (kJ)'] * 0.239

    # Select the most relevant sugar column
    df['Total Sugars'] = df[sugar_columns].max(axis=1)

    # Correct total carbs if less than total sugars
    df['Carbohydrate, by difference'] = df[['Carbohydrate, by difference', 'Total Sugars']].max(axis=1)

    # Calculate average non-zero energy, if multiple columns are available
    df['Average Energy'] = df[energy_columns].mean(axis=1, skipna=True)

    # Assume that fiber does not contribute to energy for this calculation
    fiber_column = ["Fiber, total dietary"]

    # Calculate net carbs (total carbs - fiber)
    df['Net Carbs'] = df['Carbohydrate, by difference'] - df[fiber_column].mean(axis=1, skipna=True)

    # Ensure that net carbs do not go negative
    df['Net Carbs'] = df['Net Carbs'].clip(lower=0)

    # Calculate estimated energy from macronutrients (in kcal)
    df['Estimated Energy'] = (df['Net Carbs'] + df[protein_column].mean(axis=1, skipna=True)) * 4 + df[fat_columns].mean(axis=1, skipna=True) * 9

    # Filter out foods with all necessary nutrients
    complete_foods = df.dropna(subset=energy_columns + carb_columns + fat_columns + protein_column, how='any').copy()

    # Calculate energy error and normalize by Estimated Energy (to get percentage)
    complete_foods.loc[:, 'Energy Error'] = complete_foods['Average Energy'] - complete_foods['Estimated Energy']
    complete_foods.loc[:, 'Energy Error %'] = (complete_foods['Energy Error'] / complete_foods['Estimated Energy']) * 100

    # Remove infinite and NaN values from 'Energy Error %' before plotting
    complete_foods = complete_foods.replace([np.inf, -np.inf], np.nan).dropna(subset=['Energy Error %'])

    # Display count of complete foods
    print(f"Total number of foods: {len(df)}")
    print(f"Number of foods with all nutrient values (energy, protein, carbs, fat): {len(complete_foods)}")

    # Plot the distribution of energy error
    plt.hist(complete_foods['Energy Error %'], bins=50, range=(0, 100), edgecolor='black')
    plt.xlabel('Energy Error (%)')
    plt.ylabel('Count')
    plt.title('Distribution of Energy Error from Macronutrients to Reported Energy')
    # Save the plot to a file
    plt.savefig('/Users/seb/Documents/USDA_Data/energy_error_distribution.png')
    plt.show()

    # Use the function to print samples for different error thresholds
    print_sample_foods_with_large_errors(complete_foods, 30)
    print_sample_foods_with_large_errors(complete_foods, 40)
    print_sample_foods_with_large_errors(complete_foods, 75)
    print_sample_foods_with_large_errors(complete_foods, 100)

def print_sample_foods_with_large_errors(df, error_threshold, sample_size=10):
    # Filter foods with energy error greater than the specified threshold
    filtered_foods = df[np.abs(df['Energy Error %']) > error_threshold]

    # Ensure 'fdc_id' is not NaN
    filtered_foods = filtered_foods[filtered_foods['fdc_id'].notna()]

    # If there are more than sample_size foods, randomly select sample_size of them; otherwise, select all
    if len(filtered_foods) > sample_size:
        sample_foods = filtered_foods.sample(n=sample_size, random_state=1)
    else:
        sample_foods = filtered_foods

    print(f"\nSample of foods with energy error greater than {error_threshold}%:")
    print(sample_foods[['fdc_id', 'name', 'Energy', 'Protein', 'Net Carbs', 'Total lipid (fat)', 'Estimated Energy', 'Average Energy', 'Energy Error %']])
    return sample_foods

# File path
branded_foods_file = '/Users/seb/Documents/USDA_Data/merged_foods.csv'

# Analyze the file
analyze_nutrient_data_and_energy_error(branded_foods_file)
