import { FoodItemWithNutrientsAndServing } from "@/app/dashboard/utils/FoodHelper"
import { Enums } from "types/supabase"

export interface foodSearchResultsWithSimilarityAndEmbedding {
  foodBgeBaseEmbedding: number[]
  similarityToQuery: number
  foodSource: Enums<"FoodInfoSource">
  foodName: string
  foodBrand?: string
  externalId?: string
  foodItem?: FoodItemWithNutrientsAndServing
}
