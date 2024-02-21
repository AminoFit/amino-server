import { getCompleteFoodInfo } from "@/FoodDbThirdPty/common/getCompleteFoodInfo"
import { foodSearchResultsWithSimilarityAndEmbedding } from "@/FoodDbThirdPty/common/commonFoodInterface"
import { FoodQuery, findNxFoodInfo } from "@/FoodDbThirdPty/nutritionix/findNxFoodInfo"
import { findFsFoodInfo } from "@/FoodDbThirdPty/fatsecret/findFsFoodInfo"
import { searchUsdaByEmbedding } from "@/FoodDbThirdPty/USDA/searchUsdaByEmbedding"
import { FoodItemWithNutrientsAndServing } from "@/app/dashboard/utils/FoodHelper"
import { getFoodEmbedding, foodToLogEmbedding } from "@/utils/foodEmbedding"
import { FoodItemToLog } from "@/utils/loggedFoodItemInterface"
import { FoodEmbeddingCache } from "@/utils/foodEmbedding"
import { foodItemCompletion } from "./legacy/foodItemCompletion"
import { mapOpenAiFoodInfoToFoodItem, FoodInfo } from "./legacy/foodItemInterface"
import { findBestFoodMatchExternalDb } from "./legacy/matchFoodItemtoExternalDb"
import { checkRateLimit } from "@/utils/apiUsageLogging"
import { constructFoodItemRequestString } from "@/database/OpenAiFunctions/utils/foodLogHelper"
import { Tables } from "types/supabase"
import { addFoodItemToDatabase } from "./common/addFoodItemToDatabase"
import { ONE_DAY_IN_MS, ONE_HOUR_IN_MS, COSINE_THRESHOLD } from "./common/foodProcessingConstants"
import { printSearchResults } from "./common/processFoodItemsUtils"
import { createAdminSupabase } from "@/utils/supabase/serverAdmin"

export async function findAndAddFoodItemInExternalDatabase(
  foodToLog: FoodItemToLog,
  queryEmbeddingCache: FoodEmbeddingCache,
  user: Tables<"User">,
  messageId: number
): Promise<FoodItemWithNutrientsAndServing> {
  console.log("food", foodToLog)

  try {
    // Create a new variable based off the user_food_descriptive_name or full_name
    let fullFoodName = foodToLog.food_database_search_name

    // Append the brand name if it is not present in the original string
    if (foodToLog.branded && foodToLog.brand && !fullFoodName.toLowerCase().includes(foodToLog.brand.toLowerCase())) {
      fullFoodName += ` - ${foodToLog.brand}`
    }

    // Construct the query for findNxFoodInfo
    const foodQuery: FoodQuery = {
      food_name: foodToLog.food_database_search_name,
      food_full_name: fullFoodName,
      branded: foodToLog.branded || false,
      queryBgeBaseEmbedding: queryEmbeddingCache.bge_base_embedding!
    }

    const foodInfoResponses: foodSearchResultsWithSimilarityAndEmbedding[] = []

    const getNxFoodInfo = async () => {
      const startTime = Date.now() // Capture start time
      if (await checkRateLimit("nutritionix", 45, ONE_DAY_IN_MS)) {
        try {
          const result = await findNxFoodInfo(foodQuery)
          console.log("Time taken for Nutritionix API:", Date.now() - startTime, "ms") // Log the time taken
          return result
        } catch (err) {
          console.log("Error finding NX food info", err) // Silently fail
          return null
        }
      }
      return null
    }

    const getUsdaFoodInfo = async () => {
      const startTime = Date.now()
      try {
        const usda_find_food_params = {
          food_name: fullFoodName,
          branded: foodToLog.branded || false,
          brand_name: foodToLog.brand || undefined,
          embedding_cache_id: queryEmbeddingCache.embedding_cache_id
        }
        // console.log("usda_find_food_params", usda_find_food_params)
        const result = await searchUsdaByEmbedding(usda_find_food_params)
        console.log("USDA result")
        printSearchResults(result || [])
        console.log("Time taken for USDA API:", Date.now() - startTime, "ms") // Log the time taken
        return result
      } catch (err) {
        console.log("Error finding USDA food info", err) // Silently fail
        return null
      }
    }

    const getFsFoodInfo = async () => {
      const startTime = Date.now()
      if (await checkRateLimit("fatsecret", 10000, ONE_HOUR_IN_MS)) {
        try {
          const result = await findFsFoodInfo({
            search_expression: fullFoodName,
            branded: foodToLog.branded || false,
            queryBgeBaseEmbedding: queryEmbeddingCache.bge_base_embedding!
          })
          console.log("Time taken for FatSecret API:", Date.now() - startTime, "ms") // Log the time taken
          return result
        } catch (err) {
          console.log("Error finding FatSecret food info", err)
          return null
        }
      }
      return null
    }

    const nullReturn = async () => {
      let DEBUG = 1
      if (DEBUG) {
        return null
      } else {
        return [
          {
            foodBgeBaseEmbedding: [],
            similarityToQuery: 0,
            foodSource: "User",
            foodName: ""
          } as foodSearchResultsWithSimilarityAndEmbedding
        ]
      }
    }

    // Dispatch all API calls simultaneously
    const [nxFoodInfoResponse, usdaFoodInfoResponse, fatSecretInfoResponse] = await Promise.all([
      getNxFoodInfo(),
      getUsdaFoodInfo(),
      getFsFoodInfo()
    ])

    if (nxFoodInfoResponse != null && nxFoodInfoResponse.length > 0) {
      foodInfoResponses.push(...nxFoodInfoResponse)
    }

    if (usdaFoodInfoResponse != null) {
      foodInfoResponses.push(...usdaFoodInfoResponse)
    }

    if (fatSecretInfoResponse != null) {
      foodInfoResponses.push(...fatSecretInfoResponse)
    }

    // Check if the consolidated array is empty
    if (foodInfoResponses.length === 0) {
      console.error("All food sources returned no results.")
      // You can throw an error or return a default value here
      throw new Error("No food information found.")
    }
    // Find the item with the highest similarity score
    let highestSimilarityItem: foodSearchResultsWithSimilarityAndEmbedding | null = foodInfoResponses.reduce(
      (prev, current) => {
        return prev.similarityToQuery > current.similarityToQuery ? prev : current
      },
      foodInfoResponses[0]
    )
    // Sort the foodInfoResponses array in descending order based on similarityToQuery
    foodInfoResponses.sort((a, b) => b.similarityToQuery - a.similarityToQuery)

    // Iterate over the sorted array and print the desired information
    foodInfoResponses.forEach((item, index) => {
      const brandInfo = item.foodBrand ? ` by ${item.foodBrand}` : ""
      console.log(
        `Item ${index + 1}: ${item.foodName}${brandInfo} - Similarity ${item.similarityToQuery} - Source: ${
          item.foodSource
        }`
      )
    })

    // rank the foodInfoResponses array based on similarityToQuery
    foodInfoResponses.sort((a, b) => b.similarityToQuery - a.similarityToQuery)

    // Start by finding the highest similarity item.
    highestSimilarityItem = foodInfoResponses[0]

    // Check the highest similarity score
    if (highestSimilarityItem.similarityToQuery <= COSINE_THRESHOLD) {
      console.log("")
      const betterMatchItem = await findBestFoodMatchExternalDb(user, foodToLog, foodInfoResponses)
      if (betterMatchItem) {
        highestSimilarityItem = betterMatchItem
      } else {
        highestSimilarityItem = null // Set to null so we can use fallback logic
      }
    }

    // If we have an item check is we are missing a field
    if (highestSimilarityItem) {
      //console.log("Highest similarity item:", highestSimilarityItem!.foodName)
      //console.dir(highestSimilarityItem, { depth: null })
      // Ensure we have the full food item info
      highestSimilarityItem.foodItem = await getCompleteFoodInfo(highestSimilarityItem)

      //console.log("highestSimilarityItem.food", highestSimilarityItem.foodItem)

      let foodItemToSave: FoodItemWithNutrientsAndServing =
        highestSimilarityItem.foodItem! as FoodItemWithNutrientsAndServing

      const newFood = await addFoodItemToDatabase(
        foodItemToSave,
        highestSimilarityItem.foodBgeBaseEmbedding,
        messageId,
        user
      )
      return newFood
    }

    // If we didn't find a match we then rely on GPT-4
    const foodItemCompletionStartTime = Date.now() // Capture start time

    // Fetch complete food info for the top 3 items
    const top3PopulatedFoodItems = await Promise.all(
      foodInfoResponses.slice(0, 3).map(async (item) => {
        item.foodItem = await getCompleteFoodInfo(item)
        return item
      })
    )

    // Construct the request string
    const foodItemRequestString = constructFoodItemRequestString(foodToLog, top3PopulatedFoodItems)
    console.log("foodItemRequestString:\n", foodItemRequestString)
    const { foodItemInfo, model } = await foodItemCompletion(foodItemRequestString, user, foodToLog.branded ? `${foodToLog.food_database_search_name} - ${foodToLog.brand}` : foodToLog.food_database_search_name)
    console.log("Time taken for foodItemCompletion:", Date.now() - foodItemCompletionStartTime, "ms")

    let food: FoodInfo = foodItemInfo
    console.log("food req string:\n", foodItemRequestString)
    const llmFoodItemToSave = mapOpenAiFoodInfoToFoodItem(food, model) as FoodItemWithNutrientsAndServing
    const newFood = await addFoodItemToDatabase(
      llmFoodItemToSave,
      await getFoodEmbedding(llmFoodItemToSave),
      messageId,
      user
    )

    return newFood
  } catch (err) {
    console.log("Error getting food item info", err)
    throw err
  }
}

async function getLoggedFoodItem(id: number) {
  const supabase = createAdminSupabase()
  const { data, error } = await supabase.from("LoggedFoodItem").select("*").eq("id", id).single()
  return data
}

async function getUserByEmail(email: string) {
  const supabase = createAdminSupabase()
  const { data, error } = await supabase.from("User").select("*").eq("email", email).single()
  return data
}

async function testAddFoodFromExternal() {
  // const logged_food_item = await getLoggedFoodItem(2218)
  const messageId = 1200
  const foodToLog = {
    food_database_search_name: "Mushroom Coffee Latte Blend",
    full_item_user_message_including_serving: "1tbsp of Mushroom Coffee Latte Blend",
    branded: true,
    brand: "Om"
  } as FoodItemToLog
  const user = await getUserByEmail("seb.grubb@gmail.com")
  const food_embed_cache = await foodToLogEmbedding(foodToLog)

  const result = await findAndAddFoodItemInExternalDatabase(foodToLog!, food_embed_cache, user!, messageId)
  console.log("result", result)
}

// testAddFoodFromExternal()
