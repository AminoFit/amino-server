import { LoggedFoodItem, FoodItem, FoodImage} from "@prisma/client"

export type LoggedFoodItemWithFoodItem = LoggedFoodItem & { FoodItem: FoodItem & { FoodImage?: FoodImage[] }}

export function getNormalizedFoodValue(
    LoggedFoodItem: LoggedFoodItemWithFoodItem,
    value: string
  ) {
    const nutrientPerServing =
      (LoggedFoodItem.FoodItem[
        value as keyof typeof LoggedFoodItem.FoodItem
      ] as number) || 0
    const grams = LoggedFoodItem.grams || 1
    return (nutrientPerServing / 100.0) * grams
  }