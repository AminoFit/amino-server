// OpenAI
import { findBestFoodMatchtoLocalDb } from "./localDbFoodMatch/matchFoodItemToLocalDb"
import { FoodItemIdAndEmbedding } from "@/database/OpenAiFunctions/utils/foodLoggingTypes"

// Utils
import { FoodEmbeddingCache, getFoodEmbedding } from "@/utils/foodEmbedding"
import { FoodItemToLog } from "@/utils/loggedFoodItemInterface"

// App
import { FoodItemWithNutrientsAndServing } from "@/app/dashboard/utils/FoodHelper"
import { findAndAddFoodItemInExternalDatabase } from "./findAndAddFoodFromExternalDb"
// Database

import { Tables } from "types/supabase"
import { createAdminSupabase } from "@/utils/supabase/serverAdmin"
import { COSINE_THRESHOLD, COSINE_THRESHOLD_LOW_QUALITY } from "./common/foodProcessingConstants"
import { re } from "mathjs"
import { getUsdaFoodsInfo } from "@/FoodDbThirdPty/USDA/getFoodInfo"
import { addFoodItemToDatabase } from "./common/addFoodItemToDatabase"
import { getUserByEmail } from "./common/debugHelper"
import { findBestFoodMatchtoLocalDbLlama } from "./localDbFoodMatch/matchFoodItemToLocalDbLlama"

export async function getFoodItemFromDbOrExternal(
  foodItem: FoodItemIdAndEmbedding,
  user: Tables<"User">,
  messageId: number
): Promise<FoodItemWithNutrientsAndServing> {
  if (foodItem.id) {
    const supabase = createAdminSupabase()
    const { data: foodItemResponse, error } = await supabase
      .from("FoodItem")
      .select("*, Nutrient(*), Serving(*)")
      .eq("id", foodItem.id)
      .single()

    if (error) {
      console.error(error)
      throw new Error("Error getting food item from database")
    }

    return foodItemResponse as FoodItemWithNutrientsAndServing
  } else {
    // Retrieve the food item from the USDA API using the externalId
    if (foodItem.externalId && foodItem.foodInfoSource === "USDA") {
      console.log("Retrieving food item from USDA API, was not in database")
      const usdaFoodItems = await getUsdaFoodsInfo({ fdcIds: [foodItem.externalId] })
      if (usdaFoodItems && usdaFoodItems.length > 0) {
        const usdaFoodItem = usdaFoodItems[0]
        let foodEmbedding = await getFoodEmbedding(usdaFoodItem)
        // console.log(JSON.stringify(usdaFoodItem, null, 2))
        // Add the food item to the database
        const newFood = await addFoodItemToDatabase(
          usdaFoodItem as FoodItemWithNutrientsAndServing,
          foodEmbedding,
          messageId,
          user
        )
        return newFood
      } else {
        throw new Error(`Failed to retrieve food item with externalId ${foodItem.externalId} from USDA API`)
      }
    } else {
      throw new Error("No ID or valid externalId found for food item")
    }
  }
}

export async function findBestLoggedFoodItemMatchToFood(
  cosineSearchResults: FoodItemIdAndEmbedding[],
  food: FoodItemToLog,
  userQueryVectorCache: FoodEmbeddingCache,
  user: Tables<"User">,
  messageId: number
): Promise<[FoodItemWithNutrientsAndServing, number | null]> {
  console.log("Finding best match for logged food item")
  // Filter items above the COSINE_THRESHOLD
  const bestMatches = cosineSearchResults.filter((item) => item.cosine_similarity >= COSINE_THRESHOLD)

  if (bestMatches.length) {
    // Return the highest match instantly

    let match = await getFoodItemFromDbOrExternal(bestMatches[0], user, messageId)

    if (match) return [match as FoodItemWithNutrientsAndServing, null]
    throw new Error(`Failed to find FoodItem with id ${bestMatches[0].id}`)
  }

  // No items above COSINE_THRESHOLD, filter for items above COSINE_THRESHOLD_LOW_QUALITY
  const lowQualityMatches = cosineSearchResults.filter((item) => item.cosine_similarity >= COSINE_THRESHOLD_LOW_QUALITY)

  if (lowQualityMatches.length) {
    const topMatches = lowQualityMatches.slice(0, 20)
    console.log("Trying to find best match in local db")
    const [localDbMatch, secondBestMatch] = await findBestFoodMatchtoLocalDbLlama(topMatches, food, user)
    console.log("localDbMatch", localDbMatch?.name, localDbMatch?.brand)
    console.log("secondBestMatch", secondBestMatch?.name, secondBestMatch?.brand)
    if (localDbMatch) {
      // Return the highest match instantly
      let match = await getFoodItemFromDbOrExternal(localDbMatch, user, messageId)
      let secondBestMatchId = null
      if (secondBestMatch) {
        secondBestMatchId = (await getFoodItemFromDbOrExternal(secondBestMatch, user, messageId)).id
      }
      console.log("match", match.name, match.brand)
      if (match) {
        console.log("FOUND best match in local db")
        return [match as FoodItemWithNutrientsAndServing, secondBestMatchId]
      }
      throw new Error(`Failed to find FoodItem with id ${localDbMatch.id}`)
    }
  }
  console.log("Trying to find best match in external db")
  // Fetch from external databases
  return [await findAndAddFoodItemInExternalDatabase(food, userQueryVectorCache, user, messageId), null]
}

async function testGetFoodOrAdd() {
  const user = await getUserByEmail("seb.grubb@gmail.com")
  let fooditem = {
    name: "Peanut Butter Banana With Dark Chocolate Energy Bar, Peanut Butter Banana With Dark Chocolate",
    brand: "Clif",
    cosine_similarity: 0.907056764819736,
    embedding: null,
    foodInfoSource: "USDA",
    externalId: "2104488"
  } as FoodItemIdAndEmbedding

  let result = await getFoodItemFromDbOrExternal(fooditem, user!, 1)
  console.log(result)
}

// testGetFoodOrAdd()