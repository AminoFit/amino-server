import csv
import asyncio
from prisma import Prisma
from tqdm import tqdm

MAX_RECURSION_DEPTH = 1000

MAX_RECURSION_DEPTH = 1000

async def find_resume_point(prisma, csvfile, start, end, fdc_id_idx, description_idx, brand_owner_idx, brand_name_idx, depth=0):
    """Use binary search on CSV file to find the resume point."""
    if start >= end or depth > MAX_RECURSION_DEPTH:
        return end

    mid = (start + end) // 2
    csvfile.seek(mid)  
    csvfile.readline()  

    line = csvfile.readline()
    row = list(csv.reader([line]))[0]  

    if not row:
        print("Encountered an empty row.")
        return await find_resume_point(prisma, csvfile, csvfile.tell(), end, fdc_id_idx, description_idx, brand_owner_idx, brand_name_idx, depth + 1)
    
    # Check if fdc_id_idx is valid for the row
    if len(row) <= fdc_id_idx:
        print(f"Unexpected row format, can't extract fdc_id: {row}")
        return await find_resume_point(prisma, csvfile, csvfile.tell(), end, fdc_id_idx, description_idx, brand_owner_idx, brand_name_idx, depth + 1)

    fdc_id = row[fdc_id_idx]
    print(f"Processing fdc_id: {fdc_id}")

    if len(row) <= max(fdc_id_idx, description_idx, brand_owner_idx or 0, brand_name_idx or 0):
        print(f"Unexpected row format for fdc_id {fdc_id}: {row}")
        return await find_resume_point(prisma, csvfile, csvfile.tell(), end, fdc_id_idx, description_idx, brand_owner_idx, brand_name_idx, depth + 1)

    description = row[description_idx]
    brand_owner = row[brand_owner_idx] if brand_owner_idx is not None else ''
    brand_name = row[brand_name_idx] if brand_name_idx is not None else ''

    exists = await prisma.usdafooditemembedding.find_first(where={
        'foodName': description,
        'foodBrand': brand_name,
        'brandOwner': brand_owner
    })

    if exists:
        return await find_resume_point(prisma, csvfile, csvfile.tell(), end, fdc_id_idx, description_idx, brand_owner_idx, brand_name_idx, depth + 1)
    else:
        return await find_resume_point(prisma, csvfile, start, mid, fdc_id_idx, description_idx, brand_owner_idx, brand_name_idx, depth + 1)



async def main(resume=False):
    prisma = Prisma()
    await prisma.connect()

    csv_file_path = '/Users/seb/Downloads/merged_output.csv'
    
    with open(csv_file_path, 'r') as csvfile:
        # Determine the total number of rows in the CSV for progress tracking
        num_rows = sum(1 for _ in csvfile) - 1  # Subtract one for the header row
        csvfile.seek(0)  # Reset the file pointer back to the beginning

        csvreader = csv.reader(csvfile)
        header = next(csvreader)

        # Determine indices from the header
        fdc_id_idx = header.index('fdc_id')
        description_idx = header.index('description')
        brand_owner_idx = header.index('brand_owner') if 'brand_owner' in header else None
        brand_name_idx = header.index('brand_name') if 'brand_name' in header else None

        if resume:
            resume_point = await find_resume_point(prisma, csvfile, 0, csvfile.seek(0, 2),fdc_id_idx, description_idx, brand_owner_idx, brand_name_idx)
            csvfile.seek(resume_point)
            print(f"Resuming from position: {resume_point}")
            next_line = csvfile.readline()  # Skip the line that we last checked
            header = next_line.strip().split(',')

        batch = []
        batch_size = 1000

        pbar = tqdm(csvfile, total=num_rows, desc="Processing rows", dynamic_ncols=True, position=0, leave=True)

        for line in pbar:
            row = list(csv.reader([line]))[0]
            try:
                fdc_id = int(row[fdc_id_idx])
                description = row[description_idx]
                brand_owner = row[brand_owner_idx] if brand_owner_idx is not None else ''
                brand_name = row[brand_name_idx] if brand_name_idx is not None else ''

                exists = await prisma.usdafooditemembedding.find_first(where={
                    'foodName': description,
                    'foodBrand': brand_name,
                    'brandOwner': brand_owner
                })

                if not exists:
                    batch.append({
                        'fdcId': fdc_id,
                        'foodName': description,
                        'foodBrand': brand_name,
                        'brandOwner': brand_owner,
                    })
                else:
                    pbar.set_description("Skipped existing row")
            except ValueError as e:
                print(f"Error processing row with fdc_id {row[fdc_id_idx]}: {e}")


            if len(batch) >= batch_size:
                await prisma.usdafooditemembedding.create_many(data=batch)
                pbar.set_description("Batch inserted")
                batch.clear()

        if batch:
            await prisma.usdafooditemembedding.create_many(data=batch)

asyncio.run(main(resume=True))