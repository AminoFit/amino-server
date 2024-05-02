import { getFoodItemFromDbOrExternal } from "@/foodMessageProcessing/findBestLoggedFoodItemMatchToFood"
import { FoodItemIdAndEmbedding } from "@/database/OpenAiFunctions/utils/foodLoggingTypes"
import { getUserByEmail } from "@/foodMessageProcessing/common/debugHelper"

async function addFoodSpeedTesting() {
  const user = await getUserByEmail("seb.grubb@gmail.com")
  const food: FoodItemIdAndEmbedding = {
    id: undefined,
    name: "SILK Vanilla, soymilk",
    brand: "",
    cosine_similarity: 0.85,
    foodInfoSource: "USDA",
    externalId: "175219"
  }
  getFoodItemFromDbOrExternal(food, user!, 1)
}

// addFoodSpeedTesting()