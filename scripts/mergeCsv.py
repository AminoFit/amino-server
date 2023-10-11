import csv

# Create a dictionary to store data from branded_food.csv with fdc_id as the key
branded_food_data = {}

with open("/Users/seb/Downloads/branded apr 2023/branded_food.csv", "r") as bf_file:
    reader = csv.reader(bf_file)
    header = next(reader)  # Skip header
    for row in reader:
        fdc_id = row[0]
        brand_owner = row[1]
        brand_name = row[2]
        branded_food_data[fdc_id] = {"brand_owner": brand_owner, "brand_name": brand_name}

# Open food.csv and create a new file for the output
with open("/Users/seb/Downloads/branded apr 2023/food.csv", "r") as f_file, open("/Users/seb/Downloads/branded apr 2023/output.csv", "w", newline="") as out_file:
    reader = csv.reader(f_file)
    writer = csv.writer(out_file)
    header = next(reader)  # Skip header

    # Write the new header to the output CSV
    writer.writerow(["fdc_id", "description", "brand_owner", "brand_name"])

    for row in reader:
        fdc_id = row[0]
        description = row[2]

        if fdc_id in branded_food_data:
            brand_owner = branded_food_data[fdc_id]["brand_owner"]
            brand_name = branded_food_data[fdc_id]["brand_name"]
            writer.writerow([fdc_id, description, brand_owner, brand_name])
