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
          console.log("fetching fdcid:", foodItem.externalId)
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

async function testGetCompleteFoodInfo(){
  const foodSearchResultsWithSimilarityAndEmbedding: foodSearchResultsWithSimilarityAndEmbedding = {
    foodBgeBaseEmbedding: [0.5, 0.2, 0.8, 0.1, 0.1], 
    similarityToQuery: 0.87, 
    foodSource: "USDA",
    foodName: "Chicken Breast",
    foodBrand: "",
    externalId: "2341386",
    foodItem: undefined
  };
  const nutritionix_english_muffin: foodSearchResultsWithSimilarityAndEmbedding = {
    foodBgeBaseEmbedding: [
       -0.025500452,   -0.05125706,   0.013045359, -0.034442104,   0.048705615
    ],
    similarityToQuery: 1.0000,
    foodSource: 'NUTRITIONIX',
    foodName: 'english muffin',
    externalId: undefined,
    foodBrand: undefined
  }
  console.log(await getCompleteFoodInfo(nutritionix_english_muffin))
}

//testGetCompleteFoodInfo()