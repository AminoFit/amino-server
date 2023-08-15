import { LoggedFoodItem, FoodItem, FoodImage, Serving } from "@prisma/client"

export type LoggedFoodItemWithFoodItem = LoggedFoodItem & {
  FoodItem: FoodItem & {
    Servings: Serving[]; // Change this line
    FoodImage?: FoodImage[];
  } | null; // From the main branch
};

export function getNormalizedFoodValue(
  LoggedFoodItem: LoggedFoodItemWithFoodItem,
  value: string
) {
  if (LoggedFoodItem.FoodItem) { // From the main branch
    const nutrientPerServing =
      (LoggedFoodItem.FoodItem[
        value as keyof typeof LoggedFoodItem.FoodItem
      ] as number) || 0
    const grams = LoggedFoodItem.grams || 1
    const defaultServingSize = LoggedFoodItem.FoodItem.defaultServingWeightGram || 1
    return (nutrientPerServing / defaultServingSize) * grams
  }
  return 0 // From the main branch
}