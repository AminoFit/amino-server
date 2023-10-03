import { searchUsdaByEmbedding } from "@/FoodDbThirdPty/USDA/searchUsdaByEmbedding"
import { FoodQuery, findNxFoodInfo } from "@/FoodDbThirdPty/nutritionix/findNxFoodInfo"
import { findFsFoodInfo } from "@/FoodDbThirdPty/fatsecret/findFsFoodInfo"
import { getUsdaFoodsInfo } from "@/FoodDbThirdPty/USDA/getFoodInfo"
import UpdateMessage from "@/database/UpdateMessage"
import { FoodInfoSource, FoodItem, LoggedFoodItem, Message, User } from "@prisma/client"
import { foodItemCompletion } from "../../openai/customFunctions/foodItemCompletion"
import { foodItemMissingFieldComplete } from "../../openai/customFunctions/foodItemMissingFieldComplete"
import { FoodInfo, mapOpenAiFoodInfoToFoodItem } from "../../openai/customFunctions/foodItemInterface"
import { checkRateLimit } from "../../utils/apiUsageLogging"
import { FoodItemToLog } from "../../utils/loggedFoodItemInterface"
import { prisma } from "../prisma"
import { getFoodEmbedding, foodToLogEmbedding, FoodEmbeddingCache } from "../../utils/foodEmbedding"
import { vectorToSql } from "@/utils/pgvectorHelper"
import { cosineSimilarity } from "../../openai/utils/embeddingsHelper"
import { sanitizeServingName } from "../utils/textSanitize"
import { FoodItemWithNutrientsAndServing } from "../../app/dashboard/utils/FoodHelper"
import { foodSearchResultsWithSimilarityAndEmbedding } from "@/FoodDbThirdPty//common/commonFoodInterface"

const ONE_HOUR_IN_MS = 60 * 60 * 1000
const ONE_DAY_IN_MS = 24 * ONE_HOUR_IN_MS

// Used to determine if an item is a good match
const COSINE_THRESHOLD = 0.975
// used to determine if an item should be included in a compare list
const COSINE_THRESHOLD_LOW_QUALITY = 0.85

type FoodItemIdAndEmbedding = {
  id: number
  name: string
  brand: string
  cosine_similarity: number
  embedding: string
}

function constructFoodRequestString(foodToLog: FoodItemToLog) {
  let result = ""

  if (foodToLog.brand) {
    // Check if brand exists in full name
    if (foodToLog.food_database_search_name.toLowerCase().indexOf(foodToLog.brand.toLowerCase()) === -1) {
      result += foodToLog.brand + " "
    }
  }
  // Add full name
  result += foodToLog.food_database_search_name

  // Add serving details
  let servingDetails = ""

  if (foodToLog.serving.serving_amount) {
    servingDetails += foodToLog.serving.serving_amount + " " + foodToLog.serving.serving_name
  }

  if (foodToLog.serving.serving_amount && foodToLog.serving.total_serving_grams) {
    servingDetails += " - "
  }

  if (foodToLog.serving.total_serving_grams) {
    servingDetails += foodToLog.serving.total_serving_grams + "g"
  }

  if (servingDetails) {
    result += " (" + servingDetails + ")"
  }

  return result
}

export async function VerifyHandleLogFoodItems(parameters: any) {
  const foodItems: FoodItemToLog[] = parameters.food_items
  for (let food of foodItems) {
    // Ensure total_weight_grams is not 0
    if (food.serving.total_serving_grams === 0) {
      throw new Error("The value for total_weight_grams cannot be 0.")
    }
  }
}

export async function HandleLogFoodItems(user: User, parameters: any, lastUserMessageId: number) {
  console.log("parameters", parameters)

  const foodItemsToLog: FoodItemToLog[] = parameters.food_items

  UpdateMessage({
    id: lastUserMessageId,
    itemsToProcess: foodItemsToLog.length
  })

  console.time("foodsProcessingTime")

  // Create all the pending food items
  const foodsNeedProcessing = await prisma.$transaction(
    foodItemsToLog.map((food) =>
      prisma.loggedFoodItem.create({
        data: {
          userId: user.id,
          consumedOn: food.timeEaten ? new Date(food.timeEaten) : new Date(),
          messageId: lastUserMessageId,
          status: "Needs Processing",
          extendedOpenAiData: food as any
          // Seb, do we need more info from the function here?
        }
      })
    )
  )

  console.timeEnd("foodsProcessingTime")

  console.log("foodsNeedProcessing", foodsNeedProcessing)

  const results = []
  foodItemsToLog.forEach((food) => results.push(constructFoodRequestString(food)))

  // Add each pending food item to queue
  for (let food of foodsNeedProcessing) {
    const targetUrl = `https://${process.env.VERCEL_URL}/api/process-food-item/${food.id}`
    console.log("Target URL: ", targetUrl)

    const fetchUrl = `https://api.serverlessq.com?id=${process.env.SERVERLESSQ_QUEUE_ID}&target=${targetUrl}`

    const result = await fetch(fetchUrl, {
      headers: {
        Accept: "application/json",
        "x-api-key": process.env.SERVERLESSQ_API_TOKEN!
      }
    })

    console.log(`Added to queue with code ${result.status} ${result.statusText}`)
  }

  // Move process food items to POST route on serverlessq

  // const foodAddResultsPromises = []
  // for (let food of foodItemsToLog) {
  //   foodAddResultsPromises.push(HandleLogFoodItem(food, lastUserMessage, user))
  // }
  // const results = (await Promise.all(foodAddResultsPromises)) || []

  if (results.length === 0) {
    return "Sorry, I could not log your food items. Please try again later. E230"
  }

  results.unshift("We're logging your food. It might take a few mins for us to look up all the information:")

  return results.join(" ")
}

export async function HandleLogFoodItem(
  loggedFoodItem: LoggedFoodItem,
  food: FoodItemToLog,
  messageId: number,
  user: User
): Promise<string> {
  // Get the user query vector
  // Assuming you have a function to convert foodUserQuery to a vector
  // Pass this on to other functions to avoid requiring
  const userQueryVectorCache = await foodToLogEmbedding(food)

  const cosineSearchResults =
    (await prisma.$queryRaw`SELECT id, name, brand, embedding::text, 1 - (embedding <=> (SELECT "bgeBaseEmbedding" FROM "FoodEmbeddingCache" WHERE embedding_id = ${userQueryVectorCache.embedding_cache_id})) AS cosine_similarity FROM "FoodItem" WHERE "bgeBaseEmbedding" IS NOT NULL ORDER BY cosine_similarity DESC LIMIT 5`) as FoodItemIdAndEmbedding[]

  console.log("Searching in database")
  console.log("__________________________________________________________")
  // Process the result as you need
  cosineSearchResults.forEach((item) => {
    const similarity = item.cosine_similarity.toFixed(3)
    if (item.brand) {
      console.log(`Similarity: ${similarity} - Item: ${item.id} - ${item.name} - ${item.brand}`)
    } else {
      console.log(`Similarity: ${similarity} - Item: ${item.id} - ${item.name}`)
    }
  })

  // Filter items based on cosine similarity
  const filteredItems = cosineSearchResults.filter((item) => item.cosine_similarity >= COSINE_THRESHOLD)

  let bestMatch: FoodItem
  // If no matches found, add food item to the database
  if (filteredItems.length === 0) {
    console.log("No matches found for food item", food.food_database_search_name)

    const newFood = await findAndAddItemInDatabase(food, userQueryVectorCache, user, messageId)
    bestMatch = newFood
  } else {
    const match = await prisma.foodItem.findUnique({
      where: {
        id: filteredItems[0].id
      }
    })

    if (match !== null) {
      bestMatch = match
    } else {
      // Handle the unexpected null case
      throw new Error(`Failed to find FoodItem with id ${filteredItems[0].id}`)
    }
  }

  // Let's find the serving
  // split the string into an array and filter out the serving unit
  const servingUnitEnum = [
    "g",
    "ml",
    "cup",
    "piece",
    "tbsp",
    "tsp",
    "plate",
    "bottle",
    "can",
    "slice",
    "small",
    "medium",
    "large",
    "serving"
  ]
  let foodArray = food.serving.serving_name.split(" ")
  let servingSize = foodArray.filter((word) => servingUnitEnum.includes(word))

  // Search servings table for the best match
  let serving = await prisma.serving.findFirst({
    where: {
      foodItemId: bestMatch.id,
      servingName: {
        contains: servingSize[0],
        mode: "insensitive"
      }
    },
    orderBy: {
      servingWeightGram: "asc"
    }
  })
  if (!serving) {
    console.log(`No serving found for food item id ${bestMatch.id} and serving size ${servingSize[0]}`)
  }
  // Proceed with original logging process with some modifications
  const data: any = {
    foodItemId: bestMatch.id, // use the best match's ID
    servingId: serving?.id, // use the serving id, if a serving was found
    servingAmount: food.serving.serving_amount,
    loggedUnit: sanitizeServingName(food.serving.serving_name || ""),
    grams: food.serving.total_serving_grams,
    userId: user.id,
    consumedOn: food.timeEaten ? new Date(food.timeEaten) : new Date(),
    messageId,
    status: "Processed"
  }

  const foodItem = await prisma.loggedFoodItem.update({ where: { id: loggedFoodItem.id }, data }).catch((err) => {
    console.log("Error logging food item", err)
  })
  if (!foodItem) {
    return "Sorry, I could not log your food items. Please try again later."
  }

  console.log("Updating messageID: ", messageId)
  UpdateMessage({ id: messageId, incrementItemsProcessedBy: 1 })

  return `${bestMatch.name} - ${foodItem.grams}g - ${foodItem.loggedUnit}`
}

async function addFoodItemPrisma(
  food: FoodItemWithNutrientsAndServing,
  messageId: number
  //model: string
): Promise<FoodItem> {
  // Check if a food item with the same name and brand already exists
  const existingFoodItem = await prisma.foodItem.findFirst({
    where: {
      name: food.name,
      brand: food.brand
    }
  })

  // If it exists, return the existing food item ID
  if (existingFoodItem) {
    return existingFoodItem
  }

  // Omit the id field from the food object
  const { id, ...foodWithoutId } = food

  const newFood = await prisma.foodItem.create({
    data: {
      ...foodWithoutId,
      messageId: messageId,
      //foodInfoSource: mapModelToEnum(model),
      // Check if nutrients exist before adding them
      ...(food.Nutrients && {
        Nutrients: {
          create: food.Nutrients.map((nutrient) => ({
            nutrientName: nutrient.nutrientName,
            nutrientUnit: nutrient.nutrientUnit,
            nutrientAmountPerDefaultServing: nutrient.nutrientAmountPerDefaultServing
          }))
        }
      }),
      ...(food.Servings && {
        Servings: {
          create: food.Servings.map((serving) => ({
            servingWeightGram: serving.servingWeightGram,
            servingAlternateAmount: serving.servingAlternateAmount,
            servingAlternateUnit: serving.servingAlternateUnit,
            servingName: serving.servingName
          }))
        }
      })
    }
  })

  // Save the vector to the database
  const embeddingArray = new Float32Array(await getFoodEmbedding(newFood))
  const embeddingSql = vectorToSql(Array.from(embeddingArray))
  const result = await prisma.$executeRaw`UPDATE "FoodItem"
    SET embedding = ${embeddingSql}::vector
    WHERE id = ${newFood.id}`

  return newFood
}

async function findAndAddItemInDatabase(
  foodToLog: FoodItemToLog,
  queryEmbeddingCache: FoodEmbeddingCache,
  user: User,
  messageId: number
): Promise<FoodItem> {
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
      if (await checkRateLimit("usda", 1000, ONE_HOUR_IN_MS)) {
        try {
          const result = await searchUsdaByEmbedding({
            food_name: fullFoodName,
            branded: foodToLog.branded || false,
            brand_name: foodToLog.brand || undefined,
            embedding_cache_id: queryEmbeddingCache.embedding_cache_id
          })
          console.log("Time taken for USDA API:", Date.now() - startTime, "ms") // Log the time taken
          return result
        } catch (err) {
          console.log("Error finding USDA food info", err) // Silently fail
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
          console.log("Time taken for FatSecret API:", Date.now() - startTime, "ms") // Log the time taken
          return result
        } catch (err) {
          console.log("Error finding FatSecret food info", err) // Silently fail
          return null
        }
      }
      return null
    }

    // Dispatch all API calls simultaneously
    const [nxFoodInfoResponse, usdaFoodInfoResponse, fatSecretInfoResponse] = await Promise.all([
      getNxFoodInfo(),
      getUsdaFoodInfo(),
      getFsFoodInfo()
    ])

    const foodInfoResponses: foodSearchResultsWithSimilarityAndEmbedding[] = []

    if (nxFoodInfoResponse != null && nxFoodInfoResponse.length > 0) {
      foodInfoResponses.push(...nxFoodInfoResponse)
    }

    if (usdaFoodInfoResponse != null) {
      foodInfoResponses.push(...usdaFoodInfoResponse)
    }

    if (fatSecretInfoResponse != null) {
      foodInfoResponses.push(...fatSecretInfoResponse)
    }

    // Find the item with the highest similarity score
    let highestSimilarityItem = foodInfoResponses.reduce((prev, current) => {
      return prev.similarityToQuery > current.similarityToQuery ? prev : current
    }, foodInfoResponses[0])
    // Sort the foodInfoResponses array in descending order based on similarityToQuery
    foodInfoResponses.sort((a, b) => b.similarityToQuery - a.similarityToQuery)

    // Iterate over the sorted array and print the desired information
    foodInfoResponses.forEach((item, index) => {
      const brandInfo = item.foodBrand ? ` by ${item.foodBrand}` : ""
      console.log(`Item ${index + 1}: ${item.foodName}${brandInfo} - Similarity ${item.similarityToQuery}`)
    })

    // If the highest similarity score is greater than COSINE_THRESHOLD, add the food item manually
    if (highestSimilarityItem.similarityToQuery > COSINE_THRESHOLD) {
      console.log("Found a match with similarity", highestSimilarityItem.similarityToQuery)
      // USDA items need to be auto-completed
      if (highestSimilarityItem.foodItem === undefined && highestSimilarityItem.foodSource === FoodInfoSource.USDA) {
        highestSimilarityItem.foodItem = (await getUsdaFoodsInfo({
          fdcIds: ["2628401"]
        }))![0] as FoodItemWithNutrientsAndServing
      }

      let foodItemToSave: FoodItemWithNutrientsAndServing =
        highestSimilarityItem.foodItem! as FoodItemWithNutrientsAndServing

      // If the food item is missing a field, complete it
      if ( highestSimilarityItem.foodItem!.defaultServingWeightGram === 0 || highestSimilarityItem.foodItem!.defaultServingWeightGram === null || highestSimilarityItem.foodItem!.defaultServingWeightGram === undefined) {
        foodItemToSave = await foodItemMissingFieldComplete(highestSimilarityItem.foodItem as FoodItemWithNutrientsAndServing, user)
        console.log("Food item after missing field completion")
        console.dir(foodItemToSave, { depth: null })
      }
      const newFood = await addFoodItemPrisma(foodItemToSave, messageId)
      return newFood
    }

    // If we didn't find a match we then rely on GPT-4
    const foodItemCompletionStartTime = Date.now() // Capture start time
    throw new Error("Food item completion not found in DB")
    /*
    const { foodItemInfo, model } = await foodItemCompletion(foodItemRequestString, user)
    console.log("Time taken for foodItemCompletion:", Date.now() - foodItemCompletionStartTime, "ms")

    let food: FoodInfo = foodItemInfo
    console.log("food req string:\n", foodItemRequestString)
    const newFood = await addFoodItemPrisma(
      mapOpenAiFoodInfoToFoodItem(food, model) as FoodItemWithNutrientsAndServing,
      messageId
    )

    return newFood
    */
    
  } catch (err) {
    console.log("Error getting food item info", err)
    throw err
  }
}

async function testFoodSearch() {
  const foodItem: FoodItemToLog = {
    food_database_search_name: "Hydro Whey Chocolate",
    brand: "Optimum Nutrition",
    branded: true,
    base_food_name: "Hydro Whey",
    serving: {
      serving_amount: 1,
      serving_name: "scoop",
      total_serving_grams: 30,
      total_serving_calories: 140
    }
  }
  const queryEmbedding = await foodToLogEmbedding(foodItem)
  const user: User = {
    id: "clklnwf090000lzssqhgfm8kr",
    firstName: "John",
    lastName: "Doe",
    email: "john.doe@example.com",
    emailVerified: new Date("2022-08-09T12:00:00"),
    phone: "123-456-7890",
    dateOfBirth: new Date("1990-01-01T00:00:00"),
    weightKg: 70.5,
    heightCm: 180,
    calorieGoal: 2000,
    proteinGoal: 100,
    carbsGoal: 200,
    fatGoal: 50,
    fitnessGoal: "Maintain",
    unitPreference: "IMPERIAL",
    setupCompleted: false,
    sentContact: false,
    sendCheckins: false,
    tzIdentifier: "America/New_York"
  }
  //console.dir(queryEmbedding, { depth: null })
  findAndAddItemInDatabase(foodItem, queryEmbedding, user, 1)
  
}

testFoodSearch()
