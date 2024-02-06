import { FoodItemIdAndEmbedding } from "@/database/OpenAiFunctions/utils/foodLoggingTypes"

export function isServerTimeData(data: any): data is { current_timestamp: number } {
  return data && typeof data === "object" && "current_timestamp" in data
}

export function printSearchResults(results: FoodItemIdAndEmbedding[]): void {
  console.log("Searching in database")
  console.log("__________________________________________________________")
  results.forEach((item) => {
    const similarity = item.cosine_similarity.toFixed(3)
    const description = item.brand ? `${item.name} - ${item.brand}` : item.name
    console.log(`Similarity: ${similarity} - Item: ${item.id} - ${description}`)
  })
}
