import axios from 'axios';
import { mapFoodResponseToFoodItem, CombinedResponse, NxFoodItemResponse } from './nxInterfaceHelper';

interface NutritionixAPIResponse {
  foods: CombinedResponse[];
}

// Nutritionix API endpoint for item lookup by UPC
const NUTRITIONIX_ITEM_ENDPOINT = "https://trackapi.nutritionix.com/v2/search/item";

// Function to fetch food information by UPC code
export async function getNxFoodByUPC(upc: string): Promise<NxFoodItemResponse[] | null> {
  try {
    const response = await axios.get<NutritionixAPIResponse>(`${NUTRITIONIX_ITEM_ENDPOINT}?upc=${upc}`, {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'x-app-id': process.env.NUTRITIONIX_APP_ID,   // Your Nutritionix App ID
        'x-app-key': process.env.NUTRITIONIX_API_KEY  // Your Nutritionix App Key
      }
    });

    // Check if any foods were found
    if (response.data.foods.length > 0) {
      return mapFoodResponseToFoodItem(response.data as any, Number(upc));  // Return the first food item found
    } else {
      return null;  // No food found for the given UPC
    }
  } catch (error: any) {
    console.error('Failed to fetch food data:', error.message);
    return null;  // Return null in case of an error
  }
}

// Example usage:

// getNxFoodByUPC('089094033484').then(foodInfo => {
//   if (foodInfo) {
//     console.log('Food Info:', foodInfo);
//   } else {
//     console.log('No food found for this UPC.');
//   }
// });

