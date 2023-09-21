interface LoggedFoodServing {
    serving_amount: number; // Amount of the serving
    serving_name: string; // Description of the serving, e.g. large, cup, piece
    total_serving_grams: number; // The weight of the item eaten in grams. CANNOT BE 0
    total_serving_calories: number;
    is_liquid?: boolean; // Is item liquid
    total_serving_ml?: number; // The millilitre amount of the item. Only for liquid items.
  }
  
export interface FoodItemToLog {
    food_database_search_name: string; // Comprehensive name of the food item. For certain items, mention if it is cooked or not.
    brand?: string; // The brand of the food item
    branded: boolean;
    base_food_name?: string; // Basic terms to search for in a database
    timeEaten?: string; // Optional. Time the user consumed the food item in ISO 8601 String format. Example: 2014-09-08T08:02:17-04:00 (no fractional seconds)
    serving: LoggedFoodServing; // Serving size and description of food item
  }  