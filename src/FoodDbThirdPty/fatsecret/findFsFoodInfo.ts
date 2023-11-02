import { cosineSimilarity } from "../../openai/utils/embeddingsHelper"
import { getCachedOrFetchEmbeddings } from "../../utils/embeddingsCache/getCachedOrFetchEmbeddings"
import { findFatSecretFoodInfo, FatSecretFindFoodParams } from "./searchFsFood"
import { FsFoodInfo, convertFsToFoodItem, FoodItemWithServings } from "./fsInterfaceHelper"
import { foodSearchResultsWithSimilarityAndEmbedding } from "../common/commonFoodInterface"
import { FoodItemWithNutrientsAndServing } from "@/app/dashboard/utils/FoodHelper"

const COSINE_THRESHOLD = 0.85

interface FsFoodInfoWithEmbedding {
  item: FoodItemWithServings
  similarity: number
  bgeBaseEmbedding: number[]
}

export async function findFsFoodInfo(
  searchParams: FatSecretFindFoodParams,
  DEBUG = false
): Promise<foodSearchResultsWithSimilarityAndEmbedding[] | null> {
  // Search for food IDs based on the given query
  const searchResponse: FsFoodInfo[] = await findFatSecretFoodInfo({
    search_expression: searchParams.search_expression,
    branded: searchParams.branded,
    max_results: searchParams.max_results,
    queryBgeBaseEmbedding: searchParams.queryBgeBaseEmbedding
  })

  // Check if the result is null or an empty array
  if (!searchResponse || searchResponse.length === 0) {
    return null
  }

  // create an array of all queries to get embeddings for
  const allQueries = searchResponse.map((item) =>
    item.food_type === "Brand" ? `${item.food_name} - ${item.brand_name}` : item.food_name
  )

  console.log("query FS:", searchParams.search_expression)

  // get all embeddings in a single API call
  const allEmbeddings = await getCachedOrFetchEmbeddings("BGE_BASE", allQueries) // Assuming the same embedding function
  // extract query embedding and item embeddings
  const queryBgeBaseEmbedding = searchParams.queryBgeBaseEmbedding
  const itemEmbeddings = allEmbeddings.map(
    (embeddingObject: { id: number; embedding: number[]; text: string }) => embeddingObject.embedding
  )

  // Create an array to store cosine similarities and embeddings
  const foodItemsWithEmbedding: Array<FsFoodInfoWithEmbedding> = []

  for (let i = 0; i < searchResponse.length; i++) {
    // calculate cosine similarity
    const similarity = cosineSimilarity(queryBgeBaseEmbedding, itemEmbeddings[i])

    // add to array only if similarity is 0.8 or more (or adjust the threshold as needed)
    if (similarity >= COSINE_THRESHOLD) {
      foodItemsWithEmbedding.push({
        item: convertFsToFoodItem(searchResponse[i]),
        similarity,
        bgeBaseEmbedding: itemEmbeddings[i]
      })
    }
  }

  // Sort items by cosine similarity
  foodItemsWithEmbedding.sort((a, b) => b.similarity - a.similarity)
  if (DEBUG) {
    console.log("FatSecret results:")
    foodItemsWithEmbedding.slice(0, 3).forEach((itemInfo) => {
      if (itemInfo.item.brand) {
        console.log(`Item: ${itemInfo.item.name} by ${itemInfo.item.brand} has similarity ${itemInfo.similarity}`)
      } else {
        console.log(`Item: ${itemInfo.item.name} has similarity ${itemInfo.similarity}`)
      }
    })
  }

  // If there are no items that match the threshold, return null
  if (foodItemsWithEmbedding.length === 0) return null

  return foodItemsWithEmbedding.slice(0, 3).map((item) => ({
    foodBgeBaseEmbedding: item.bgeBaseEmbedding,
    similarityToQuery: item.similarity,
    foodName: item.item.name,
    foodSource: "FATSECRET",
    externalId: String(item.item.externalId),
    foodBrand: item.item.brand ?? undefined,
    foodItem: item.item as FoodItemWithNutrientsAndServing
  }))
}

async function runTests() {
  const query = "Triple Zero Nonfat Blended Greek Yogurt, Peach By Oikos"
  const queryEmbedding = (await getCachedOrFetchEmbeddings("BGE_BASE", [query]))[0].embedding
  const results = await findFsFoodInfo({
    search_expression: query,
    branded: true,
    queryBgeBaseEmbedding: queryEmbedding
  })
  console.log(results)
  if (results) {
    console.log("similarity " + JSON.stringify(results[0].similarityToQuery))
    console.dir(results[0].foodItem, { depth: null })
  }
}

//runTests()
