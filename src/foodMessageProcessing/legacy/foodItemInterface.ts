import { Enums, Tables } from "types/supabase"
import { sanitizeServingName } from "../../database/utils/textSanitize"

export interface FoodItems {
  food_info: FoodInfo[]
}

export interface GptNutrient {
  nutrient_name: string // Nutrient name (e.g. Sodium, Potassium, Vitamin C)
  nutrient_unit: string // Nutrient unit (mg, mcg, IU, etc.)
  nutrient_amount_per_serving: number // Nutrient amount/g of food
}

export interface GptFoodServing {
  serving_weight_g: number // Serving weight in grams
  serving_name: string // Serving description e.g. large, scoop, plate
  serving_alternate_amount: number
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
  fiber_per_serving?: number | null // Fiber (g) normalized to 100g
  sugar_per_serving?: number | null // Sugar (g) normalized to 100g
  added_sugar_per_serving?: number | null // Added sugar (g) normalized to 100g
  protein_per_serving: number // Protein (g) normalized to 100g
  nutrients?: GptNutrient[] // Nutrient information
  servings: GptFoodServing[] // Serving sizes & descriptions
}

interface FoodNutrient extends Omit<Tables<"Nutrient">, "id" | "foodItemId"> {}
interface FoodServing extends Omit<Tables<"Serving">, "id" | "foodItemId"> {}

export interface FoodItemWithServings
  extends Omit<Tables<"FoodItem">, "Serving" | "Nutrient" | "adaEmbedding" | "bgeBaseEmbedding"> {
  Serving: FoodServing[]
  Nutrient: FoodNutrient[]
}

function mapModelToEnum(model: string): Enums<"FoodInfoSource"> {
  if (model.startsWith("gpt-4")) {
    return "GPT4"
  }

  if (model.startsWith("gpt-3.5")) {
    return "GPT3"
  }

  return "User"
}

export function mapOpenAiFoodInfoToFoodItem(food: FoodInfo, model: string): FoodItemWithServings {
  const castToFloatOrNull = (value: any): number | null => {
    if (value === null || value === undefined) {
      return null
    }
    const floatVal = parseFloat(value)
    return isNaN(floatVal) ? null : floatVal
  }
  let dbFoodItem: FoodItemWithServings = {
    id: 0,
    createdAtDateTime: new Date().toISOString(),
    lastUpdated: new Date().toISOString(),
    verified: false,
    userId: null,
    externalId: null,
    UPC: null,
    name: food.name,
    brand: food.brand || "",
    knownAs: food.known_as || [],
    description: food.food_description || "",
    defaultServingWeightGram: food.default_serving_weight_g,
    defaultServingLiquidMl: null,
    weightUnknown: false,
    isLiquid: false,
    kcalPerServing: Number(food.kcal_per_serving),
    totalFatPerServing: Number(food.total_fat_per_serving),
    satFatPerServing: castToFloatOrNull(food.sat_fat_per_serving),
    transFatPerServing: castToFloatOrNull(food.trans_fat_per_serving),
    carbPerServing: Number(food.carb_per_serving),
    fiberPerServing: castToFloatOrNull(food.fiber_per_serving),
    sugarPerServing: castToFloatOrNull(food.sugar_per_serving),
    addedSugarPerServing: castToFloatOrNull(food.added_sugar_per_serving),
    proteinPerServing: Number(food.protein_per_serving),
    messageId: 0,
    foodInfoSource: mapModelToEnum(model),
    Serving:
      food.servings?.map((serving) => ({
        defaultServingAmount: null,
        servingWeightGram: serving.serving_weight_g,
        servingName: sanitizeServingName(serving.serving_name),
        servingAlternateAmount: serving.serving_alternate_amount,
        servingAlternateUnit: sanitizeServingName(serving.serving_name)
      })) || [],
    Nutrient:
      food.nutrients?.map((nutrient) => ({
        nutrientName: nutrient.nutrient_name,
        nutrientUnit: nutrient.nutrient_unit,
        nutrientAmountPerDefaultServing: nutrient.nutrient_amount_per_serving
      })) || [],
  }
  return dbFoodItem
}
