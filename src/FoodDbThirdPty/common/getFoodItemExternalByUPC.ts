// src/FoodDbThirdPty/common/getFoodItemExternalByUPC.ts
import { getFatSecretFoodByUPC } from '../fatsecret/getFatSecretFoodByUPC';
import { FoodItemWithNutrientsAndServing } from '../../app/dashboard/utils/FoodHelper';
import { searchUsdaByUPC } from '../USDA/searchUsdabyUPC';
import { getNxFoodByUPC } from '../nutritionix/getNxFoodByUPC';

/**
 * Searches for a food item by UPC across multiple data sources (USDA, Nutritionix, FatSecret).
 * It returns the first successful match found.
 * @param {string} upc The UPC code of the food item to search for.
 * @returns {Promise<FoodItemWithNutrientsAndServing | null>} A promise resolving to the found food item or null if none found.
 */
export async function getFoodItemExternalByUPC(upc: string): Promise<FoodItemWithNutrientsAndServing | null> {
    // Try searching in USDA database
    try {
        const usdaResult = await searchUsdaByUPC(upc);
        if (usdaResult) {
            return usdaResult as FoodItemWithNutrientsAndServing;
        }
    } catch (error) {
        console.error('Error fetching data from USDA API:', error);
    }

    // Try searching in Nutritionix database
    try {
        const nutritionixResult = await getNxFoodByUPC(upc);
        if (nutritionixResult) {
            return nutritionixResult[0] as FoodItemWithNutrientsAndServing;
        }
    } catch (error) {
        console.error('Error fetching data from Nutritionix API:', error);
    }

    // Try searching in FatSecret database
    try {
        const fatSecretResult = await getFatSecretFoodByUPC(upc);
        if (fatSecretResult) {
            return fatSecretResult as FoodItemWithNutrientsAndServing;
        }
    } catch (error) {
        console.error('Error fetching data from FatSecret API:', error);
    }

    return null;  // Return null if no results found in any database
}

// // Example usage:
// getFoodItemExternalByUPC('811620021425')
//     .then(foodItem => {
//         if (foodItem) {
//             console.log('Food Item:', foodItem);
//         } else {
//             console.log('No food item found for this UPC.');
//         }
//     })
//     .catch(error => console.error('Error in retrieving food item:', error));
