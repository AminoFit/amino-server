import OpenAI from "openai"
import { searchGoogleForFoodInfo } from "../common/onlineTextSearch/getFoodInfoOnline"
import { getFullFoodInformationOnlinePrompts } from "./getFullFoodInformationOnlinePrompts"
import { chatCompletion } from "@/languageModelProviders/openai/customFunctions/chatCompletion"
import { FoodItemWithNutrientsAndServing } from "@/app/dashboard/utils/FoodHelper"
import { Tables } from "types/supabase-generated.types"
import { FoodItemToLog } from "@/utils/loggedFoodItemInterface"
import { getUserByEmail } from "../common/debugHelper"
import { extractAndParseLastJSON } from "../common/extractJSON"
import { evaluate as mathEvaluate } from "mathjs"
import { addFoodItemToDatabase } from "../common/addFoodItemToDatabase"
import { getFoodEmbedding } from "@/utils/foodEmbedding"

function mapToFoodItemWithNutrientsAndServing(data: any): FoodItemWithNutrientsAndServing {
  const safeEvaluate = (value: number | string | null): number | null => {
    if (value === null) return null
    try {
      return mathEvaluate(value.toString())
    } catch {
      return null
    }
  }

    // Check if the food item is valid
    if (!data.isValidFoodItem) {
      throw new Error(`Invalid food item: ${data.reasoning}`);
    }

  // Convert primary fields
  const foodItem: FoodItemWithNutrientsAndServing = {
    id: data.id || 0, // Set default if id is not provided
    name: data.name,
    brand: data.brand || null,
    isLiquid: data.is_liquid,
    defaultServingWeightGram: safeEvaluate(data.serving_default_size_g),
    defaultServingLiquidMl: safeEvaluate(data.serving_default_size_ml),
    kcalPerServing: safeEvaluate(data.kcalPerServing)!,
    totalFatPerServing: safeEvaluate(data.totalFatPerServing)!,
    satFatPerServing: safeEvaluate(data.satFatPerServing),
    transFatPerServing: safeEvaluate(data.transFatPerServing),
    carbPerServing: safeEvaluate(data.carbPerServing)!,
    sugarPerServing: safeEvaluate(data.sugarPerServing),
    addedSugarPerServing: safeEvaluate(data.addedSugarPerServing),
    proteinPerServing: safeEvaluate(data.proteinPerServing)!,
    UPC: safeEvaluate(data.UPC),
    fiberPerServing: safeEvaluate(data.fiberPerServing),
    createdAtDateTime: new Date().toISOString(),
    verified: false,
    foodInfoSource: "GPT4",
    adaEmbedding: null, // Assuming null if not provided
    bgeBaseEmbedding: null,
    description: data.description || null,
    externalId: null,
    foodItemCategoryID: null,
    foodItemCategoryName: null,
    knownAs: null,
    lastUpdated: new Date().toISOString(),
    messageId: null,
    userId: null,
    weightUnknown: false, // Set default assumption
    Nutrient: [],
    Serving: []
  }

  // Convert servings
  foodItem.Serving = data.Serving.map((serving: any) => ({
    servingWeightGram: safeEvaluate(serving.serving_size_g),
    servingName: serving.serving_name,
    servingAlternateAmount: safeEvaluate(serving.servingAlternateAmount),
    servingAlternateUnit: serving.servingAlternateUnit,
    foodItemId: foodItem.id, // Link to the food item ID
    id: serving.id || 0 // Set default if id is not provided
  }))

  return foodItem
}

export async function getFullFoodInformationOnline(
  foodInfo: FoodItemToLog,
  extraInfo: string,
  user: Tables<"User">
): Promise<FoodItemWithNutrientsAndServing | null> {
  const foodName = foodInfo.brand
    ? `${foodInfo.food_database_search_name} by ${foodInfo.brand}`
    : foodInfo.food_database_search_name
  console.log(`Looking for info about:` + foodInfo.food_database_search_name)

  let onlineSearchInfo = ""

  try {
    onlineSearchInfo = (await searchGoogleForFoodInfo(foodName, 5))!
  } catch (e) {
    console.log("could not get missing food info online query", e)
  }

  console.log("got info online", onlineSearchInfo.length)

  const model = "gpt-4o"
  const temperatures = [0, 0.1] // Initial and retry temperatures
  let retryCount = 0
  const maxRetries = 1 // Allows for one retry
  let response

  while (retryCount <= maxRetries) {
    console.log("asking gpt4 for food info summary (fullinfo)")
    console.log("onlineSearchInfo", onlineSearchInfo)
    console.log("extraInfo", extraInfo)
    const temperature = temperatures[retryCount] // Use initial or higher temperature based on retryCount
    const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
      {
        role: "system",
        content: getFullFoodInformationOnlinePrompts["gpt-4"].systemPrompt
      },
      {
        role: "user",
        content: getFullFoodInformationOnlinePrompts["gpt-4"].prompt
          .replace("FOOD_NAME", foodName)
          .replace("ONLINE_FOOD_INFORMATION", extraInfo + "\n\n" + onlineSearchInfo)
      }
    ]

    try {
      response = await chatCompletion({ model, messages, temperature, response_format: "json_object" }, user)
      if (response.content) {
        console.log("response", response.content)
        let food_result: FoodItemWithNutrientsAndServing = extractAndParseLastJSON(
          response.content, false
        ) as FoodItemWithNutrientsAndServing
        food_result = mapToFoodItemWithNutrientsAndServing(food_result)
        //   console.log(`food_result`, JSON.stringify(food_result, null, 2))
        return food_result
      }
      // Exit the loop if the response is successful but has no content
      break
    } catch (error) {
      console.log(`Attempt for foodcompletion ${retryCount + 1} failed: ${error}`)
      retryCount++
      // Continue to retry if there was an error and retryCount is within limits
    }
  }

  // Return null if retries exceeded or if no content was obtained
  return null
}

async function testGetFullFoodInformationOnline() {
  const user = await getUserByEmail("seb.grubb@gmail.com")
  const fairlife_nutrition_plan = {
    food_database_search_name: "Fairlife Nutrition Plan Chocolate",
    full_item_user_message_including_serving: "Fairlife Nutrition Plan Chocolate",
    brand: "Fairlife",
    branded: true,
    timeEaten: "2023-04-01T20:11:15.552Z",
    serving: {
      serving_g_or_ml: "g",
      total_serving_g_or_ml: 100
    }
  } as FoodItemToLog

  const lafermiereyogurt = {
    food_database_search_name: "Mango Passion Fruit yogurt",
    full_item_user_message_including_serving: "Lafermiere Mango Passion Fruit Yogurt",
    brand: "La fermiere",
    branded: true,
    timeEaten: "2023-04-01T20:11:15.552Z",
    serving: {
      serving_g_or_ml: "g",
      total_serving_g_or_ml: 100
    }
  } as FoodItemToLog

  const roast = {
    food_database_search_name: "Roast",
    full_item_user_message_including_serving: "Roast",
    brand: "",
    branded: false,
    timeEaten: "2023-04-01T20:11:15.552Z",
    serving: {
      serving_g_or_ml: "g",
      total_serving_g_or_ml: 100
    }
  } as FoodItemToLog
  
  const mango = {
    food_database_search_name: "thìa canh xoài",
    full_item_user_message_including_serving: "thìa canh xoài",
    brand: "",
    branded: false,
    timeEaten: "2023-04-01T20:11:15.552Z",
    serving: {
      serving_g_or_ml: "g",
      total_serving_g_or_ml: 100
    }
  } as FoodItemToLog

  const pbfit = {
    food_database_search_name: "PB Fit",
    full_item_user_message_including_serving: "PB Fit",
    brand: "",
    branded: false,
    timeEaten: "2023-04-01T20:11:15.552Z",
    serving: {
      serving_g_or_ml: "g",
      total_serving_g_or_ml: 100
    }
  } as FoodItemToLog

  const isopure = {
    food_database_search_name: "Zero Carb 100% Whey Protein Isolate Unflavored ",
    full_item_user_message_including_serving: "Iso Pure Zero Carb 100% Whey Protein Isolate Unflavored ",
    brand: "Iso Pure",
    branded: true,
    timeEaten: "2023-04-01T20:11:15.552Z",
    serving: {
      serving_g_or_ml: "g",
      total_serving_g_or_ml: 100
    }
  } as FoodItemToLog

  const stacker = {
    food_database_search_name: "A&W Single Stacker",
    full_item_user_message_including_serving: "A&W SingleStacker",
    brand: "A&W",
    branded: true,
    timeEaten: "2023-04-01T20:11:15.552Z",
    serving: {
      serving_g_or_ml: "g",
      total_serving_g_or_ml: 100
    }
  } as FoodItemToLog

  const weetbix = {
    food_database_search_name: "Weetbix",
    full_item_user_message_including_serving: "Weetbix",
    brand: "Weetbix",
    branded: true,
    timeEaten: "2023-04-01T20:11:15.552Z",
    serving: {
      serving_g_or_ml: "g",
      total_serving_g_or_ml: 100
    }
  } as FoodItemToLog

  const nuttyPuddingByBryanJohnson = {
    food_database_search_name: "Nutty Pudding by Bryan Johnson",
    full_item_user_message_including_serving: "Nutty Pudding by Bryan Johnson",
    brand: "Blueprint Bryan Johnson",
    branded: true,
    timeEaten: "2023-04-01T20:11:15.552Z",
    serving: {
      serving_g_or_ml: "g",
      total_serving_g_or_ml: 100
    }
  } as FoodItemToLog

  const tabatchnik_strawberry = {"brand":"Tabatchnick","branded":true,"serving":{"serving_id":0,"serving_name":"oz","serving_amount":4.5,"serving_g_or_ml":"g","full_serving_string":"4.5 oz","total_serving_g_or_ml":127.57275},"timeEaten":"2024-06-04T21:50:53.098Z","second_best_match":null,"food_database_search_name":"Tabatchnick Strawberry Surge Strawberry Fruit Cup","full_item_user_message_including_serving":"4.5 oz (128g) of Tabatchnick Strawberry Surge Strawberry Fruit Cup"} as FoodItemToLog
   const result = await getFullFoodInformationOnline(tabatchnik_strawberry, "", user!)
  // const newFood = await addFoodItemToDatabase(
  //   result!,
  //   await getFoodEmbedding(result!),
  //   1,
  //   user!
  // )
  console.log(result)
}

// testGetFullFoodInformationOnline()

const foodTest =  {
    "name": "Original Beef Jerky",
    "brand": "Brooklyn Biltong",
    "description": "South Africa's version of beef jerky, biltong, is marinated with spices and vinegar for maximum tenderness, and slowly dried to maintain mouth-watering flavor.",
    "serving_default_size_g": "56.699",
    "is_liquid": false,
    "serving_default_size_ml": null,
    "kcalPerServing": 180,
    "totalFatPerServing": 6,
    "satFatPerServing": 2,
    "transFatPerServing": 0,
    "carbPerServing": 1,
    "sugarPerServing": 0,
    "addedSugarPerServing": 0,
    "proteinPerServing": 32,
    "UPC": null,
    "fiberPerServing": 0,
    "Serving": [
      {
        "serving_size_g": 56.699,
        "serving_name": "2.0-oz package",
        "servingAlternateAmount": 2.0,
        "servingAlternateUnit": "oz"
      }
    ]
  }

//   const result = mapToFoodItemWithNutrientsAndServing(foodTest)
//   console.log(result)
