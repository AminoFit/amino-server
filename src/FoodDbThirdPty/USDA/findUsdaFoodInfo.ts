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
import {
  FoodItemWithServings,
  mapUsdaFoodItemToFoodItem
} from "./usdaInterfaceHelper"

export interface UsdaFindFoodParams {
  food_name: string
  branded?: boolean
  brand_name?: string
}

const COSINE_THRESHOLD = 0.85

export async function findUsdaFoodInfo(
  searchParams: UsdaFindFoodParams
): Promise<FoodItemWithServings | null> {
  // get the embedding for the search query
  const queryEmbedding = (await getEmbedding([(searchParams.brand_name  ? `${searchParams.food_name} ${searchParams.brand_name}` : searchParams.food_name).toLowerCase()])).data[0].embedding;
  // Search for food IDs based on the given query
  const searchResponse: UsdaSearchResponse = await searchFoodIds({
    query: searchParams.food_name,
    branded: searchParams.branded,
    brand_name: searchParams.brand_name,
    query_embedding: queryEmbedding
  })

  // Create an array to store cosine similarities and embeddings
  const cosineSimilaritiesAndEmbeddings: Array<{
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
      embedding = (await getEmbedding([nameToEmbed.toLowerCase()])).data[0].embedding
    }

    // if the similarity is not present, calculate it
    if (!similarity) {
      similarity = cosineSimilarity(queryEmbedding, embedding)
    }

    // add to array only if similarity is 0.8 or more (or adjust the threshold as needed)
    if (similarity >= COSINE_THRESHOLD) {
      cosineSimilaritiesAndEmbeddings.push({
        item: searchResponse.foods[i],
        similarity,
        embedding
      })
    }
  }

  // Sort items by cosine similarity
  cosineSimilaritiesAndEmbeddings.sort((a, b) => b.similarity - a.similarity)

  // If there are no items that match the threshold, return null
  if (cosineSimilaritiesAndEmbeddings.length === 0){
    console.log("No USDA results found")
    return null
  }

  console.log("USDA results:")
  cosineSimilaritiesAndEmbeddings.slice(0,3).forEach((itemInfo) => {
    if (itemInfo.item.brandName) {
      console.log(`Item: ${itemInfo.item.description} by ${itemInfo.item.brandName} has similarity ${itemInfo.similarity}`);
    } else {
      console.log(`Item: ${itemInfo.item.description} has similarity ${itemInfo.similarity}`);
    }
  });

  // Get the top-ranked item's fdcId
  const topItemFdcId = cosineSimilaritiesAndEmbeddings[0].item.fdcId

  // Get the full info for the top item
  const usdaFoodsInfo: UsdaFoodItem[] | null = await getUsdaFoodsInfo({
    fdcIds: [String(topItemFdcId)]
  })

  return usdaFoodsInfo ? mapUsdaFoodItemToFoodItem(usdaFoodsInfo[0]) : null
}

async function runTests() {
  const results = await findUsdaFoodInfo({
    food_name: "Triple Zero Strawberry Yogurt",
    branded: true,
    brand_name: "Oikos"
  })
  console.log(results)
}

// runTests()
