import { FoodItemToLog } from "@/utils/loggedFoodItemInterface";

type NutritionField = keyof NonNullable<FoodItemToLog['nutritional_information']>;

export function sanitizeFoodItemNutritionFieldsJSON(jsonObj: any): FoodItemToLog {
    const sanitized: FoodItemToLog = {
      food_database_search_name: jsonObj.full_single_food_database_search_name,
      full_item_user_message_including_serving: jsonObj.full_single_item_user_message_including_serving_or_quantity,
      branded: jsonObj.branded,
      brand: jsonObj.brand || undefined,
      upc: jsonObj.upc,
      timeEaten: jsonObj.timeEaten,
      database_id: jsonObj.database_id,
      nutritional_information: {}
    };
  
    const validNutritionFields: NutritionField[] = [
      'kcal', 'totalFatG', 'satFatG', 'transFatG', 'carbG', 'fiberG', 'sugarG', 'proteinG',
      'waterMl', 'vitaminAMcg', 'vitaminCMg', 'vitaminDMcg', 'vitaminEMg', 'vitaminKMcg',
      'vitaminB1Mg', 'vitaminB2Mg', 'vitaminB3Mg', 'vitaminB5Mg', 'vitaminB6Mg', 'vitaminB7Mcg',
      'vitaminB9Mcg', 'vitaminB12Mcg', 'calciumMg', 'ironMg', 'magnesiumMg', 'phosphorusMg',
      'potassiumMg', 'sodiumMg', 'cholesterolMg', 'caffeineMg', 'alcoholG'
    ];
  
    const nutrientMapping: { [key: string]: NutritionField } = {
      niacinMg: 'vitaminB3Mg',
      thiaminMg: 'vitaminB1Mg',
      riboflavinMg: 'vitaminB2Mg',
      pantothenicAcidMg: 'vitaminB5Mg',
      biotinMcg: 'vitaminB7Mcg',
      folicAcidMcg: 'vitaminB9Mcg',
      cobalaminMcg: 'vitaminB12Mcg',
      // Add more mappings as needed
    };
  
    if (jsonObj.nutritional_information) {
      for (const [key, value] of Object.entries(jsonObj.nutritional_information)) {
        const mappedKey = nutrientMapping[key] as NutritionField || key as NutritionField;
        if (validNutritionFields.includes(mappedKey)) {
          sanitized.nutritional_information![mappedKey] = value as number | string;
        }
      }
    }
  
    // Remove the nutritional_information object if it's empty
    if (Object.keys(sanitized.nutritional_information!).length === 0) {
      delete sanitized.nutritional_information;
    }
  
    return sanitized;
  }