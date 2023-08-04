interface NxFoodInfo {
    food_name: string
}

interface FoodQuery {
    food_name: string,
    brand_name?: string
}

async function findNxFoodInfo(foodQuery: FoodQuery
  ): Promise<NxFoodInfo | null> {
    return null
  }