import csv
from collections import defaultdict
import argparse

def filter_csv(input_path, output_path):
    # Filter rows with foundation_food and track highest fdc_id
    desc_to_data = defaultdict(list)

    with open(input_path, 'r') as infile:
        reader = csv.reader(infile)
        header = next(reader)

        for row in reader:
            if row[1] == "sr_legacy_food":
                desc_to_data[row[2]].append(row)

    # Keep only foundation_food with the highest fdc_id
    filtered_data = []
    for _, items in desc_to_data.items():
        # Sort based on fdc_id (which is the first column) and take the last one
        highest_fdc_id_item = sorted(items, key=lambda x: int(x[0]))[-1]
        # Keep only fdc_id, data_type, and description columns
        filtered_data.append([highest_fdc_id_item[0], highest_fdc_id_item[1], highest_fdc_id_item[2]])

    # Write filtered data to the output CSV file
    with open(output_path, 'w', newline='') as outfile:
        writer = csv.writer(outfile)
        writer.writerow(header[:3])
        writer.writerows(filtered_data)

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Filter CSV based on given criteria.")
    #parser.add_argument("/Users/seb/Downloads/FoodData_Central_foundation_food_csv_2023-04-20/food.csv", help="Path to the input CSV file.")
    #parser.add_argument("/Users/seb/Downloads/FoodData_Central_foundation_food_csv_2023-04-20/output.csv", help="Path to the output CSV file.")
    
    #args = parser.parse_args()
    input_csv = "/Users/seb/Downloads/FoodData_Central_sr_legacy_food_csv_2018-04/food.csv"
    output_csv = "/Users/seb/Downloads/FoodData_Central_sr_legacy_food_csv_2018-04/output.csv"
    filter_csv(input_csv, output_csv)
