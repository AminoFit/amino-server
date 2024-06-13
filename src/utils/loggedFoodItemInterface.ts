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
  nutritional_information?: {
    kcal?: number | string;
    totalFatG?: number | string;
    satFatG?: number | string;
    transFatG?: number | string;
    carbG?: number | string;
    fiberG?: number | string;
    sugarG?: number | string;
    proteinG?: number | string;
    waterMl?: number | string;
    vitaminAMcg?: number | string;
    vitaminCMg?: number | string;
    vitaminDMcg?: number | string;
    vitaminEMg?: number | string;
    vitaminKMcg?: number | string;
    vitaminB1Mg?: number | string;
    vitaminB2Mg?: number | string;
    vitaminB3Mg?: number | string;
    vitaminB5Mg?: number | string;
    vitaminB6Mg?: number | string;
    vitaminB7Mcg?: number | string;
    vitaminB9Mcg?: number | string;
    vitaminB12Mcg?: number | string;
    calciumMg?: number | string;
    ironMg?: number | string;
    magnesiumMg?: number | string;
    phosphorusMg?: number | string;
    potassiumMg?: number | string;
    sodiumMg?: number | string;
    cholesterolMg?: number | string;
    caffeineMg?: number | string;
    alcoholG?: number | string;
  }
}