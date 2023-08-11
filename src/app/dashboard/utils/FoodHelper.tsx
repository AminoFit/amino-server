import { LoggedFoodItem, FoodItem, FoodImage, Serving } from "@prisma/client"

export type LoggedFoodItemWithFoodItem = LoggedFoodItem & {
  FoodItem: FoodItem & {
    Servings: Serving[]; // Change this line
    FoodImage?: FoodImage[];
  };
};

export function getNormalizedFoodValue(
  LoggedFoodItem: LoggedFoodItemWithFoodItem,
  value: string
) {
  const nutrientPerServing =
    (LoggedFoodItem.FoodItem[
      value as keyof typeof LoggedFoodItem.FoodItem
    ] as number) || 0
  const grams = LoggedFoodItem.grams || 1
  const defaultServingSize = LoggedFoodItem.FoodItem.defaultServingWeightGram || 1
  return (nutrientPerServing / defaultServingSize) * grams
}