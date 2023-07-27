export interface Serving {
    serving_amount: number; // Amount of the serving
    serving_name: string; // Description of the serving, e.g. large, cup, piece
    total_serving_grams: number; // The weight of the item eaten in grams. CANNOT BE 0
    total_serving_calories: number;
  }
  
export interface FoodItemToLog {
    full_name: string; // Comprehensive name of the food item. For certain items, mention if it is cooked or not.
    brand?: string; // The brand of the food item
    // cooked?: boolean; // If the item is cooked or not
    lemmatized_database_search_term?: string; // Basic terms to search for in a database, ideally the lemmatized version
    user_food_descriptive_name?: string; // What the user calls the food
    //total_weight_grams: number; // The weight of the serving in grams. CANNOT BE 0
    //calories?: number; // The number of calories in the food item
    timeEaten?: string; // Optional. Time the user consumed the food item in ISO 8601 String format. Example: 2014-09-08T08:02:17-04:00 (no fractional seconds)
    serving: Serving; // Serving size and description of food item
  }  