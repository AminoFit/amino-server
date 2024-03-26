import { createAdminSupabase } from "@/utils/supabase/serverAdmin"
import { foodToLogEmbedding } from "@/utils/foodEmbedding"
import { FoodItemToLog } from "@/utils/loggedFoodItemInterface"

async function testFoodMatching() {
  const food = {
    food_database_search_name: "corepower elite high protein chocolate",
    full_item_user_message_including_serving: "one corepower elite high protein chocolate fairlife shake",
    branded: true,
    brand: "Fairlife"
  } as FoodItemToLog

  const supabase = createAdminSupabase()

  const userQueryVectorCache = await foodToLogEmbedding(food)

  let { data: cosineSearchResults, error } = await supabase.rpc("get_cosine_results", {
    p_embedding_cache_id: userQueryVectorCache.embedding_cache_id,
    amount_of_results: 20
  })

  cosineSearchResults?.map((result, index) => {
    console.log(`${(index + 1).toString()}.`, result.brand ? `${result.name} - ${result.brand}` : result.name)
  })

  const { data: usdaresults, error: usdaerror } = await supabase.rpc("get_branded_usda_embedding", {
    embeddingId: userQueryVectorCache.embedding_cache_id
  })

  usdaresults?.map((result, index) => {
    console.log(`${(index + 1).toString()}.`, result.foodBrand ? `${result.foodName} - ${result.foodBrand}` : result.foodName)
  })

  const { data: usdaunbrandedresults, error: usdaunbrandederror } = await supabase.rpc("get_unbranded_usda_embedding", {
    embeddingId: userQueryVectorCache.embedding_cache_id
  })

  usdaunbrandedresults?.map((result, index) => {
    console.log(`${(index + 1).toString()}.`, result.foodBrand ? `${result.foodName} - ${result.foodBrand}` : result.foodName)
  })
}

testFoodMatching()
