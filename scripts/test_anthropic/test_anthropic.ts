import { createAdminSupabase } from "@/utils/supabase/serverAdmin"
import { foodToLogEmbedding } from "@/utils/foodEmbedding"
import { FoodItemToLog } from "@/utils/loggedFoodItemInterface"

async function testFoodMatching() {
  const food = {
    food_database_search_name: "lemon whybar",
    full_item_user_message_including_serving: "zesty lemon why bar",
    branded: true,
    brand: "whybar"
  } as FoodItemToLog

  const supabase = createAdminSupabase()

  const userQueryVectorCache = await foodToLogEmbedding(food)

  // console.log("userQueryVectorCache", userQueryVectorCache)
  let { data: cosineSearchResults, error } = await supabase.rpc("get_cosine_results", {
    amount_of_results: 20,
    p_embedding_cache_id: userQueryVectorCache.embedding_cache_id
  })

  console.log("cosineSearchResults", cosineSearchResults)

  cosineSearchResults?.map((result, index) => {
    console.log(`${(index + 1).toString()}.`, result.brand ? `${result.name} - ${result.brand}` : result.name, result.cosine_similarity)
  })

  const { data: usdaresults, error: usdaerror } = await supabase.rpc("search_usda_database", {
    embedding_id: userQueryVectorCache.embedding_cache_id,
    limit_amount: 20
  })

  usdaresults?.map((result, index) => {
    console.log(`${(index + 1).toString()}.`, result.foodBrand ? `${result.foodName} - ${result.foodBrand} - ${result.brandOwner}` : result.foodName, result.cosineSimilarity)
  })

}

testFoodMatching()
