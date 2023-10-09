interface LoggedFoodServing {
  serving_amount: number; 
  serving_name: string; 
  serving_g_or_ml: "g" | "ml"; 
  total_serving_g_or_ml: number; 
}

export interface FoodItemToLog {
  timeEaten?: string;
  food_database_search_name: string;
  branded: boolean;
  brand?: string; 
  serving: LoggedFoodServing; 
}
