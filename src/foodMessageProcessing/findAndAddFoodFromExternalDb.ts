import { getCompleteFoodInfo } from "@/FoodDbThirdPty/common/getCompleteFoodInfo"
import { foodSearchResultsWithSimilarityAndEmbedding } from "@/FoodDbThirdPty/common/commonFoodInterface"
import { FoodQuery, findNxFoodInfo } from "@/FoodDbThirdPty/nutritionix/findNxFoodInfo"
import { findFsFoodInfo } from "@/FoodDbThirdPty/fatsecret/findFsFoodInfo"
import { FoodItemWithNutrientsAndServing } from "@/app/dashboard/utils/FoodHelper"
import { getFoodEmbedding, foodToLogEmbedding } from "@/utils/foodEmbedding"
import { FoodItemToLog } from "@/utils/loggedFoodItemInterface"
import { FoodEmbeddingCache } from "@/utils/foodEmbedding"
import { findBestFoodMatchExternalDb } from "./common/selectExternalFood"
import { checkRateLimit } from "@/utils/apiUsageLogging"
import { Tables } from "types/supabase"
import { addFoodItemToDatabase } from "./common/addFoodItemToDatabase"
import { ONE_DAY_IN_MS, ONE_HOUR_IN_MS } from "./common/foodProcessingConstants"
import { printSearchResults } from "./common/processFoodItemsUtils"
import { getFullFoodInformationOnline } from "./getFullFoodInformationOnline/getFullFoodInformationOnline"

async function addFoodFromOnlineInfo(
  foodToLog: FoodItemToLog,
  user: Tables<"User">,
  messageId: number
): Promise<FoodItemWithNutrientsAndServing> {
  const llmFoodItemToSave = await getFullFoodInformationOnline(foodToLog, "", user);
  if (!llmFoodItemToSave) throw new Error("No sourced nutrition found for online food");
  const newFood = await addFoodItemToDatabase(
    llmFoodItemToSave,
    await getFoodEmbedding(llmFoodItemToSave),
    messageId,
    user
  );
  return newFood;
}

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
          console.log("NX result")
          printSearchResults(result || [])
          return result
        } catch (err) {
          console.log("Error finding NX food info", err) // Silently fail
          return null
        }
      }
      return null
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
          console.log("FS result")
          printSearchResults(result || [])
          console.log("Time taken for FatSecret API:", Date.now() - startTime, "ms") // Log the time taken
          return result
        } catch (err) {
          console.log("Error finding FatSecret food info", err)
          return null
        }
      }
      return null
    }

    // Dispatch all API calls simultaneously
    const [nxFoodInfoResponse, fatSecretInfoResponse] = await Promise.all([
      getNxFoodInfo(),
      // getUsdaFoodInfo(),
      getFsFoodInfo()
    ])

    if (nxFoodInfoResponse != null && nxFoodInfoResponse.length > 0) {
      foodInfoResponses.push(...nxFoodInfoResponse)
    }

    // if (usdaFoodInfoResponse != null) {
    //   foodInfoResponses.push(...usdaFoodInfoResponse)
    // }

    if (fatSecretInfoResponse != null) {
      foodInfoResponses.push(...fatSecretInfoResponse)
    }

    // Check if the consolidated array is empty
    if (foodInfoResponses.length === 0) {
      console.log("All food sources returned no results. Searchin online for the food")
      // You can throw an error or return a default value here
      //DO FALLBACK HERE
      const result = await addFoodFromOnlineInfo(foodToLog, user, messageId)
      return result
    }
    // Retrieval similarity orders evidence; the selector checks food identity.
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

    const highestSimilarityItem = await findBestFoodMatchExternalDb(user, foodToLog, foodInfoResponses)

    // If we have an item check is we are missing a field
    if (highestSimilarityItem) {
      // Ensure we have the full food item info
      try {
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
      } catch (error) {
        console.error("Error getting complete food info, continuing to search using fallback:", error)
      }
    }

    // No supported structured candidate; use one sourced web-food proposal.
    const newFood = addFoodFromOnlineInfo(foodToLog, user, messageId)

    return newFood
  } catch (err) {
    console.log("Error getting food item info", err)
    throw err
  }
}
