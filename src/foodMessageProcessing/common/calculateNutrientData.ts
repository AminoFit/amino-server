// src/foodMessageProcessing/common/calculateNutrientData.ts

import { FoodItemWithNutrientsAndServing } from "@/app/dashboard/utils/FoodHelper"
import { FoodItemToLog } from "@/utils/loggedFoodItemInterface"

const nutrientMappingConfig: { [key: string]: string[] } = {
  kcal: ["kcal"],
  totalFatG: ["totalFat", "totalFatPerServing"],
  satFatG: ["satFat", "satFatPerServing"],
  transFatG: ["transFat", "transFatPerServing"],
  carbG: ["carb", "carbPerServing"],
  sugarG: ["sugar", "sugarPerServing"],
  addedSugarG: ["addedSugar", "addedSugarPerServing"],
  proteinG: ["protein", "proteinPerServing"],
  fiberG: ["fiber", "fiberPerServing"],
  sodiumMg: ["sodium", "Sodium", "sodiumMg", "Sodium, Na"],
  cholesterolMg: ["cholesterol", "Cholesterol", "cholesterolMg"],
  ironMg: ["iron", "ironMg"],
  calciumMg: ["calcium", "Calcium, Ca", "calciumMg"],
  potassiumMg: ["potassium", "Potassium", "potassiumMg", "Potassium, K"],
  monounsatFatG: ["Fatty acids, total monounsaturated"],
  vitaminAMcg: ["Vitamin A"],
  vitaminCMg: ["Vitamin C", "vitaminC"],
  vitaminDMcg: ["Vitamin D", "vitaminD", "Vitamin D, mcg"]
}

function getMappedNutrientField(nutrientName: string): string | null {
  for (const field in nutrientMappingConfig) {
    if (nutrientMappingConfig[field].includes(nutrientName)) {
      return field
    }
  }
  return null
}

export function calculateNutrientData(food: FoodItemToLog, bestMatch: FoodItemWithNutrientsAndServing): any {
  const servingSize = food.serving!.total_serving_g_or_ml
  const defaultServingWeightGram = bestMatch.defaultServingWeightGram ?? 100 // Use 100 as a fallback if defaultServingWeightGram is null

  const macros = {
    kcal: (bestMatch.kcalPerServing ?? 0) * (servingSize / defaultServingWeightGram),
    totalFatG: (bestMatch.totalFatPerServing ?? 0) * (servingSize / defaultServingWeightGram),
    satFatG: (bestMatch.satFatPerServing ?? 0) * (servingSize / defaultServingWeightGram),
    transFatG: (bestMatch.transFatPerServing ?? 0) * (servingSize / defaultServingWeightGram),
    carbG: (bestMatch.carbPerServing ?? 0) * (servingSize / defaultServingWeightGram),
    sugarG: (bestMatch.sugarPerServing ?? 0) * (servingSize / defaultServingWeightGram),
    addedSugarG: (bestMatch.addedSugarPerServing ?? 0) * (servingSize / defaultServingWeightGram),
    proteinG: (bestMatch.proteinPerServing ?? 0) * (servingSize / defaultServingWeightGram),
    fiberG: (bestMatch.fiberPerServing ?? 0) * (servingSize / defaultServingWeightGram)
  }

  const micronutrients = bestMatch.Nutrient.reduce((acc: { [key: string]: number }, nutrient) => {
    const field = getMappedNutrientField(nutrient.nutrientName)
    if (field) {
      acc[field] = nutrient.nutrientAmountPerDefaultServing * (servingSize / defaultServingWeightGram)
    }
    return acc
  }, {})

  return { ...macros, ...micronutrients }
}
