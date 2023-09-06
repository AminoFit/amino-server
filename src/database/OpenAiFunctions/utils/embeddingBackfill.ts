import { PrismaClient } from '@prisma/client';
import { vectorToSql, vectorFromSql } from "@/utils/pgvectorHelper"
import { getFoodEmbedding } from "../../../utils/foodEmbedding"

const prisma = new PrismaClient();

type FoodItemId = {
    id: number;
  };

export async function embeddingBackfill() {
    // Get all IDs of items without embeddings using raw SQL
    const itemsWithoutEmbedding = await prisma.$queryRaw`SELECT id FROM "FoodItem" WHERE embedding::text IS NULL` as FoodItemId[];
  
    // Iterate over the IDs and fetch the full FoodItem objects
    for (const item of itemsWithoutEmbedding) {
      // Fetch the full FoodItem object by ID
      const foodItem = await prisma.foodItem.findUnique({
        where: { id: item.id },
      });
  
      // Check if the foodItem is found and create the embedding
      if (foodItem) {
        const newEmbeddingArray = new Float32Array(await getFoodEmbedding(foodItem));
        const embeddingSql = vectorToSql(Array.from(newEmbeddingArray));
  
        // Update the database record with the new embedding
        await prisma.$executeRaw`UPDATE "FoodItem"
          SET embedding = ${embeddingSql}::vector
          WHERE id = ${foodItem.id}`;
      }
    }
  }
  
  