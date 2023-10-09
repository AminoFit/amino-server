import { getBrandedFoodInfo } from "./getBrandedFoodInfo"
import { getNonBrandedFoodInfo } from "./getNonBrandedFoodInfo"
import { NxFoodItemResponse, mapFoodResponseToFoodItem, isNutritionixBrandedItem } from "./nxInterfaceHelper"
import { FoodInfoSource } from "@prisma/client"
import { foodSearchResultsWithSimilarityAndEmbedding } from "@/FoodDbThirdPty/common/commonFoodInterface"


export async function getNutritionixFoodInfo(
    item: foodSearchResultsWithSimilarityAndEmbedding
  ): Promise<NxFoodItemResponse[] | null> {
  
    if (item.externalId && item.foodBrand) {
      const brandedFoodInfo = await getBrandedFoodInfo({
        nix_item_id: item.externalId
      });
  
      const transformedBrandedItem = mapFoodResponseToFoodItem(brandedFoodInfo);
      return transformedBrandedItem ? transformedBrandedItem : null;
  
    } else if (item.foodSource == FoodInfoSource.NUTRITIONIX) {
      const nonBrandedFoodInfo = await getNonBrandedFoodInfo({ query: item.foodName });
  
      const transformedCommonItem = mapFoodResponseToFoodItem(nonBrandedFoodInfo);
      return transformedCommonItem ? transformedCommonItem : null;
    }
  
    return null;
  }
  