// src/foodMessageProcessing/common/calculateNutrientData.ts

import { FoodItemWithNutrientsAndServing } from "@/app/dashboard/utils/FoodHelper"
import { FoodItemToLog } from "@/utils/loggedFoodItemInterface"

const nutrientMappingConfig: { [key: string]: string[] } = {
  kcal: ["kcal", "energy", "Energy", "Calories"],
  totalFatG: ["totalFat", "totalFatPerServing", "Total lipid (fat)", "Fat", "Total Fat"],
  satFatG: ["satFat", "satFatPerServing", "Fatty acids, total saturated", "Saturated Fat"],
  transFatG: ["transFat", "transFatPerServing", "Fatty acids, total trans", "Trans Fat"],
  unsatFatG: ["unsaturatedFat", "Unsaturated Fat"],
  polyunsatFatG: ["polyunsaturatedFat", "Fatty acids, total polyunsaturated", "Polyunsaturated Fat"],
  monounsatFatG: ["monounsaturatedFat", "Fatty acids, total monounsaturated", "Monounsaturated Fat"],
  carbG: ["carb", "carbPerServing", "Carbohydrate, by difference", "Total Carbohydrate"],
  fiberG: ["fiber", "fiberPerServing", "Fiber, total dietary", "Dietary Fiber"],
  sugarG: ["sugar", "sugarPerServing", "Sugars, total including NLEA", "Sugars"],
  addedSugarG: ["addedSugar", "addedSugarPerServing", "Sugars, added", "Added Sugars"],
  proteinG: ["protein", "proteinPerServing", "Protein"],
  waterMl: ["water", "Water"],
  vitaminAMcg: ["vitaminA", "Vitamin A, IU", "Vitamin A"],
  vitaminCMg: ["vitaminC", "Vitamin C", "Vitamin C, total ascorbic acid"],
  vitaminDMcg: ["vitaminD", "Vitamin D", "Vitamin D (D2 + D3), International Units"],
  vitaminEMg: ["vitaminE", "Vitamin E", "Vitamin E, IU"],
  vitaminKMcg: ["vitaminK", "Vitamin K (phylloquinone)", "Vitamin K"],
  vitaminB1Mg: ["thiamin", "Thiamin", "Vitamin B1"],
  vitaminB2Mg: ["riboflavin", "Riboflavin", "Vitamin B2"],
  vitaminB3Mg: ["niacin", "Niacin", "Vitamin B3"],
  vitaminB5Mg: ["pantothenicAcid", "Pantothenic acid", "Vitamin B5"],
  vitaminB6Mg: ["vitaminB6", "Vitamin B-6"],
  vitaminB7Mcg: ["biotin", "Biotin", "Vitamin B7"],
  vitaminB9Mcg: ["folate", "Folate, DFE", "Folic acid", "Vitamin B9"],
  vitaminB12Mcg: ["vitaminB12", "Vitamin B-12"],
  calciumMg: ["calcium", "Calcium, Ca", "calciumMg", "Calcium"],
  ironMg: ["iron", "ironMg", "Iron, Fe"],
  magnesiumMg: ["magnesium", "Magnesium, Mg"],
  phosphorusMg: ["phosphorus", "Phosphorus, P"],
  potassiumMg: ["potassium", "Potassium", "potassiumMg", "Potassium, K"],
  sodiumMg: ["sodium", "Sodium", "sodiumMg", "Sodium, Na"],
  zincMg: ["zinc", "Zinc, Zn"],
  copperMg: ["copper", "Copper, Cu"],
  manganeseMg: ["manganese", "Manganese, Mn"],
  seleniumMcg: ["selenium", "Selenium, Se"],
  iodineMcg: ["iodine", "Iodine, I"],
  cholesterolMg: ["cholesterol", "Cholesterol", "cholesterolMg", "Cholesterol"],
  omega3Mg: ["omega3", "Omega-3 fatty acids", "Omega-3 Fatty Acids"],
  omega6Mg: ["omega6", "Omega-6 fatty acids", "Omega-6 Fatty Acids"],
  caffeineMg: ["caffeine", "Caffeine"],
  alcoholG: ["alcohol", "Alcohol, ethyl"]
}


function getMappedNutrientField(nutrientName: string): string | null {
  for (const field in nutrientMappingConfig) {
    if (nutrientMappingConfig[field].includes(nutrientName)) {
      return field
    }
  }
  return null
}

export function calculateNutrientData(foodWeightG: number, foodItemInfo: FoodItemWithNutrientsAndServing): any {
  const servingSize = foodWeightG
  const defaultServingWeightGram = foodItemInfo.defaultServingWeightGram ?? 100 // Use 100 as a fallback if defaultServingWeightGram is null

  const macros = {
    kcal: (foodItemInfo.kcalPerServing ?? 0) * (servingSize / defaultServingWeightGram),
    totalFatG: (foodItemInfo.totalFatPerServing ?? 0) * (servingSize / defaultServingWeightGram),
    satFatG: (foodItemInfo.satFatPerServing ?? 0) * (servingSize / defaultServingWeightGram),
    transFatG: (foodItemInfo.transFatPerServing ?? 0) * (servingSize / defaultServingWeightGram),
    carbG: (foodItemInfo.carbPerServing ?? 0) * (servingSize / defaultServingWeightGram),
    sugarG: (foodItemInfo.sugarPerServing ?? 0) * (servingSize / defaultServingWeightGram),
    addedSugarG: (foodItemInfo.addedSugarPerServing ?? 0) * (servingSize / defaultServingWeightGram),
    proteinG: (foodItemInfo.proteinPerServing ?? 0) * (servingSize / defaultServingWeightGram),
    fiberG: (foodItemInfo.fiberPerServing ?? 0) * (servingSize / defaultServingWeightGram)
  }

  const micronutrients = foodItemInfo.Nutrient.reduce((acc: { [key: string]: number }, nutrient) => {
    const field = getMappedNutrientField(nutrient.nutrientName)
    if (field) {
      acc[field] = nutrient.nutrientAmountPerDefaultServing * (servingSize / defaultServingWeightGram)
    }
    return acc
  }, {})

  return { ...macros, ...micronutrients }
}
