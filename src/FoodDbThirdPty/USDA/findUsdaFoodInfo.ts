import { searchFoodIds, UsdaSearchResponse, UsdaFoodIdResults } from "./searchFoodIds"
import { getUsdaFoodsInfo } from "./getFoodInfo"
import { UsdaFoodItem } from "./usdaInterfaceHelper"
import { getAdaEmbedding, cosineSimilarity } from "../../openai/utils/embeddingsHelper"
import { FoodItemWithServings, mapUsdaFoodItemToFoodItem } from "./usdaInterfaceHelper"
import { foodSearchResultsWithSimilarityAndEmbedding } from "../common/commonFoodInterface"
import { FoodInfoSource } from "@prisma/client"

export interface UsdaFindFoodParams {
  queryEmbedding: number[]
  food_name: string
  branded?: boolean
  brand_name?: string
}

const COSINE_THRESHOLD = 0.85
/*
export async function findUsdaFoodInfo(
  searchParams: UsdaFindFoodParams
): Promise<foodSearchResultsWithSimilarityAndEmbedding[] | null> {
  // get the embedding for the search query
  const queryEmbedding = searchParams.queryEmbedding
  // Search for food IDs based on the given query
  const searchResponse: UsdaSearchResponse = await searchFoodIds({
    query: searchParams.food_name,
    branded: searchParams.branded,
    brand_name: searchParams.brand_name,
    query_embedding: queryEmbedding
  })

  // Create an array to store cosine similarities and embeddings
  const usdaCosineSimilarityAndEmbeddings: Array<{
    item: UsdaFoodIdResults
    similarity: number
    embedding: number[]
  }> = []

  for (let i = 0; i < searchResponse.foods.length; i++) {
    // get the pre-calculated cosine similarity and embedding
    let similarity = searchResponse.foods[i].similarity
    let embedding = searchResponse.foods[i].embedding

    // if the embedding is not present, calculate it
    if (!embedding) {
      const nameToEmbed = searchResponse.foods[i].brandName
        ? `${searchResponse.foods[i].description} - ${searchResponse.foods[i].brandName}`
        : searchResponse.foods[i].description
      embedding = (await getAdaEmbedding([nameToEmbed.toLowerCase()])).data[0].embedding
    }

    // if the similarity is not present, calculate it
    if (!similarity) {
      similarity = cosineSimilarity(queryEmbedding, embedding)
    }

    // add to array only if similarity is 0.8 or more (or adjust the threshold as needed)
    if (similarity >= COSINE_THRESHOLD) {
      usdaCosineSimilarityAndEmbeddings.push({
        item: searchResponse.foods[i],
        similarity,
        embedding
      })
    }
  }

  // Sort items by cosine similarity
  usdaCosineSimilarityAndEmbeddings.sort((a, b) => b.similarity - a.similarity)

  // If there are no items that match the threshold, return null
  if (usdaCosineSimilarityAndEmbeddings.length === 0) {
    console.log("No USDA results found")
    return null
  }

  console.log("USDA results:")
  usdaCosineSimilarityAndEmbeddings.slice(0, 3).forEach((itemInfo) => {
    if (itemInfo.item.brandName) {
      console.log(
        `Item: ${itemInfo.item.description} by ${itemInfo.item.brandName} has similarity ${itemInfo.similarity}`
      )
    } else {
      console.log(`Item: ${itemInfo.item.description} has similarity ${itemInfo.similarity}`)
    }
  })

  // Map usdaCosineSimilarityAndEmbeddings to foodSearchResultsWithSimilarityAndEmbedding
  const foodSearchResults: foodSearchResultsWithSimilarityAndEmbedding[] = usdaCosineSimilarityAndEmbeddings.map(
    (item) => {
      return {
        foodEmbedding: item.embedding,
        similarityToQuery: item.similarity,
        foodSource: FoodInfoSource.USDA,
        externalId: String(item.item.fdcId),
        foodName: item.item.description,
        foodBrand: item.item.brandName
        // foodItem is left null as per requirement
      }
    }
  )

  // Return the top 3 results
  return foodSearchResults.slice(0, 3)
}
*/
/*
async function runTests() {
  const queryEmbedding = (await getAdaEmbedding(["Triple Zero Strawberry Yogurt".toLowerCase()])).data[0].embedding
  const results = await findUsdaFoodInfo({
    queryEmbedding: queryEmbedding,
    food_name: "Triple Zero Strawberry Yogurt",
    branded: true,
    brand_name: "Oikos"
  })
  console.log(results)
}
*/
//runTests()
