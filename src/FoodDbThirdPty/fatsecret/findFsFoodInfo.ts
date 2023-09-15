import {
  getEmbedding,
  cosineSimilarity
} from "../../openai/utils/embeddingsHelper"
import { CreateEmbeddingResponseDataInner } from "openai"
import { findFatSecretFoodInfo, FatSecretFindFoodParams } from "./searchFsFood"
import { FsFoodInfo, convertFsToFoodItem, FoodItemWithServings } from "./fsInterfaceHelper"

const COSINE_THRESHOLD = 0.8

interface FsFoodInfoWithEmbedding {
  item: FoodItemWithServings
  similarity: number
  embedding: number[]
}

export async function findFsFoodInfo(
  searchParams: FatSecretFindFoodParams
): Promise<FsFoodInfoWithEmbedding | null> {
  // Search for food IDs based on the given query
  const searchResponse: FsFoodInfo[] = await findFatSecretFoodInfo({
    search_expression: searchParams.search_expression,
    branded: searchParams.branded,
    max_results: searchParams.max_results
  })

  // create an array of all queries to get embeddings for
  const allQueries = [searchParams.search_expression].concat(
    searchResponse.map((item) =>
      item.food_type === "Brand"
        ? `${item.food_name} - ${item.brand_name}`
        : item.food_name
    )
  )

  // get all embeddings in a single API call
  const allEmbeddings = await getEmbedding(allQueries) // Assuming the same embedding function

  // extract query embedding and item embeddings
  const queryEmbedding = allEmbeddings.data[0].embedding
  const itemEmbeddings = allEmbeddings.data
    .slice(1)
    .map(
      (embeddingObject: CreateEmbeddingResponseDataInner) =>
        embeddingObject.embedding
    )

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
  foodItemsWithEmbedding.slice(0,3).forEach((itemInfo) => {
    if (itemInfo.item.brand) {
      console.log(`Item: ${itemInfo.item.name} by ${itemInfo.item.brand} has similarity ${itemInfo.similarity}`);
    } else {
      console.log(`Item: ${itemInfo.item.name} has similarity ${itemInfo.similarity}`);
    }
  });

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

  return foodItemsWithEmbedding[0]
}

async function runTests() {
  const results = await findFsFoodInfo({
    search_expression: "Fiber Gummies",
    branded: true
  })
  //console.log(results)
  console.log("similarity" + JSON.stringify(results?.similarity))
  console.dir(results?.item, { depth: null })
}

// runTests()
