import { User, FoodItem, Message, FoodInfoSource } from "@prisma/client"
import UpdateMessage from "@/database/UpdateMessage"
import { prisma } from "../prisma"
import { foodItemCompletion } from "../../openai/customFunctions/foodItemCompletion"
import { FoodInfo } from "../../openai/customFunctions/foodItemInterface"
import { FoodItemToLog } from "../../utils/loggedFoodItemInterface"

function mapModelToEnum(model: string): FoodInfoSource {
  if (model.startsWith("gpt-4")) {
    return FoodInfoSource.GPT4
  }

  if (model.startsWith("gpt-3.5")) {
    return FoodInfoSource.GPT3
  }

  return FoodInfoSource.User // Default to 'User'
}

function sanitizeServingName(name: string) {
  // Regular expressions to match numeric and word-based quantities
  const numericPattern = /^[-]?\d+(\.\d+)?\s*/
  const wordQuantities = ["quarter", "half", "third", "fourth"] // Expand this as needed

  // Remove numeric quantities
  name = name.replace(numericPattern, "").trim()

  // Remove word-based quantities
  for (const word of wordQuantities) {
    name = name.replace(new RegExp("^" + word + "\\s*", "i"), "").trim()
  }

  return name
}

function constructFoodRequestString(foodToLog: FoodItemToLog) {
  let result = ""

  // Add brand if it exists
  if (foodToLog.brand) {
    result += foodToLog.brand + " "
  }

  // Add full name and user descriptive name if they're different
  result += foodToLog.full_name
  if (
    foodToLog.user_food_descriptive_name &&
    foodToLog.full_name !== foodToLog.user_food_descriptive_name
  ) {
    result += ` (${foodToLog.user_food_descriptive_name})`
  }

  // Append cooked/uncooked if the property exists
  /*if (typeof foodToLog.cooked !== 'undefined') {
    result += ` (${foodToLog.cooked ? 'cooked' : 'uncooked'})`;
  }*/

  // Add serving details
  let servingDetails = ""

  if (foodToLog.serving.serving_amount) {
    servingDetails +=
      foodToLog.serving.serving_amount + " " + foodToLog.serving.serving_name
  }

  if (
    foodToLog.serving.serving_amount &&
    foodToLog.serving.total_serving_grams
  ) {
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

export async function HandleLogFoodItems(
  user: User,
  parameters: any,
  lastUserMessage: Message
) {
  console.log("parameters", parameters)

  const foodItemsToLog: FoodItemToLog[] = parameters.food_items

  UpdateMessage({
    id: lastUserMessage.id,
    itemsToProcess: foodItemsToLog.length
  })
  lastUserMessage.itemsToProcess = foodItemsToLog.length

  // Create all the pending food items
  const data = []
  for (let food of foodItemsToLog) {
    data.push({
      userId: user.id,
      consumedOn: food.timeEaten ? new Date(food.timeEaten) : new Date(),
      messageId: lastUserMessage.id,
      status: "Needs Processing",
      placeholderName: food.full_name
      // Seb, do we need more info from the function here?
    })
  }
  await prisma.loggedFoodItem.createMany({
    data
  })

  const results = []
  // Add each pending food item to queue
  for (let food of foodItemsToLog) {
    const targetUrl = `https://${process.env.VERCEL_URL}/api/process-food-item/`
    console.log("Target URL: ", targetUrl)

    const fetchUrl = `https://api.serverlessq.com?id=${process.env.SERVERLESSQ_QUEUE_ID}&target=${targetUrl}`

    const result = await fetch(fetchUrl, {
      headers: {
        Accept: "application/json",
        "x-api-key": process.env.SERVERLESSQ_API_TOKEN!
      },
      method: "POST",
      body: JSON.stringify(food)
    })

    console.log("Added to queue result: ", result)

    results.push("- " + constructFoodRequestString(food))
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

  results.unshift("I've logged your food:\n")

  return results.join("\n")
}

async function HandleLogFoodItem(
  food: FoodItemToLog,
  lastUserMessage: Message,
  user: User
): Promise<string> {
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

    const newFood = await addFoodItemToDatabase(food, lastUserMessage)
    matches = [newFood]
  }

  // Let's assume we have a function getBestMatch that returns the best match
  //let bestMatch = getBestMatch(matches)
  let bestMatch: FoodItem = matches[0]

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
    console.log(
      `No serving found for food item id ${bestMatch.id} and serving size ${servingSize[0]}`
    )
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
    messageId: lastUserMessage.id
  }

  const foodItem = await prisma.loggedFoodItem
    .create({
      data
    })
    .catch((err) => {
      console.log("Error logging food item", err)
    })
  if (!foodItem) {
    return "Sorry, I could not log your food items. Please try again later."
  }

  await UpdateMessage({ id: lastUserMessage.id, incrementItemsProcessedBy: 1 })

  return `${bestMatch.name} - ${foodItem.grams}g - ${foodItem.loggedUnit}`
}

async function addFoodItemToDatabase(
  foodToLog: FoodItemToLog,
  lastUserMessage: Message
): Promise<FoodItem> {
  console.log("food", foodToLog)

  try {
    // create string name for food request
    const foodItemRequestString: string = constructFoodRequestString(foodToLog)

    const { foodItemInfo, model } = await foodItemCompletion(
      foodItemRequestString
    )

    let newFood: FoodItem

    let food: FoodInfo = foodItemInfo.food_info[0]
    console.log("food req string:", foodItemRequestString)

    newFood = await prisma.foodItem.create({
      data: {
        name: food.name,
        brand: food.brand,
        knownAs: food.known_as || [],
        description: food.food_description,
        defaultServingWeightGram: food.default_serving_weight_g,
        kcalPerServing: food.kcal_per_serving,
        totalFatPerServing: food.total_fat_per_serving,
        satFatPerServing: food.sat_fat_per_serving ?? 0,
        transFatPerServing: food.trans_fat_per_serving ?? 0,
        carbPerServing: food.carb_per_serving,
        sugarPerServing: food.sugar_per_serving ?? 0,
        addedSugarPerServing: food.added_sugar_per_serving ?? 0,
        proteinPerServing: food.protein_per_serving,
        messageId: lastUserMessage.id,
        foodInfoSource: mapModelToEnum(model),
        Servings: {
          create:
            food.servings?.map((serving) => ({
              servingWeightGram: serving.serving_weight_g,
              servingName: serving.serving_name
            })) || []
        },
        Nutrients: {
          create:
            food.nutrients?.map((nutrient) => ({
              nutrientName: nutrient.nutrient_name,
              nutrientUnit: nutrient.nutrient_unit,
              nutrientAmountPerGram: nutrient.nutrient_amount_per_g
            })) || []
        }
      }
    })
    return newFood
  } catch (err) {
    console.log("Error getting food item info", err)
    throw err
  }
}
