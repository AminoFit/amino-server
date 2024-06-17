import { evaluate } from 'mathjs';
import { FoodItemToLog } from '../loggedFoodItemInterface';

export function convertNutritionalInfoStrings(foodItem: FoodItemToLog): FoodItemToLog {
  if (!foodItem.nutritional_information) {
    return foodItem;
  }

  const nutritionalInfo = foodItem.nutritional_information;

  const evaluateString = (value: string): number | null => {
    try {
      const evaluatedValue = evaluate(value);
      if (typeof evaluatedValue === 'number' && !isNaN(evaluatedValue)) {
        return evaluatedValue;
      }
    } catch (error) {
      // If evaluation fails or returns a non-number, return null
      return null;
    }
    return null;
  };

  const convertToNumber = (value: number | string | undefined): number | null | undefined => {
    if (typeof value === 'string') {
      const evaluatedValue = evaluateString(value);
      return evaluatedValue !== null ? evaluatedValue : null;
    }
    return value;
  };

  const convertedNutritionalInfo: { [key: string]: number | null | undefined } = {};

  for (const [key, value] of Object.entries(nutritionalInfo)) {
    convertedNutritionalInfo[key] = convertToNumber(value);
  }

  return {
    ...foodItem,
    nutritional_information: convertedNutritionalInfo,
  };
}
