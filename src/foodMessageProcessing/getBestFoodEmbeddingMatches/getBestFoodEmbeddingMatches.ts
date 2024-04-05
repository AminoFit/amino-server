import { FoodItemIdAndEmbedding } from "@/database/OpenAiFunctions/utils/foodLoggingTypes"
import { getCachedOrFetchEmbeddings } from "@/utils/embeddingsCache/getCachedOrFetchEmbeddings"
import { createAdminSupabase } from "@/utils/supabase/serverAdmin"

function dedupeResults(results: FoodItemIdAndEmbedding[]): FoodItemIdAndEmbedding[] {
	const seenIds = new Set<number | string>();
	const seenExternalIds = new Set<string>();
	const dedupedResults: FoodItemIdAndEmbedding[] = [];
  
	for (const item of results) {
	  const key = item.id ?? item.externalId;
	  if (item.foodInfoSource === "USDA") {
		if (!seenExternalIds.has(item.externalId ?? "")) {
		  seenExternalIds.add(item.externalId ?? "");
		  dedupedResults.push(item);
		}
	  } else if (!seenIds.has(key ?? "")) {
		seenIds.add(key ?? "");
		dedupedResults.push(item);
	  }
	}
  
	return dedupedResults;
  }

export async function getBestFoodEmbeddingMatches(
  foodEmbeddingId: number,
  messageEmbeddingId: number
): Promise<FoodItemIdAndEmbedding[]> {
  const supabase = createAdminSupabase()

  const [
    searchResultsFoodDbForFoodEmbedding,
    searchResultsUSDAForFoodEmbedding,
    searchResultsFoodDbForMessageEmbedding,
    searchResultsUSDAForMessageEmbedding
  ] = await Promise.all([
    supabase
      .rpc("get_cosine_results", {
        amount_of_results: 20,
        p_embedding_cache_id: foodEmbeddingId
      })
      .then((result) => result.data || []),
    supabase
      .rpc("search_usda_database", {
        embedding_id: foodEmbeddingId,
        limit_amount: 20
      })
      .then((result) =>
        result.data
          ? result.data.map((item) => ({
              id: undefined,
              name: item.foodName,
              brand: item.foodBrand,
              cosine_similarity: item.cosineSimilarity,
              embedding: null,
              foodInfoSource: "USDA",
              externalId: item.fdcId.toString()
            }))
          : []
      ),
    supabase
      .rpc("get_cosine_results", {
        amount_of_results: 5,
        p_embedding_cache_id: messageEmbeddingId
      })
      .then((result) => result.data || []),
    supabase
      .rpc("search_usda_database", {
        embedding_id: messageEmbeddingId,
        limit_amount: 5
      })
      .then((result) =>
        result.data
          ? result.data.map((item) => ({
              id: undefined,
              name: item.foodName,
              brand: item.foodBrand,
              cosine_similarity: item.cosineSimilarity,
              embedding: null,
              foodInfoSource: "USDA",
              externalId: item.fdcId.toString()
            }))
          : []
      )
  ])

  // console.log("results for FoodDbEmbedding")
  // searchResultsFoodDbForFoodEmbedding.map((result, index) => {
  //   console.log(`${index} - ${result.cosine_similarity.toFixed(3)} - ${result.name} - ${result.brand} - id:${result.id} - externalId:${result.externalId} - source:${result.foodInfoSource}`)
  // })

  // console.log("results for UsdaFoods")
  // searchResultsUSDAForFoodEmbedding.map((result, index) => {
  //   console.log(`${index} - ${result.cosine_similarity.toFixed(3)} - ${result.name} - ${result.brand} - id:${result.id} - externalId:${result.externalId} - source:${result.foodInfoSource}`)
  // })

  // console.log("results for MessageEmbedding")
  // searchResultsFoodDbForMessageEmbedding.map((result, index) => {
  //   console.log(`${index} - ${result.cosine_similarity.toFixed(3)} - ${result.name} - ${result.brand} - id:${result.id} - externalId:${result.externalId} - source:${result.foodInfoSource}`)
  // })

  // console.log("results for Usda Message Embedding")
  // searchResultsUSDAForMessageEmbedding.map((result, index) => {
  //   console.log(`${index} - ${result.cosine_similarity.toFixed(3)} - ${result.name} - ${result.brand} - id:${result.id} - externalId:${result.externalId} - source:${result.foodInfoSource}`)
  // })
  // console.log("_____________________")

  const dedupedResultsFoodDbForFoodEmbedding = dedupeResults([
    ...searchResultsFoodDbForFoodEmbedding,
    ...searchResultsUSDAForFoodEmbedding,
    ...searchResultsFoodDbForMessageEmbedding,
    ...searchResultsUSDAForMessageEmbedding
  ])

  // sort by cosine similarity
  dedupedResultsFoodDbForFoodEmbedding.sort((a, b) => b.cosine_similarity - a.cosine_similarity)
  return dedupedResultsFoodDbForFoodEmbedding
}

async function testGetBestFoodEmbeddingMatches() {
  const messageEmbedding = await getCachedOrFetchEmbeddings("BGE_BASE", ["Intense Dark 92% Cacao Dark Chocolate, Intense Dark 92% Cacao"])
  const foodEmbeddingId = await getCachedOrFetchEmbeddings("BGE_BASE", ["Ghirardelli Dark Chocolate, Intense Dark 92% Cacao"])

  console.log("messageEmbeddingId", messageEmbedding[0].id)
  console.log("foodEmbeddingId", foodEmbeddingId[0].id)

  const result = await getBestFoodEmbeddingMatches(messageEmbedding[0].id, foodEmbeddingId[0].id)
  result.forEach((resultItem, index) => {
    if (resultItem.foodInfoSource === "USDA" && resultItem.externalId && !resultItem.id) {
      console.log(JSON.stringify(resultItem, null, 2))
    }
    else {
      console.log(`${index} - ${resultItem.name} - ${resultItem.brand} - ${resultItem.cosine_similarity} - ${resultItem.foodInfoSource} - ${resultItem.externalId} - ${resultItem.id}`)
    }
  })
}

// testGetBestFoodEmbeddingMatches()
