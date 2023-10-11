import asyncio
from prisma import Prisma
import numpy as np

# Sample values
fdc_id = 12312
food_name = "Sample Food"
food_brand = "Sample Brand"
brand_owner = "Sample Owner"
bge_embedding = np.random.rand(768).tolist()

def vector_to_sql(value):
    return '{' + ','.join(map(str, value)) + '}'


async def main():
    prisma = Prisma()
    await prisma.connect()
    
    # Convert the embedding to a string in the format of a Postgres array
    bge_embedding_sql = vector_to_sql(bge_embedding)

    # Update the entry using a raw SQL query
    await prisma.query_raw(
        f"""
        UPDATE "UsdaFoodItemEmbedding"
        SET "bgeEmbedding" = '{bge_embedding_sql}'::float[]
        WHERE "fdcId" = {fdc_id}
        """
    )
    
    #tables = await prisma.query_raw("SELECT table_name FROM information_schema.tables WHERE table_schema='public';")
    #print(tables)
    #print(dir(prisma))
    # Create the entry
    new_entry = await prisma.usdafooditemembedding.create(
        data={
            'fdcId': 12312,
            'foodName': food_name,
            'foodBrand': food_brand,
            'brandOwner': brand_owner,
            #'bgeEmbedding': bge_embedding,
        }
    )


asyncio.run(main())
