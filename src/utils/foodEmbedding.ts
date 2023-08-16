import { FoodItem } from "@prisma/client"
import { getEmbedding } from "../openai/utils/embeddingsHelper"


export async function foodEmbedding(foodItem: FoodItem): Promise<number[]> {
  // Construct the text input for the embedding
  let textToEmbed = foodItem.name

  // Append the brand name with a hyphen if it doesn't already appear in the name
  if (
    foodItem.brand &&
    !textToEmbed.toLowerCase().includes(foodItem.brand.toLowerCase())
  ) {
    textToEmbed += ` - ${foodItem.brand}`
  }
  const embedding = await getEmbedding([textToEmbed])
  return embedding.data[0].embedding
}
