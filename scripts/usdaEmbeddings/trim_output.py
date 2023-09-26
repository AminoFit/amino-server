import csv

def title_case_string(text: str) -> str:
    return ', '.join(part.title() for part in text.split(', '))

def get_highest_fdc_id(input_csv, output_csv):
    highest_fdc_ids = {}
    with open(input_csv, 'r') as csv_file:
        csv_reader = csv.reader(csv_file)
        headers = next(csv_reader)

        for row in csv_reader:
            fdc_id, desc, owner, name = row
            if not name:  # Skip rows with empty brand_name
                continue

            desc = title_case_string(desc)
            name = title_case_string(name)
            key = (desc, owner, name)

            if key not in highest_fdc_ids:
                highest_fdc_ids[key] = (fdc_id, desc, owner, name)
            else:
                existing_fdc_id = highest_fdc_ids[key][0]
                if fdc_id > existing_fdc_id:
                    highest_fdc_ids[key] = (fdc_id, desc, owner, name)

    # Write to output_csv
    with open(output_csv, 'w', newline='') as csv_file:
        csv_writer = csv.writer(csv_file, quoting=csv.QUOTE_MINIMAL)
        csv_writer.writerow(headers)

        batch_size = 1000
        rows = list(highest_fdc_ids.values())
        for i in range(0, len(rows), batch_size):
            csv_writer.writerows(rows[i:i+batch_size])

get_highest_fdc_id('/Users/seb/Downloads/branded apr 2023/output.csv', '/Users/seb/Downloads/branded apr 2023/trimmed_output.csv')
