import { FoodItem } from "@prisma/client"
import { getEmbedding } from "../openai/utils/embeddingsHelper"
import { FoodItemToLog } from "../utils/loggedFoodItemInterface"


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
  const embedding = await getEmbedding([textToEmbed.toLowerCase()])
  return embedding.data[0].embedding
}

export async function foodToLogEmbedding(foodToLog: FoodItemToLog): Promise<number[]> {
  // Construct the text input for the embedding
  let textToEmbed = (foodToLog.lemmatized_database_search_term || foodToLog.full_name).toLowerCase()

  // Append the brand name with a hyphen if it doesn't already appear in the name
  if (
    foodToLog.branded && foodToLog.brand &&
    !textToEmbed.toLowerCase().includes(foodToLog.brand.toLowerCase())
  ) {
    textToEmbed += ` - ${foodToLog.brand}`
  }
  console.log("searching for ", textToEmbed)
  const embedding = await getEmbedding([textToEmbed])
  return embedding.data[0].embedding
}
