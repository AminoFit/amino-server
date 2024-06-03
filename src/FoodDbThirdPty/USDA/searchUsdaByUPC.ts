// src/FoodDbThirdPty/USDA/searchUsdabyUPC.ts
import axios from "axios";
import { getUsdaFoodsInfo } from "./getFoodInfo";
import { FoodItemWithServings } from "./usdaInterfaceHelper";

const USDA_API_KEY = process.env.USDA_API_KEY;

/**
 * Searches the USDA database for a food item by its UPC code and retrieves detailed information.
 * @param {string} upc The UPC code of the food item to search for.
 * @returns {Promise<FoodItemWithServings | null>} The detailed food item information in FoodItemWithServings format.
 */
export async function searchUsdaByUPC(upc: string): Promise<FoodItemWithServings | null> {
  const baseUrl = 'https://api.nal.usda.gov/fdc/v1/foods/search';
  const params = {
    query: upc,
    pageSize: 1,
    api_key: USDA_API_KEY
  };

  try {
    const response = await axios.get(baseUrl, { params });
    const foods = response.data.foods;
    if (foods.length > 0) {
      const fdcId = foods[0].fdcId;
      const foodDetails = await getUsdaFoodsInfo({ fdcIds: [fdcId.toString()] });
      return foodDetails ? foodDetails[0] : null;
    }
    return null;
  } catch (error) {
    console.error('Error fetching data from USDA API:', error);
    throw error; // Rethrow the error for further handling if needed
  }
}


// Example usage
// searchUsdaByUPC('811620021425')
//   .then(foodItem => console.log(foodItem))
//   .catch(error => console.error('Search failed:', error));
