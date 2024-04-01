import { createAdminSupabase } from "@/utils/supabase/serverAdmin"
import { foodToLogEmbedding } from "@/utils/foodEmbedding"
import { FoodItemToLog } from "@/utils/loggedFoodItemInterface"
import { FoodItemIdAndEmbedding } from "@/database/OpenAiFunctions/utils/foodLoggingTypes";
import { i } from "mathjs";

function mergeFoodSearchResults(
  cosineSearchResults: FoodItemIdAndEmbedding[],
  usdaresults: {
    fdcId: number;
    foodName: string;
    foodBrand: string;
    brandOwner: string;
    cosineSimilarity: number;
  }[]
): FoodItemIdAndEmbedding[] {
  const mergedResults: FoodItemIdAndEmbedding[] = [];

  // Add items from cosineSearchResults to mergedResults
  cosineSearchResults.forEach((item) => {
    mergedResults.push({
      id: item.id,
      name: item.name,
      brand: item.brand,
      cosine_similarity: item.cosine_similarity,
      embedding: item.embedding,
      foodInfoSource: item.foodInfoSource,
      externalId: item.externalId,
    });
  });

  // Add items from usdaresults to mergedResults if they don't already exist
  usdaresults.forEach((item) => {
    const existingItem = mergedResults.find(
      (mergedItem) =>
        mergedItem.foodInfoSource === "USDA" &&
        mergedItem.externalId === item.fdcId.toString()
    );

    if (!existingItem) {
      mergedResults.push({
        name: item.foodName,
        brand: item.foodBrand,
        cosine_similarity: item.cosineSimilarity,
        embedding: "",
      });
    } else {
      console.log("Item already exists in mergedResults:", item.fdcId, item.foodName);
    }
  });

  // Sort mergedResults by cosine_similarity
  mergedResults.sort((a, b) => b.cosine_similarity - a.cosine_similarity);
  return mergedResults;
}

async function testFoodMatching() {
  const food = {
    food_database_search_name: "Chocolate Truffle Protein Drink, Chocolate Truffle",
    full_item_user_message_including_serving: "Chocolate Truffle Protein Drink, Chocolate Truffle",
    branded: true,
    brand: "Iconic"
  } as FoodItemToLog

  const supabase = createAdminSupabase()
  
  const userQueryVectorCache = await foodToLogEmbedding(food)

  let { data: cosineSearchResults, error } = await supabase.rpc("get_cosine_results", {
    amount_of_results: 20,
    p_embedding_cache_id: userQueryVectorCache.embedding_cache_id
  })

  // cosineSearchResults?.map((result, index) => {
  //   console.log(`${(index + 1).toString()}.`, result.brand ? `${result.name} - ${result.brand}` : result.name, result.cosine_similarity, result.foodInfoSource,result.externalId)
  // })

  const { data: usdaresults, error: usdaerror } = await supabase.rpc("search_usda_database", {
    embedding_id: userQueryVectorCache.embedding_cache_id,
    limit_amount: 20
  })

  // usdaresults?.map((result, index) => {
  //   console.log(`${(index + 1).toString()}.`, result.foodBrand ? `${result.foodName} - ${result.foodBrand} - ${result.brandOwner}` : result.foodName, result.cosineSimilarity, result.fdcId)
  // })

  const mergedResults = mergeFoodSearchResults(cosineSearchResults as any, usdaresults as any)

  mergedResults?.map((result, index) => {
    console.log(`${(index + 1).toString()}.`, result.brand ? `${result.name} - ${result.brand}` : result.name, result.cosine_similarity, result.foodInfoSource,result.externalId)
  })

}

testFoodMatching()
