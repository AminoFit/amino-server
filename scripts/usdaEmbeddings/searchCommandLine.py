import asyncio
from FlagEmbedding import FlagModel
import time
from gte_embedding import getGteEmbedding
import torch
import asyncpg
import os
from urllib.parse import urlparse, urlunparse
from dotenv import load_dotenv

# Load environment variables
load_dotenv(dotenv_path="prisma/.env")
DATABASE_URL = os.getenv("DATABASE_URL")
parsed_url = urlparse(DATABASE_URL)
sanitized_url = urlunparse((parsed_url.scheme, parsed_url.netloc, parsed_url.path, "", "", ""))

model = FlagModel('BAAI/bge-base-en-v1.5', use_fp16=False)
model_large = FlagModel('BAAI/bge-large-en-v1.5', use_fp16=False)

def construct_sentence(item):
    description = item.get('description', '')  # Using 'description'
    brand = item.get('brand', '')
    owner = item.get('owner', '')

    components = [description]
    if brand:
        components.append(brand)
    if owner:
        components.append(owner)

    # Join components together
    return " - ".join(filter(None, components))

def construct_sentence_results(item):
    foodName = item.get('foodName', '') 
    foodBrand = item.get('foodBrand', '')
    brandOwner = item.get('brandOwner', '')

    components = [foodName]
    if foodBrand:
        components.append(foodBrand)
    if brandOwner:
        components.append(brandOwner)

    # Join components together
    return " - ".join(filter(None, components))


    
def vector_to_sql(value):
    return '[' + ','.join(map(str, value)) + ']'
    
async def search_similar_foods(conn, sentence):
    embedding_id = await fetch_or_save_embedding(conn, sentence)
    isBranded = bool(sentence.split()[-1])  # Just a placeholder, replace with your logic for determining branded foods.
    whereCondition = ("'foodBrand' IS NOT NULL" if isBranded else "'foodBrand' IS NULL OR 'foodBrand' = ''")

    similar_foods = await conn.fetch(
        """
        SELECT 
            "fdcId", 
            "foodName", 
            "foodBrand", 
            "bgeBaseEmbedding"::text, 
            1 - ("bgeBaseEmbedding" <=> (SELECT "bgeBaseEmbedding" FROM "foodEmbeddingCache" WHERE id = $1)) AS cosine_similarity 
        FROM 
            "UsdaFoodItemEmbedding" 
        WHERE 
            """ + whereCondition + """
            AND "bgeBaseEmbedding" is not null
        ORDER BY 
        ("bgeBaseEmbedding" <#> (SELECT "bgeBaseEmbedding" FROM "foodEmbeddingCache" WHERE id = $1)) ASC
        LIMIT 10
        """, embedding_id
    )
    return similar_foods


async def get_embedding(sentence, model_name='BAAI/bge-base-en-v1.5'):
    model = FlagModel(model_name, use_fp16=False)
    return model.encode([sentence])[0].tolist()

def array_to_pg_vector(arr):
    """Convert a Python list to PostgreSQL vector format."""
    return "{" + ",".join(map(str, arr)) + "}"

async def fetch_or_save_embedding(conn, sentence):
    # Fetch from cache
    cached_embedding = await conn.fetchrow(
        'SELECT id FROM "foodEmbeddingCache" WHERE "textToEmbed" = $1 AND "bgeBaseEmbedding" IS NOT NULL',
        sentence
    )
    if cached_embedding:
        return cached_embedding["id"]
    else:
        new_embedding_array = await get_embedding(sentence)
        
        # Insert or update the embedding
        result = await conn.fetchrow("""
            INSERT INTO "foodEmbeddingCache" ("textToEmbed", "bgeBaseEmbedding")
            VALUES ($1, $2::float8[])
            ON CONFLICT ("textToEmbed")
            DO UPDATE SET "bgeBaseEmbedding" = EXCLUDED."bgeBaseEmbedding"
            WHERE "foodEmbeddingCache"."bgeBaseEmbedding" IS NULL
            RETURNING id
        """, sentence, new_embedding_array)

        return result["id"]


async def main():
    # Establish database connection
    conn = await asyncpg.connect(sanitized_url)

    while True:
        search_term = input("\nEnter a search term (or type 'exit' to quit): ")
        
        if search_term.lower() == 'exit':
            break
        
        start_time = time.time()
        similar_foods = await search_similar_foods(conn, search_term)  # Assumes this function remains unchanged
        elapsed_time = time.time() - start_time

        # Generate GTE Embeddings for the search term
        search_term_embedding_gte = getGteEmbedding([search_term])[0]

        # Batch all food sentences
        food_sentences = [construct_sentence_results(food) for food in similar_foods]

        # Generate GTE Embeddings for all food items in a single batch
        food_embeddings_gte = getGteEmbedding(food_sentences)

        # Calculate GTE similarity
        gte_similarities = torch.nn.functional.cosine_similarity(
            search_term_embedding_gte.unsqueeze(0),
            food_embeddings_gte
        ).tolist()
        

        print(f"\nTop 10 similar foods (search took {elapsed_time:.3f} s):")
        
        for i, (food, gte_similarity) in enumerate(zip(similar_foods, gte_similarities)):
            print(f"{i+1}. {food['fdcId']} {construct_sentence_results(food)} (BGE Similarity: {food['cosine_similarity']:.3f}, GTE Similarity: {gte_similarity:.3f})")

        #for i, (food, gte_similarity) in enumerate(zip(similar_foods, gte_similarities)):
        #    print(f"{i+1}. {food['fdcId']} {food['foodName']} (Brand: {food.get('foodBrand', 'N/A')}, Owner: {food.get('brandOwner', 'N/A')}, BGE Similarity: {food['cosine_similarity']:.3f}, GTE Similarity: {gte_similarity:.3f})")


    await conn.close()


if __name__ == '__main__':
    asyncio.run(main())
