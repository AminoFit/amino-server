import { evaluate } from 'mathjs';
import { FoodItemToLog } from '../loggedFoodItemInterface';

export function convertNutritionalInfoStrings(foodItem: FoodItemToLog): FoodItemToLog {
  if (!foodItem.nutritional_information) {
    return foodItem;
  }

  const nutritionalInfo = foodItem.nutritional_information;

  const evaluateString = (value: string): number | undefined => {
    try {
      // Evaluate the string expression
      const evaluatedValue = evaluate(value);
      if (typeof evaluatedValue === 'number' && !isNaN(evaluatedValue)) {
        return evaluatedValue;
      }
    } catch (error) {
      // If evaluation fails or returns a non-number, return null
      return undefined;
    }
    return undefined;
  };

  const convertToNumber = (value: number | string | undefined): number | null => {
    if (typeof value === 'string') {
      const evaluatedValue = evaluateString(value);
      return evaluatedValue !== undefined ? evaluatedValue : null; // Return null if undefined
    }
    return value !== undefined ? value : null; // Return null if undefined
  };
  

  const convertedNutritionalInfo: {
    [key: string]: number | null;
  } = {};

  // Loop through each key-value pair and convert
  for (const [key, value] of Object.entries(nutritionalInfo)) {
    convertedNutritionalInfo[key] = convertToNumber(value);
  }

  return {
    ...foodItem,
    nutritional_information: convertedNutritionalInfo,
  };
}
