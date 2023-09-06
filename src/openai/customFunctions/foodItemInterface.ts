import { FoodItem, Nutrient } from "@prisma/client"
import { sanitizeServingName } from "../../database/utils/textSanitize"

export interface FoodItems {
  food_info: FoodInfo[]
}

export interface OpenAiNutrient {
  nutrient_name: string // Nutrient name (e.g. Sodium, Potassium, Vitamin C)
  nutrient_unit: string // Nutrient unit (mg, mcg, IU, etc.)
  nutrient_amount_per_g: number // Nutrient amount/g of food
}

export interface Serving {
  serving_weight_g: number // Serving weight in grams
  serving_name: string // Serving description e.g. large, scoop, plate
}

export interface FoodInfo {
  name: string // Food item name. Use the single version of the food item (e.g. apple instead of apples)
  brand?: string | null // Brand name, if applicable. Leave null if unknown
  known_as?: string[] // Other names for the food
  food_description?: string | null // Food description
  default_serving_weight_g: number // Serving weight in g
  kcal_per_serving: number // Calories (g) normalized to 100g
  total_fat_per_serving: number // Total fat (g) normalized to 100g
  sat_fat_per_serving?: number | null // Saturated fat (g) normalized to 100g
  trans_fat_per_serving?: number | null // Trans fat (g) normalized to 100g
  carb_per_serving: number // Carb (g) normalized to 100g
  sugar_per_serving?: number | null // Sugar (g) normalized to 100g
  added_sugar_per_serving?: number | null // Added sugar (g) normalized to 100g
  protein_per_serving: number // Protein (g) normalized to 100g
  nutrients?: OpenAiNutrient[] // Nutrient information
  servings: Serving[] // Serving sizes & descriptions
}

interface FoodNutrient extends Omit<Nutrient, "id" | "foodItemId"> {}

export interface FoodItemWithServings extends Omit<FoodItem, "Servings" | "Nutrients"> {
  Servings: Array<{
    servingWeightGram: number
    servingName: string
  }>
  Nutrients: FoodNutrient[]
}

export function mapOpenAiFoodInfoToFoodItem(food: FoodInfo): FoodItemWithServings {
  let prismaFoodItem: FoodItemWithServings = {
    id: 0,
    lastUpdated: new Date(),
    verified: false,
    userId: null, 
    name: food.name,
    brand: food.brand || "",
    knownAs: food.known_as || [],
    description: food.food_description || "",
    defaultServingWeightGram: food.default_serving_weight_g,
    kcalPerServing: food.kcal_per_serving,
    totalFatPerServing: food.total_fat_per_serving,
    satFatPerServing: food.sat_fat_per_serving ?? 0,
    transFatPerServing: food.trans_fat_per_serving ?? 0,
    carbPerServing: food.carb_per_serving,
    sugarPerServing: food.sugar_per_serving ?? 0,
    addedSugarPerServing: food.added_sugar_per_serving ?? 0,
    proteinPerServing: food.protein_per_serving,
    messageId: 0,
    foodInfoSource: 'GPT4',
    Servings: food.servings?.map((serving) => ({
      servingWeightGram: serving.serving_weight_g,
      servingName: sanitizeServingName(serving.serving_name)
    })) || [],
    Nutrients: food.nutrients?.map((nutrient) => ({
      nutrientName: nutrient.nutrient_name,
      nutrientUnit: nutrient.nutrient_unit,
      nutrientAmountPerGram: nutrient.nutrient_amount_per_g
    })) || []
  }
  return prismaFoodItem
}
