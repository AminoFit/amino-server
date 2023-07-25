export interface Nutrient {
  nutrient_name: string // Nutrient name (e.g. Sodium, Potassium, Vitamin C)
  nutrient_unit: string // Nutrient unit (mg, mcg, IU, etc.)
  nutrient_amount_per_g: number // Nutrient amount/g of food
}

export interface Serving {
  serving_weight_g: number // Serving weight in grams
  serving_name: string // Serving description e.g. 1 large banana
}

export interface FoodInfo {
  name: string // Food item name
  brand?: string | null // Brand name, if applicable
  known_as?: string[] // Other names for the food
  food_description?: string | null // Food description
  default_serving_size: number // Default serving size (100g recommended)
  default_serving_unit: string // Default serving unit (g recommended)
  default_serving_weight_g?: number | null // Serving weight in g if not in g
  kcal_per_serving: number // Calories (g)/serving
  total_fat_per_serving: number // Total fat (g)/serving
  sat_fat_per_serving?: number | null // Saturated fat (g)/serving
  trans_fat_per_serving?: number | null // Trans fat (g)/serving
  carb_per_serving: number // Carb (g)/serving
  sugar_per_serving?: number | null // Sugar (g)/serving
  added_sugar_per_serving?: number | null // Added sugar (g)/serving
  protein_per_serving: number // Protein (g)/serving
  nutrients?: Nutrient[] // Nutrient information
  servings?: Serving[] // Serving sizes & descriptions
}
