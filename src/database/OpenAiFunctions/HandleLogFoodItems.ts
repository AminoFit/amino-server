import { User, FoodItem, LoggedFoodItem } from "@prisma/client"
import { prisma } from "../prisma"
import { foodItemCompletion } from "../../openai/customFunctions/foodItemCompletion"
import { FoodInfo } from "../../openai/customFunctions/foodItemInterface"
import moment from "moment"

interface FoodItemToLog {
  name: string // The name of the food item, used to search in food database
  unit: "g" | "ml" | "cups" | "piece" | "tbsp" | "tsp"
  database_search_term?: string
  serving_amount: number // The serving amount (ideally grams) of the food item that was eaten
  calories?: number // The number of calories in the food item
}

export async function HandleLogFoodItems(user: User, parameters: any) {
  console.log("parameters", parameters)

  const foodItems: FoodItemToLog[] = parameters.food_items

  let result = "I've logged your food:"

  let matches = []

  for (let food of foodItems) {
    console.log("foodItem db helper word", food.database_search_term)
    // common words that are not useful for searching
    let sizeWords = ["large", "medium", "small", "slice", "scoop", "cup", "spoon"];
    // remove these words from the search term
    let foodName = food.name.toLowerCase().split(" ").filter(word => !sizeWords.includes(word)).join(" ");

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

    // Search for matches in food database
    matches = await prisma.foodItem
      .findMany({
        where: {
          OR: [
            { name: { in: searchChunks, mode: "insensitive" } },
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
      console.log("No matches found for food item", food.name)

      const newFood = await addFoodItemToDatabase(food)
      matches = [newFood]
    }

    // Let's assume we have a function getBestMatch that returns the best match
    //let bestMatch = getBestMatch(matches)
    let bestMatch: FoodItem = matches[0]

    // Proceed with original logging process with some modifications
    const data: any = {
      foodItemId: bestMatch.id, // use the best match's ID
      grams: food.serving_amount,
      loggedUnit: food.unit,
      userId: user.id
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
    result += `\n\n${bestMatch.name} - ${foodItem.grams}g - ${foodItem.loggedUnit}`
  }

  return result
}

async function addFoodItemToDatabase(
  foodToLog: FoodItemToLog
): Promise<FoodItem> {
  console.log("food", foodToLog)

  try {
    let foodItemInfo = await foodItemCompletion(foodToLog.name)
    let newFood: FoodItem

    let food: FoodInfo = foodItemInfo.food_info[0]
    console.log("food", food)
    console.log("foodItemInfo", foodItemInfo)
    console.log("food.name", food.name)

    newFood = await prisma.foodItem.create({
      data: {
        name: food.name,
        brand: food.brand,
        knownAs: food.known_as || [],
        description: food.food_description,
        defaultServingSize: food.default_serving_size,
        defaultServingUnit: food.default_serving_unit,
        defaultServingWeightGram: food.default_serving_weight_g,
        kcalPerServing: food.kcal_per_serving,
        totalFatPerServing: food.total_fat_per_serving,
        satFatPerServing: food.sat_fat_per_serving,
        transFatPerServing: food.trans_fat_per_serving,
        carbPerServing: food.carb_per_serving,
        sugarPerServing: food.sugar_per_serving,
        addedSugarPerServing: food.added_sugar_per_serving,
        proteinPerServing: food.protein_per_serving,
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