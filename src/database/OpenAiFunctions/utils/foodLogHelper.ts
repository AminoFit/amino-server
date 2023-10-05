import { foodSearchResultsWithSimilarityAndEmbedding } from "@/FoodDbThirdPty/common/commonFoodInterface"
import { FoodItemToLog } from "@/utils/loggedFoodItemInterface"

export function constructFoodItemRequestString(
  foodToLog: FoodItemToLog,
  foodInfoResponses: foodSearchResultsWithSimilarityAndEmbedding[]
): string {
  let foodItemRequestString = `We want to create food information for: ${foodToLog.food_database_search_name}`

  if (foodToLog.brand) {
    foodItemRequestString += ` - ${foodToLog.brand}`
  }

  // Use properties from LoggedFoodServing
  if (foodToLog.serving) {
    foodItemRequestString += ` Serving: ${foodToLog.serving.serving_name}`
    if (foodToLog.serving.total_serving_grams) {
      foodItemRequestString += ` (${foodToLog.serving.total_serving_grams}g)`
    }
    if (foodToLog.serving.is_liquid && foodToLog.serving.total_serving_ml) {
      foodItemRequestString += ` (${foodToLog.serving.total_serving_ml}ml)`
    }
  }
  const top3Items = foodInfoResponses.slice(0, 3)
  if (top3Items.length > 0) {
    foodItemRequestString += `\nThe following food info is provided for context and may not be relevant`
  }
  for (const item of top3Items) {
    foodItemRequestString += `\n\n${item.foodName}`
    if (item.foodBrand) {
      foodItemRequestString += ` - ${item.foodBrand}`
    }

    if (item.foodItem) {
      // Adding default serving weight or ml before the macros
      if (item.foodItem.isLiquid) {
        foodItemRequestString += ` Default Serving: ${item.foodItem.defaultServingLiquidMl}ml`
      } else {
        foodItemRequestString += ` Default Serving: ${item.foodItem.defaultServingWeightGram}g`
      }

      foodItemRequestString += ` Macros: ${item.foodItem.kcalPerServing} kcal, ${item.foodItem.totalFatPerServing}g fat, ${item.foodItem.satFatPerServing}g sat fat, ${item.foodItem.transFatPerServing}g trans fat, ${item.foodItem.carbPerServing}g carbs, ${item.foodItem.fiberPerServing}g fiber, ${item.foodItem.sugarPerServing}g sugar, ${item.foodItem.addedSugarPerServing}g added sugar, ${item.foodItem.proteinPerServing}g protein`

      if (item.foodItem.Servings && item.foodItem.Servings.length > 0) {
        const servingsString = item.foodItem.Servings.slice(0, 3)
          .map((serving) => `${serving.servingName} (${serving.servingWeightGram}g)`)
          .join(", ")
        foodItemRequestString += ` Other Servings: ${servingsString}`
      }
    }
  }
  return foodItemRequestString
}
