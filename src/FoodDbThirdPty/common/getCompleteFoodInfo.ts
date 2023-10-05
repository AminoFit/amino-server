import { foodSearchResultsWithSimilarityAndEmbedding } from "./commonFoodInterface";
import { FoodItemWithNutrientsAndServing } from "@/app/dashboard/utils/FoodHelper";
import { FoodInfoSource } from "@prisma/client";
import { getUsdaFoodsInfo } from "../USDA/getFoodInfo";
import { getNutritionixFoodInfo } from "../nutritionix/getCombinedNutritionixFoodInfo";

export async function getCompleteFoodInfo(
  foodItem: foodSearchResultsWithSimilarityAndEmbedding
): Promise<FoodItemWithNutrientsAndServing | undefined> {
  if (foodItem.foodItem === undefined) {
    switch (foodItem.foodSource) {
      case FoodInfoSource.USDA:
        try {
          const usdaFoodInfo = await getUsdaFoodsInfo({ fdcIds: [foodItem.externalId!] });
          if (usdaFoodInfo && usdaFoodInfo.length > 0) {
            foodItem.foodItem = usdaFoodInfo[0] as FoodItemWithNutrientsAndServing;
          }
        } catch (err) {
          console.error("Error fetching USDA food info:", err);
        }
        break;
      case FoodInfoSource.NUTRITIONIX:
        try {
          const nutritionixFoodInfo = await getNutritionixFoodInfo(foodItem);
          if (nutritionixFoodInfo && nutritionixFoodInfo.length > 0) {
            foodItem.foodItem = nutritionixFoodInfo[0] as FoodItemWithNutrientsAndServing;
          }
        } catch (err) {
          console.error("Error fetching Nutritionix food info:", err);
        }
        break;
    }
  }
  return foodItem.foodItem;
}
