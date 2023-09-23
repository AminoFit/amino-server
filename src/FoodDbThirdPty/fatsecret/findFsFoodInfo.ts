import { getEmbedding, cosineSimilarity } from "../../openai/utils/embeddingsHelper"
import { CreateEmbeddingResponseDataInner } from "openai"
import { findFatSecretFoodInfo, FatSecretFindFoodParams } from "./searchFsFood"
import { FsFoodInfo, convertFsToFoodItem, FoodItemWithServings } from "./fsInterfaceHelper"
import { foodSearchResultsWithSimilarityAndEmbedding } from "../common/commonFoodInterface"
import { FoodItemWithNutrientsAndServing } from "@/app/dashboard/utils/FoodHelper"
import { FoodInfoSource } from "@prisma/client"

const COSINE_THRESHOLD = 0.8

interface FsFoodInfoWithEmbedding {
  item: FoodItemWithServings
  similarity: number
  embedding: number[]
}

export async function findFsFoodInfo(searchParams: FatSecretFindFoodParams): Promise<foodSearchResultsWithSimilarityAndEmbedding[] | null> {
  // Search for food IDs based on the given query
  const searchResponse: FsFoodInfo[] = await findFatSecretFoodInfo({
    search_expression: searchParams.search_expression,
    branded: searchParams.branded,
    max_results: searchParams.max_results,
    queryEmbedding: searchParams.queryEmbedding
  })

  // create an array of all queries to get embeddings for
  const allQueries = searchResponse.map((item) =>
      item.food_type === "Brand" ? `${item.food_name} - ${item.brand_name}` : item.food_name
    )
  
  console.log("query FS:", searchParams.search_expression)

  // get all embeddings in a single API call
  const allEmbeddings = await getEmbedding(allQueries) // Assuming the same embedding function

  // extract query embedding and item embeddings
  const queryEmbedding = searchParams.queryEmbedding
  const itemEmbeddings = allEmbeddings.data
    .map((embeddingObject: CreateEmbeddingResponseDataInner) => embeddingObject.embedding)

  // Create an array to store cosine similarities and embeddings
  const foodItemsWithEmbedding: Array<FsFoodInfoWithEmbedding> = []

  for (let i = 0; i < searchResponse.length; i++) {
    // calculate cosine similarity
    const similarity = cosineSimilarity(queryEmbedding, itemEmbeddings[i])

    // add to array only if similarity is 0.8 or more (or adjust the threshold as needed)
    if (similarity >= COSINE_THRESHOLD) {
      foodItemsWithEmbedding.push({
        item: convertFsToFoodItem(searchResponse[i]),
        similarity,
        embedding: itemEmbeddings[i]
      })
    }
  }

  // Sort items by cosine similarity
  foodItemsWithEmbedding.sort((a, b) => b.similarity - a.similarity)

  console.log("FatSecret results:")
  foodItemsWithEmbedding.slice(0, 3).forEach((itemInfo) => {
    if (itemInfo.item.brand) {
      console.log(`Item: ${itemInfo.item.name} by ${itemInfo.item.brand} has similarity ${itemInfo.similarity}`)
    } else {
      console.log(`Item: ${itemInfo.item.name} has similarity ${itemInfo.similarity}`)
    }
  })

  // If there are no items that match the threshold, return null
  if (foodItemsWithEmbedding.length === 0) return null

  /*
  for (let i = 0; i < Math.min(foodItemsWithEmbedding.length, 4); i++) {
    console.log(
      foodItemsWithEmbedding[i].item,
      "with similarity",
      foodItemsWithEmbedding[i].similarity
    )
  }
 */

  return foodItemsWithEmbedding.slice(0, 3).map(item => ({
    foodEmbedding: item.embedding,
    similarityToQuery: item.similarity,
    foodName: item.item.name,
    foodSource: FoodInfoSource.FATSECRET,
    externalId: String(item.item.externalId),
    foodBrand: item.item.brand ?? undefined,
    foodItem: item.item as FoodItemWithNutrientsAndServing
  }));
}

async function runTests() {
  const query = "Fiber Gummies"
  const queryEmbedding = (await getEmbedding([query])).data[0].embedding
  const results = await findFsFoodInfo({
    search_expression: query,
    branded: true,
    queryEmbedding: queryEmbedding
  })
  console.log(results)
  if (results) {
    console.log("similarity" + JSON.stringify(results[0].similarityToQuery))
    console.dir(results[0].foodItem, { depth: null })
  }
}

// runTests()
