import { getCompleteFoodInfo } from "@/FoodDbThirdPty/common/getCompleteFoodInfo"
import { foodSearchResultsWithSimilarityAndEmbedding } from "@/FoodDbThirdPty/common/commonFoodInterface"
import { FoodQuery, findNxFoodInfo } from "@/FoodDbThirdPty/nutritionix/findNxFoodInfo"
import { findFsFoodInfo } from "@/FoodDbThirdPty/fatsecret/findFsFoodInfo"
import { searchUsdaByEmbedding } from "@/FoodDbThirdPty/USDA/searchUsdaByEmbedding"
import { FoodItemWithNutrientsAndServing } from "@/app/dashboard/utils/FoodHelper"
import { createAdminSupabase } from "@/utils/supabase/serverAdmin"
import { vectorToSql } from "@/utils/pgvectorHelper"
import { getFoodEmbedding, foodToLogEmbedding } from "@/utils/foodEmbedding"
import { FoodItemToLog } from "@/utils/loggedFoodItemInterface"
import { FoodEmbeddingCache } from "@/utils/foodEmbedding"
import { foodItemCompletion } from "../foodItemCompletion"
import { FoodInfo, mapOpenAiFoodInfoToFoodItem } from "../foodItemInterface"
import { findBestFoodMatchExternalDb } from "../matchFoodItemtoExternalDb"
import { foodItemMissingFieldComplete } from "@/foodMessageProcessing/legacy/foodItemMissingFieldComplete"
import { foodItemCompleteMissingServingInfo } from "@/foodMessageProcessing/legacy/foodItemCompleteMissingServingInfo"
import { checkRateLimit } from "../../../utils/apiUsageLogging"
import { constructFoodItemRequestString } from "../../../database/OpenAiFunctions/utils/foodLogHelper"
import { Tables } from "types/supabase"
import { assignDefaultServingAmount } from "./handleServingAmount"

// Helper function to check if a number is a positive integer
function isPositiveInteger(value: any) {
  return typeof value === "number" && value > 0 && value % 1 === 0
}

// Helper function to check if a string is non-empty
function isNonEmptyString(value: any) {
  return typeof value === "string" && value.trim().length > 0
}

// Main check function
function checkIfEmptyServings(servings: Tables<"Serving">[]) {
  for (const serving of servings || []) {
    if (
      !isPositiveInteger(serving.servingWeightGram) ||
      !isPositiveInteger(serving.servingAlternateAmount) ||
      !isNonEmptyString(serving.servingName) || // Check for non-empty servingName
      !isNonEmptyString(serving.servingAlternateUnit)
    ) {
      return true
    }
  }
  return false
}
