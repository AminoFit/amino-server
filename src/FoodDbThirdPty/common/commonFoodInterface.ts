import { FoodItemWithNutrientsAndServing } from "@/app/dashboard/utils/FoodHelper"
import { FoodInfoSource } from "@prisma/client"

export interface foodSearchResultsWithSimilarityAndEmbedding {
    foodEmbedding: number[]
    similarityToQuery: number
    foodSource: FoodInfoSource
    foodName: string
    foodBrand?: string
    externalId?: string
    foodItem?: FoodItemWithNutrientsAndServing
}