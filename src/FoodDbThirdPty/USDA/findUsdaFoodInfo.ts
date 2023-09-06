import {
  searchFoodIds,
  UsdaSearchResponse,
  UsdaFoodIdResults
} from "./searchFoodIds"
import { getUsdaFoodsInfo } from "./getFoodInfo"
import { UsdaFoodItem } from "./usdaInterfaceHelper"
import {
  getEmbedding,
  cosineSimilarity
} from "../../openai/utils/embeddingsHelper"
import { CreateEmbeddingResponseDataInner } from "openai"
import { FoodItemWithServings, mapUsdaFoodItemToFoodItem } from "./usdaInterfaceHelper"

export interface UsdaFindFoodParams {
  food_name: string
  branded?: boolean
  brand_name?: string
}

const COSINE_THRESHOLD = 0.85

export async function findUsdaFoodInfo(
  searchParams: UsdaFindFoodParams
): Promise<FoodItemWithServings | null> {
  // Search for food IDs based on the given query
  const searchResponse: UsdaSearchResponse = await searchFoodIds({
    query: searchParams.food_name,
    branded: searchParams.branded
  })

  // create an array of all queries to get embeddings for
  const allQueries = [searchParams.food_name].concat(
    searchResponse.foods.map((item) => item.description)
  )

  // get all embeddings in a single API call
  const allEmbeddings = await getEmbedding(allQueries) // Assuming the same embedding function

  // extract query embedding and item embeddings
  const queryEmbedding = allEmbeddings.data[0].embedding
  const itemEmbeddings = allEmbeddings.data
    .slice(1)
    .map((embeddingObject: CreateEmbeddingResponseDataInner) => embeddingObject.embedding)

  // Create an array to store cosine similarities and embeddings
  const cosineSimilaritiesAndEmbeddings: Array<{
    item: UsdaFoodIdResults
    similarity: number
    embedding: number[]
  }> = []

  for (let i = 0; i < searchResponse.foods.length; i++) {
    // calculate cosine similarity
    const similarity = cosineSimilarity(queryEmbedding, itemEmbeddings[i])

    // add to array only if similarity is 0.8 or more (or adjust the threshold as needed)
    if (similarity >= COSINE_THRESHOLD) {
      cosineSimilaritiesAndEmbeddings.push({
        item: searchResponse.foods[i],
        similarity,
        embedding: itemEmbeddings[i]
      })
    }
  }

  // Sort items by cosine similarity
  cosineSimilaritiesAndEmbeddings.sort((a, b) => b.similarity - a.similarity)

  // If there are no items that match the threshold, return null
  if (cosineSimilaritiesAndEmbeddings.length === 0) return null

  // Get the top-ranked item's fdcId
  const topItemFdcId = cosineSimilaritiesAndEmbeddings[0].item.fdcId

  // Get the full info for the top item
  const usdaFoodsInfo: UsdaFoodItem[] | null = await getUsdaFoodsInfo({
    fdcIds: [String(topItemFdcId)]
  })

  return usdaFoodsInfo ? mapUsdaFoodItemToFoodItem(usdaFoodsInfo[0]) : null
}

async function runTests() {
  const results = await findUsdaFoodInfo({ food_name: "Protein powder soy", branded: false })
  console.log(results)
}

// runTests()
