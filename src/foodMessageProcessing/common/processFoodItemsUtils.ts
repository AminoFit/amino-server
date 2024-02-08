import { FoodItemIdAndEmbedding } from "@/database/OpenAiFunctions/utils/foodLoggingTypes"
import { foodSearchResultsWithSimilarityAndEmbedding } from "@/FoodDbThirdPty/common/commonFoodInterface";

export function isServerTimeData(data: any): data is { current_timestamp: number } {
  return data && typeof data === "object" && "current_timestamp" in data
}

type SearchResults = FoodItemIdAndEmbedding | foodSearchResultsWithSimilarityAndEmbedding;

function isFoodSearchResultsWithSimilarityAndEmbedding(
  item: SearchResults
): item is foodSearchResultsWithSimilarityAndEmbedding {
  return (item as foodSearchResultsWithSimilarityAndEmbedding).similarityToQuery !== undefined;
}

export function printSearchResults(results: SearchResults[]): void {
  console.log("Searching in database");
  console.log("__________________________________________________________");
  results.forEach((item, index) => {
    if (isFoodSearchResultsWithSimilarityAndEmbedding(item)) {
      const similarity = item.similarityToQuery.toFixed(3);
      const description = item.foodBrand ? `${item.foodName} - ${item.foodBrand}` : item.foodName;
      console.log(`Similarity: ${similarity} - Item ${index}: ${item.foodSource} - ${description}`);
    } else {
      const similarity = item.cosine_similarity.toFixed(3);
      const description = item.brand ? `${item.name} - ${item.brand}` : item.name;
      console.log(`Similarity: ${similarity} - Item ${index}: ${description}`);
    }
  });
}
