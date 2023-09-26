import csv
import asyncio
from prisma import Prisma

async def main():
    prisma = Prisma()
    await prisma.connect()

    # Replace 'your_csv_file.csv' with the path to your CSV file
    with open('/Users/seb/Downloads/branded apr 2023/output.csv', newline='') as csvfile:
        datareader = csv.reader(csvfile)
        next(datareader)  # Skip the header row

        for row in datareader:
            fdc_id, description, brand_owner, brand_name = row

            # Create a new entry in the database
            new_entry = await prisma.usdafooditemembedding.create(
                data={
                    'fdcId': int(fdc_id),
                    'foodName': description,
                    'foodBrand': brand_name,
                    'brandOwner': brand_owner,
                }
            )

asyncio.run(main())
