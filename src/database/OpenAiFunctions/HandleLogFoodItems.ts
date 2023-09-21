import { findUsdaFoodInfo } from "@/FoodDbThirdPty/USDA/findUsdaFoodInfo"
import { FoodQuery, findNxFoodInfo } from "@/FoodDbThirdPty/nutritionix/findNxFoodInfo"
import { NxFoodItemResponse } from "@/FoodDbThirdPty/nutritionix/nxInterfaceHelper"
import { findFsFoodInfo } from "@/FoodDbThirdPty/fatsecret/findFsFoodInfo"
import UpdateMessage from "@/database/UpdateMessage"
import { FoodInfoSource, FoodItem, LoggedFoodItem, Message, User } from "@prisma/client"
import { foodItemCompletion } from "../../openai/customFunctions/foodItemCompletion"
import { foodItemMissingFieldComplete } from "../../openai/customFunctions/foodItemMissingFieldComplete"
import { FoodInfo, mapOpenAiFoodInfoToFoodItem } from "../../openai/customFunctions/foodItemInterface"
import { checkRateLimit } from "../../utils/apiUsageLogging"
import { FoodItemToLog } from "../../utils/loggedFoodItemInterface"
import { prisma } from "../prisma"
import { getFoodEmbedding, foodToLogEmbedding } from "../../utils/foodEmbedding"
import { vectorToSql } from "@/utils/pgvectorHelper"
import { levenshteinDistance } from "../../utils/nlpHelper"
import { cosineSimilarity } from "../../openai/utils/embeddingsHelper"
import { sanitizeServingName } from "../utils/textSanitize"
import { FoodItemWithNutrientsAndServing } from "../../app/dashboard/utils/FoodHelper"

const ONE_HOUR_IN_MS = 60 * 60 * 1000
const ONE_DAY_IN_MS = 24 * ONE_HOUR_IN_MS

// Used to determine if an item is a good match
const COSINE_THRESHOLD = 0.945
// used to determine if an item should be included in a compare list
const COSINE_THRESHOLD_LOW_QUALITY = 0.85

type FoodItemIdAndEmbedding = {
  id: number
  name: string
  brand: string
  cosine_similarity: number
  embedding: string
}

type FoodItemPropertiesToRemove =
  | "id"
  | "knownAs"
  | "description"
  | "transFatPerServing"
  | "addedSugarPerServing"
  | "lastUpdated"
  | "verified"
  | "userId"

function stringifyFoodItem(foodItem: FoodItemWithNutrientsAndServing): string {
  let output = `ItemName: ${foodItem.name}\nBranded: ${Boolean(foodItem.brand)}\n`;

  if (foodItem.brand) {
    output += `BrandName: ${foodItem.brand}\n`;
  }

  output += `DefaultServingGrams: ${foodItem.defaultServingWeightGram ? Number(foodItem.defaultServingWeightGram.toPrecision(4)) : 'N/A'}\n`;
  output += `isLiquid: ${foodItem.isLiquid}\n`;

  if (foodItem.isLiquid) {
    output += `DefaultServingMl: ${foodItem.defaultServingLiquidMl ? Number(foodItem.defaultServingLiquidMl.toPrecision(4)) : 'N/A'}\n`;
  }

  output += `Calories: ${Number(foodItem.kcalPerServing.toPrecision(4))}\nCarbs: ${foodItem.carbPerServing}\n`;
  output += `TotalFat: ${Number(foodItem.totalFatPerServing.toPrecision(4))}\nProtein: ${foodItem.proteinPerServing}\n`;

  // Conditional appending
  if (foodItem.satFatPerServing != null) output += `SatFat: ${Number(foodItem.satFatPerServing.toPrecision(4))}\n`;
  if (foodItem.transFatPerServing != null) output += `TransFat: ${Number(foodItem.transFatPerServing.toPrecision(4))}\n`;
  if (foodItem.fiberPerServing != null) output += `Fiber: ${Number(foodItem.fiberPerServing.toPrecision(4))}\n`;
  if (foodItem.addedSugarPerServing != null) output += `AddedSugar: ${Number(foodItem.addedSugarPerServing.toPrecision(4))}\n`;

  // Iterate through Servings and Nutrients
  output += "Servings: [\n";
  for (const serving of foodItem.Servings) {
    output += `  { servingWeightGrams: ${serving.servingWeightGram ? Number(serving.servingWeightGram.toPrecision(4)) : 'N/A'}, servingName: "${serving.servingName}" },\n`;
  }
  output += "]\n";

  output += "Nutrients: [\n";
  for (const nutrient of foodItem.Nutrients) {
    output += `  { nutrientAmount: ${nutrient.nutrientAmountPerDefaultServing}, nutrientUnit: "${nutrient.nutrientUnit}", nutrientName: "${nutrient.nutrientName}" },\n`;
  }
  output += "]";

  return output;
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
  const userQueryVector = await foodToLogEmbedding(food)

  // Convert the user query vector to SQL format using pgvector
  const embeddingSql = vectorToSql(userQueryVector)

  // Query for the cosine similarity based on the embedding vector
  const cosineSearchResults =
    (await prisma.$queryRaw`SELECT id, name, brand, embedding::text, 1 - (embedding <=> ${embeddingSql}::vector) AS cosine_similarity, embedding::text FROM "FoodItem" ORDER BY cosine_similarity DESC LIMIT 5`) as FoodItemIdAndEmbedding[]

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

    const newFood = await addFoodItemToDatabase(food, userQueryVector, user, messageId)
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

  /*
  // classical search
  let matches = []

  console.log("foodItem db helper word", food.lemmatized_database_search_term)
  // common words that are not useful for searching
  let sizeWords = ["large", "medium", "small", "slice", "scoop", "cup", "spoon"]
  // remove these words from the search term
  let foodName = food.full_name
    .toLowerCase()
    .split(" ")
    .filter((word) => !sizeWords.includes(word))
    .join(" ")

  // Step 1: split search term into sub-chunks
  let searchTerms = foodName.toLowerCase().split(" ")
  let searchChunks = []

  // Form 2-word and 3-word chunks
  for (let i = 0; i < searchTerms.length; i++) {
    if (i < searchTerms.length - 1) {
      searchChunks.push(searchTerms[i] + " " + searchTerms[i + 1])
    }
    if (i < searchTerms.length - 2) {
      searchChunks.push(
        searchTerms[i] + " " + searchTerms[i + 1] + " " + searchTerms[i + 2]
      )
    }
  }

  // setup where clause
  const whereClause = searchChunks.map((term) => ({
    name: {
      contains: term.toLowerCase()
    }
  }))

  // Search for matches in food database
  matches = await prisma.foodItem
    .findMany({
      where: {
        OR: [
          { name: { contains: foodName, mode: "insensitive" } },
          ...whereClause,
          {
            name: {
              in: food.lemmatized_database_search_term,
              mode: "insensitive"
            }
          },
          { brand: { in: searchChunks, mode: "insensitive" } },
          { knownAs: { hasSome: searchTerms } }
        ]
      },
      take: 5,
      orderBy: {
        name: "asc"
      }
    })
    .catch((err) => {
      console.log("Error finding food item matches", err)
      throw err
    })

  // If no matches found, add food item to the database
  if (matches.length === 0) {
    console.log("No matches found for food item", food.full_name)

    const newFood = await addFoodItemToDatabase(food, user, messageId)
    matches = [newFood]
  }

  // Let's assume we have a function getBestMatch that returns the best match
  //let bestMatch = getBestMatch(matches)
  let bestMatch: FoodItem = matches[0]

  */

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

async function addFoodItemToDatabase(
  foodToLog: FoodItemToLog,
  queryEmbedding: number[],
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
      lemmatized_database_search_term: fullFoodName,
      branded: foodToLog.branded || false
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
          const result = await findUsdaFoodInfo({
            food_name: fullFoodName,
            branded: foodToLog.branded || false,
            brand_name: foodToLog.brand || undefined
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
            branded: foodToLog.branded || false
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

    // Dispatch both API calls simultaneously
    const [nxFoodInfoResponse, usdaFoodInfoResponse, fatSecretInfoResponse] = await Promise.all([
      getNxFoodInfo(),
      getUsdaFoodInfo(),
      getFsFoodInfo()
    ])

    const foodInfoResponses: {
      foodItem: FoodItem
      foodEmbedding: number[]
      similarityToQuery: number
    }[] = []

    // create string name for food request
    let foodItemRequestString: string =
      "Food we need to generate info for:\n" + constructFoodRequestString(foodToLog) + "\n___\n"

    if (nxFoodInfoResponse != null && nxFoodInfoResponse.length > 0) {
      // If we have a match, use the first one
      const food = nxFoodInfoResponse[0]
      const foodEmbedding = await getFoodEmbedding(food)
      const similarityToQuery = cosineSimilarity(queryEmbedding, foodEmbedding)

      foodInfoResponses.push({
        foodItem: food,
        foodEmbedding,
        similarityToQuery
      })
      // Construct the request string for the OpenAI foodItemCompletion function
      if (similarityToQuery > COSINE_THRESHOLD_LOW_QUALITY) {
        foodItemRequestString =
          foodItemRequestString +
          "\nSome food info that may be relevant\n" +
          stringifyFoodItem(food as FoodItemWithNutrientsAndServing)
      }
    }

    if (usdaFoodInfoResponse != null) {
      // If we have a match, use the first one
      const food = usdaFoodInfoResponse
      const foodEmbedding = await getFoodEmbedding(food)
      const similarityToQuery = cosineSimilarity(queryEmbedding, foodEmbedding)

      foodInfoResponses.push({
        foodItem: food,
        foodEmbedding,
        similarityToQuery
      })
      // Construct the request string for the OpenAI foodItemCompletion function
      if (similarityToQuery > COSINE_THRESHOLD_LOW_QUALITY) {
        foodItemRequestString =
          foodItemRequestString +
          "\n Some food info that may be relevant\n" +
          stringifyFoodItem(food as FoodItemWithNutrientsAndServing)
      }
    }

    if (fatSecretInfoResponse != null) {
      // If we have a match, use the first one
      const food = fatSecretInfoResponse.item
      const foodEmbedding = fatSecretInfoResponse.embedding
      const similarityToQuery = cosineSimilarity(queryEmbedding, foodEmbedding)

      foodInfoResponses.push({
        foodItem: food,
        foodEmbedding,
        similarityToQuery
      })
      // Construct the request string for the OpenAI foodItemCompletion function
      if (similarityToQuery > COSINE_THRESHOLD_LOW_QUALITY) {
        foodItemRequestString =
          foodItemRequestString +
          "\n Some food info that may be relevant\n" +
          stringifyFoodItem(food as FoodItemWithNutrientsAndServing)
      }
    }

    // Find the item with the highest similarity score
    let highestSimilarityItem = foodInfoResponses.reduce((prev, current) => {
      return prev.similarityToQuery > current.similarityToQuery ? prev : current
    }, foodInfoResponses[0])

    // If the highest similarity score is greater than COSINE_THRESHOLD, add the food item manually
    if (highestSimilarityItem.similarityToQuery > COSINE_THRESHOLD) {
      console.log("Found a match with similarity", highestSimilarityItem.similarityToQuery)
      let foodItemToSave: FoodItemWithNutrientsAndServing =
        highestSimilarityItem.foodItem as FoodItemWithNutrientsAndServing
      if (
        highestSimilarityItem.foodItem.defaultServingWeightGram === 0 ||
        highestSimilarityItem.foodItem.defaultServingWeightGram === null ||
        highestSimilarityItem.foodItem.defaultServingWeightGram === undefined
      ) {
        foodItemToSave = await foodItemMissingFieldComplete(
          highestSimilarityItem.foodItem as FoodItemWithNutrientsAndServing,
          user
        )
        console.log("Food item after missing field completion")
        console.dir(foodItemToSave, { depth: null })
      }
      const newFood = await addFoodItemPrisma(foodItemToSave, messageId)
      return newFood
    }

    // If we didn't find a match we then rely on GPT-4
    const foodItemCompletionStartTime = Date.now() // Capture start time
    const { foodItemInfo, model } = await foodItemCompletion(foodItemRequestString, user)
    console.log("Time taken for foodItemCompletion:", Date.now() - foodItemCompletionStartTime, "ms")

    let food: FoodInfo = foodItemInfo
    console.log("food req string:\n", foodItemRequestString)
    const newFood = await addFoodItemPrisma(
      mapOpenAiFoodInfoToFoodItem(food, model) as FoodItemWithNutrientsAndServing,
      messageId
    )

    return newFood
  } catch (err) {
    console.log("Error getting food item info", err)
    throw err
  }
}
