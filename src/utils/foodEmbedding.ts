import { FoodItem } from "@prisma/client"
import { getCachedOrFetchEmbeddings } from "./embeddingsCache/getCachedOrFetchEmbeddings"
import { FoodItemToLog } from "../utils/loggedFoodItemInterface"

export interface FoodEmbeddingCache {
  search_string: string,
  embedding_cache_id: number,
  ada_embedding?: number[],
  bge_base_embedding?: number[],
}


export async function getFoodEmbedding(foodItem: FoodItem): Promise<number[]> {
  // Construct the text input for the embedding
  let textToEmbed = foodItem.name

  // Append the brand name with a hyphen if it doesn't already appear in the name
  if (
    foodItem.brand &&
    !textToEmbed.toLowerCase().includes(foodItem.brand.toLowerCase())
  ) {
    textToEmbed += ` - ${foodItem.brand}`
  }
  const embedding = await getCachedOrFetchEmbeddings('BGE_BASE', [textToEmbed])
  return embedding[0].embedding
}

export async function foodToLogEmbedding(foodToLog: FoodItemToLog): Promise<FoodEmbeddingCache> {
  // Construct the text input for the embedding
  let textToEmbed = (foodToLog.food_database_search_name).toLowerCase()

  // Append the brand name with a hyphen if it doesn't already appear in the name
  if (
    foodToLog.branded && foodToLog.brand &&
    !textToEmbed.toLowerCase().includes(foodToLog.brand.toLowerCase())
  ) {
    textToEmbed += ` - ${foodToLog.brand}`
  }

  const embeddings = await getCachedOrFetchEmbeddings('BGE_BASE', [textToEmbed])
  const embedding = embeddings[0].embedding
  const id = embeddings[0].id
  return {search_string: textToEmbed, embedding_cache_id: id, bge_base_embedding: embedding}
}
