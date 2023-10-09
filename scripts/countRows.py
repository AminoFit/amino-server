import csv

def count_rows_in_csv(file_name):
    row_count = 0
    with open(file_name, 'r') as csv_file:
        for row in csv_file:
            row_count += 1
    return row_count - 1  # Subtract 1 to account for the header row

# Example usage
file_name = "/Users/seb/Downloads/branded apr 2023/output.csv"
row_count = count_rows_in_csv(file_name)
print(f"Number of rows in {file_name}: {row_count}")
