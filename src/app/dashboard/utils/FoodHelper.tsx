import {
  LoggedFoodItem,
  FoodItem,
  FoodImage,
  LoggedFoodItemPayload
} from "@prisma/client"
import { prisma } from "@/database/prisma"

export type LoggedFoodItemWithFoodItem = LoggedFoodItem & {
  FoodItem: (FoodItem & { FoodImage?: FoodImage[] }) | null;
}

export function getNormalizedFoodValue(
  LoggedFoodItem: LoggedFoodItemWithFoodItem,
  value: string
) {
  if (LoggedFoodItem.FoodItem) {
    const nutrientPerServing =
      (LoggedFoodItem.FoodItem[
        value as keyof typeof LoggedFoodItem.FoodItem
      ] as number) || 0
    const grams = LoggedFoodItem.grams || 1
    const defaultServingSize =
      LoggedFoodItem.FoodItem.defaultServingWeightGram || 1
    return (nutrientPerServing / defaultServingSize) * grams
  }
  return 0
}
