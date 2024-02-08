// OpenAI
import { findBestFoodMatchtoLocalDb } from "./matchFoodItemToLocalDb"
import { FoodItemIdAndEmbedding } from "@/database/OpenAiFunctions/utils/foodLoggingTypes"

// Utils
import { FoodEmbeddingCache } from "@/utils/foodEmbedding"
import { FoodItemToLog } from "@/utils/loggedFoodItemInterface"

// App
import { FoodItemWithNutrientsAndServing } from "@/app/dashboard/utils/FoodHelper"
import { findAndAddFoodItemInExternalDatabase } from "./findAndAddFoodFromExternalDb"
// Database

import { Tables } from "types/supabase"
import { createAdminSupabase } from "@/utils/supabase/serverAdmin"
import { COSINE_THRESHOLD, COSINE_THRESHOLD_LOW_QUALITY } from "./common/foodProcessingConstants"

export async function findBestLoggedFoodItemMatchToFood(
    cosineSearchResults: FoodItemIdAndEmbedding[],
    food: FoodItemToLog,
    userQueryVectorCache: FoodEmbeddingCache,
    user: Tables<"User">,
    messageId: number
  ): Promise<[FoodItemWithNutrientsAndServing, number | null]> {
    console.log("Finding best match for logged food item")
    // Filter items above the COSINE_THRESHOLD
    const bestMatches = cosineSearchResults.filter((item) => item.cosine_similarity >= COSINE_THRESHOLD)
  
    const supabase = createAdminSupabase()
  
    if (bestMatches.length) {
      // Return the highest match instantly
  
      const { data: match } = await supabase
        .from("FoodItem")
        .select(`*, Nutrient(*), Serving(*)`)
        .eq("id", bestMatches[0].id)
        .single()
  
      if (match) return [match as FoodItemWithNutrientsAndServing, null]
      throw new Error(`Failed to find FoodItem with id ${bestMatches[0].id}`)
    }
  
    // No items above COSINE_THRESHOLD, filter for items above COSINE_THRESHOLD_LOW_QUALITY
    const lowQualityMatches = cosineSearchResults.filter((item) => item.cosine_similarity >= COSINE_THRESHOLD_LOW_QUALITY)
  
    if (lowQualityMatches.length) {
      const topMatches = lowQualityMatches.slice(0, 20)
      console.log("Trying to find best match in local db")
      const [localDbMatch, secondBestMatchId] = await findBestFoodMatchtoLocalDb(topMatches, food, user)
      if (localDbMatch) {
        // Return the highest match instantly
        const { data: match } = await supabase
          .from("FoodItem")
          .select(`*, Nutrient(*), Serving(*)`)
          .eq("id", localDbMatch.id)
          .single()
        if (match) return [match as FoodItemWithNutrientsAndServing, secondBestMatchId]
        throw new Error(`Failed to find FoodItem with id ${localDbMatch.id}`)
      }
    }
    console.log("Trying to find best match in external db")
    // Fetch from external databases
    return [await findAndAddFoodItemInExternalDatabase(food, userQueryVectorCache, user, messageId), null]
  }