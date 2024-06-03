export interface LoggedFoodServing {
  full_serving_string?: string;
  serving_amount?: number; 
  serving_name?: string; 
  serving_g_or_ml: "g" | "ml"; 
  total_serving_g_or_ml: number,
  serving_id?: number;
}

export interface FoodItemToLog {
  timeEaten?: string;
  food_database_search_name: string;
  full_item_user_message_including_serving: string; 
  branded: boolean;
  brand?: string; 
  serving?: LoggedFoodServing; 
  database_id?: number;
  upc?: number;
}