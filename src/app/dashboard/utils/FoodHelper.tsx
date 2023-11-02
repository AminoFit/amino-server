import { Tables } from "types/supabase"

export type LoggedFoodItemWithFoodItem = Tables<"LoggedFoodItem"> & {
  FoodItem:
    | (Tables<"FoodItem"> & {
        Serving: Tables<"Serving">[] // Change this line
        FoodImage?: Tables<"FoodImage">[]
      })
    | null // From the main branch
}

export type FoodItemWithNutrientsAndServing = Tables<"FoodItem"> & {
  Nutrient: Tables<"Nutrient">[]
  Serving: Tables<"Serving">[]
}

export function getNormalizedFoodValue(LoggedFoodItem: LoggedFoodItemWithFoodItem, value: string) {
  if (LoggedFoodItem.FoodItem) {
    // From the main branch
    const nutrientPerServing = (LoggedFoodItem.FoodItem[value as keyof typeof LoggedFoodItem.FoodItem] as number) || 0
    const grams = LoggedFoodItem.grams || 1
    const defaultServingSize = LoggedFoodItem.FoodItem.defaultServingWeightGram || 1
    return (nutrientPerServing / defaultServingSize) * grams
  }
  return 0 // From the main branch
}
