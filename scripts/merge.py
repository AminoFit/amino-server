import csv
from collections import defaultdict

def merge_and_filter_csvs(input_files, output_path):
    desc_to_data = defaultdict(list)

    # If input_files is a single string, wrap it in a list
    if isinstance(input_files, str):
        input_files = [input_files]

    # Read and merge data from all input files
    for input_path in input_files:
        with open(input_path, 'r') as infile:
            reader = csv.reader(infile)
            header = next(reader)  # We assume all files have the same header structure

            for row in reader:
                desc_to_data[row[2]].append(row)

    # Keep only the entry with the highest fdc_id for each unique description
    filtered_data = []
    for _, items in desc_to_data.items():
        highest_fdc_id_item = sorted(items, key=lambda x: int(x[0]))[-1]
        # Keep only fdc_id and description columns
        filtered_data.append([highest_fdc_id_item[0], highest_fdc_id_item[2]])

    # Write filtered data to the output CSV file
    with open(output_path, 'w', newline='') as outfile:
        writer = csv.writer(outfile)
        writer.writerow(["fdc_id", "description"])  # Updated header without data_type
        writer.writerows(filtered_data)

# Example usage:
input_csvs = [
    "/Users/seb/Downloads/FoodData_Central_foundation_food_csv_2023-04-20/output.csv",
    "/Users/seb/Downloads/FoodData_Central_survey_food_csv_2022-10-28/output.csv",
    "/Users/seb/Downloads/FoodData_Central_sr_legacy_food_csv_2018-04/output.csv"
]
output_csv = "/Users/seb/Downloads/merged_output.csv"
merge_and_filter_csvs(input_csvs, output_csv)
