export interface FoodItems {
  food_info: FoodInfo[];
}

export interface Nutrient {
  nutrient_name: string; // Nutrient name (e.g. Sodium, Potassium, Vitamin C)
  nutrient_unit: string; // Nutrient unit (mg, mcg, IU, etc.)
  nutrient_amount_per_g: number; // Nutrient amount/g of food
}

export interface Serving {
  serving_weight_g: number; // Serving weight in grams
  serving_name: string; // Serving description e.g. large, scoop, plate
}

export interface FoodInfo {
  name: string; // Food item name. Use the single version of the food item (e.g. apple instead of apples)
  brand?: string | null; // Brand name, if applicable. Leave null if unknown
  known_as?: string[]; // Other names for the food
  food_description?: string | null; // Food description
  default_serving_weight_g: number; // Serving weight in g
  kcal_per_serving: number; // Calories (g) normalized to 100g
  total_fat_per_serving: number; // Total fat (g) normalized to 100g
  sat_fat_per_serving?: number | null; // Saturated fat (g) normalized to 100g
  trans_fat_per_serving?: number | null; // Trans fat (g) normalized to 100g
  carb_per_serving: number; // Carb (g) normalized to 100g
  sugar_per_serving?: number | null; // Sugar (g) normalized to 100g
  added_sugar_per_serving?: number | null; // Added sugar (g) normalized to 100g
  protein_per_serving: number; // Protein (g) normalized to 100g
  nutrients?: Nutrient[]; // Nutrient information
  servings: Serving[]; // Serving sizes & descriptions
}