import { getMissingFoodInfoOnlineQuery } from "./missingFoodInfoOnlineQuery";
import { ChatCompletion } from "openai/resources";
import { FoodItemWithNutrientsAndServing } from "@/app/dashboard/utils/FoodHelper";

const prompt = `The item below is missing some information.

FOOD_INFO_HERE

Output in perfect JSON format all info about:
{
    food_name: string,
    food_brand: string,
    default_serving_amount_grams: number,
    calories: number,
    protein: number,
    fat: number,
    carbs: number,
    serving: {
        serving_id: number,
        serving_name: string,
        serving_weight_grams: number,
        serving_calories: number
    }[]
}`

function convertFoodInfo(foodInfo: FoodItemWithNutrientsAndServing) {
    return {
      food_name: foodInfo.name,
      food_brand: foodInfo.brand,
      default_serving_amount_grams: isNaN(foodInfo.defaultServingWeightGram) ? 0 : foodInfo.defaultServingWeightGram,
      calories: foodInfo.kcalPerServing,
      protein: foodInfo.proteinPerServing,
      fat: foodInfo.totalFatPerServing,
      carbs: foodInfo.carbPerServing,
      serving: foodInfo.Serving.map((serving: any) => ({
        serving_id: serving.id,
        serving_name: serving.servingName,
        serving_alternate_amount: serving.servingAlternateAmount,
        serving_weight_grams: isNaN(serving.servingWeightGram) ? 0 : serving.servingWeightGram,
        // Serving calories isn't directly available; assuming the same as the default for simplicity
        serving_calories: foodInfo.kcalPerServing,
      }))
    };
  }

export async function completeMissingFoodInfo(foodInfo: FoodItemWithNutrientsAndServing): Promise<string | null> {
  const response = await getMissingFoodInfoOnlineQuery("")

  if (response) {
    return response
  } else {
    return null
  }
}


async function testCompleteMissingFoodInfo() {
    const mcflurryFood: FoodItemWithNutrientsAndServing = {
        id: 0,
        createdAtDateTime: '2024-02-07T16:50:22.451Z',
        externalId: '2479220',
        UPC: null,
        knownAs: [],
        description: null,
        lastUpdated: '2024-02-07T16:50:22.451Z',
        verified: true,
        userId: null,
        foodInfoSource: 'FATSECRET',
        messageId: null,
        name: 'Shrimp Shumai',
        brand: 'JFC',
        defaultServingWeightGram: NaN,
        defaultServingLiquidMl: null,
        isLiquid: false,
        weightUnknown: true,
        kcalPerServing: 230,
        totalFatPerServing: 10,
        carbPerServing: 24,
        proteinPerServing: 13,
        satFatPerServing: null,
        fiberPerServing: null,
        sugarPerServing: null,
        transFatPerServing: null,
        addedSugarPerServing: null,
        Serving: [
          {
            servingWeightGram: NaN,
            servingAlternateAmount: null,
            servingAlternateUnit: null,
            servingName: '10 pieces',
            defaultServingAmount: null,
            id: 0,
            foodItemId: 0
          }
        ],
        Nutrient: [
          {
            nutrientName: 'Cholesterol',
            nutrientAmountPerDefaultServing: 55,
            nutrientUnit: 'mg',
            id: 0,
            foodItemId: 0,
          }
        ],
        adaEmbedding: null,
        bgeBaseEmbedding: null
      }
    }