import { getMissingFoodInfoOnlineQuery } from "../missingFoodInfoOnlineQuery"
import { chatCompletion } from "@/languageModelProviders/openai/customFunctions/chatCompletion"
import { Tables } from "types/supabase"
import { FoodItemWithNutrientsAndServing } from "@/app/dashboard/utils/FoodHelper"
import { createAdminSupabase } from "@/utils/supabase/serverAdmin"
import OpenAI from "openai"
import { extractAndParseLastJSON } from "../common/extractJSON"
import * as math from "mathjs"
import { missingFoodInfoPromptsByModel } from "./completeMissingFoodInfoPrompts"
import { FireworksChatCompletion } from "@/languageModelProviders/fireworks/chatCompletionFireworks"
import { on } from "events"
import { searchGoogleForFoodInfo } from "../common/onlineTextSearch/getFoodInfoOnline"

interface FoodMissingInfo {
  default_serving_amount_grams: number | string
  default_serving_amount_ml: number | string | null
  description: string
  serving: {
    serving_id: number
    serving_name: string
    serving_weight_grams: number | string
    serving_default_serving_amount: number
    serving_alternate_amount: number
    serving_alternate_unit: string
  }[]
}

function convertFieldsToNumbers(data: FoodMissingInfo): FoodMissingInfo {
  // Helper function to evaluate numeric strings without runtime type checks
  const safeEvaluate = (value: number | string | null): number | null => {
    if (value === null) return null
    try {
      return math.evaluate(value.toString())
    } catch {
      // Assuming the input is always aligned with the interface, no need for typeof check
      return null // Return null if evaluation fails
    }
  }

  return {
    ...data,
    default_serving_amount_grams: safeEvaluate(data.default_serving_amount_grams) || 10,
    default_serving_amount_ml: safeEvaluate(data.default_serving_amount_ml),
    serving: data.serving.map((servingItem) => ({
      ...servingItem,
      serving_weight_grams: safeEvaluate(servingItem.serving_weight_grams) || 10
    }))
  }
}

function updateFoodItemWithMissingInfo(
  foodItem: FoodItemWithNutrientsAndServing,
  missingInfo: FoodMissingInfo
): FoodItemWithNutrientsAndServing {
  // Evaluate and update missingInfo with numbers
  missingInfo = convertFieldsToNumbers(missingInfo)

  // Update foodItem description
  if (!foodItem.description) {
    foodItem.description = missingInfo.description
  }

  // Update default serving amounts if they are not set correctly
  foodItem.defaultServingWeightGram = foodItem.defaultServingWeightGram
    ? foodItem.defaultServingWeightGram
    : (missingInfo.default_serving_amount_grams as number)
  foodItem.defaultServingLiquidMl = foodItem.defaultServingLiquidMl
    ? foodItem.defaultServingLiquidMl
    : (missingInfo.default_serving_amount_ml as number)

  // Iterate over missingInfo servings to update or add them
  missingInfo.serving.forEach((updateInfo) => {
    const existingServing = foodItem.Serving.find((serving) => serving.id === updateInfo.serving_id)

    if (existingServing) {
      // Update existing serving
      existingServing.servingWeightGram = existingServing.servingWeightGram
        ? existingServing.servingWeightGram
        : (updateInfo.serving_weight_grams as number)
      existingServing.defaultServingAmount =
        existingServing.defaultServingAmount || updateInfo.serving_default_serving_amount
      existingServing.servingAlternateAmount =
        existingServing.servingAlternateAmount || updateInfo.serving_alternate_amount
      existingServing.servingAlternateUnit = existingServing.servingAlternateUnit || updateInfo.serving_alternate_unit
    } else {
      // Check if the new serving differs significantly from existing servings
      const isSignificantlyDifferent = !foodItem.Serving.some((serving) => {
        const weightDifference = Math.abs(
          (updateInfo.serving_weight_grams as number) - (serving.servingWeightGram || 0)
        )
        const percentageDifference = (weightDifference / (serving.servingWeightGram || 1)) * 100
        return percentageDifference < 20
      })

      if (isSignificantlyDifferent) {
        // Add new serving if it differs significantly
        foodItem.Serving.push({
          id: updateInfo.serving_id,
          foodItemId: foodItem.id,
          servingName: updateInfo.serving_name,
          servingWeightGram: updateInfo.serving_weight_grams as number,
          defaultServingAmount: updateInfo.serving_default_serving_amount,
          servingAlternateAmount: updateInfo.serving_alternate_amount,
          servingAlternateUnit: updateInfo.serving_alternate_unit
        })
      }
    }
  })

  return foodItem
}

function simplifyFoodInfo(foodInfo: FoodItemWithNutrientsAndServing) {
  return {
    food_name: foodInfo.name,
    food_brand: foodInfo.brand,
    default_serving_amount_grams: isNaN(foodInfo.defaultServingWeightGram || 0) ? 0 : foodInfo.defaultServingWeightGram,
    default_serving_amount_ml: isNaN(foodInfo.defaultServingLiquidMl || 0) ? 0 : foodInfo.defaultServingLiquidMl,
    is_liquid: foodInfo.isLiquid,
    calories: foodInfo.kcalPerServing,
    protein: foodInfo.proteinPerServing,
    fat: foodInfo.totalFatPerServing,
    carbs: foodInfo.carbPerServing,
    serving: foodInfo.Serving.map((serving: Tables<"Serving">) => ({
      serving_id: serving.id,
      serving_name: serving.servingName,
      serving_weight_grams: isNaN(serving.servingWeightGram || 0) ? 0 : serving.servingWeightGram,
      serving_default_serving_amount: serving.defaultServingAmount,
      serving_alternate_amount: serving.servingAlternateAmount,
      serving_alternate_unit: serving.servingAlternateUnit
    }))
  }
}

export async function completeMissingFoodInfo(
  foodInfo: FoodItemWithNutrientsAndServing,
  user: Tables<"User">
): Promise<FoodItemWithNutrientsAndServing | null> {
  console.log(`Looking for info about:` + foodInfo.name)

  let onlineSearchInfo = ""

  try {
    onlineSearchInfo = (await searchGoogleForFoodInfo(foodInfo.brand ? `${foodInfo.name} by ${foodInfo.brand}` : foodInfo.name, 4))!
  } catch (e) {
    console.log("could not get missing food info online query", e)
  }

    console.log('got info online', onlineSearchInfo)

  const model = "gpt-4-turbo"
  const temperatures = [0, 0.1] // Initial and retry temperatures
  let retryCount = 0
  const maxRetries = 1 // Allows for one retry
  let response

  while (retryCount <= maxRetries) {
    console.log("asking gpt4 for food info summary")
    const temperature = temperatures[retryCount] // Use initial or higher temperature based on retryCount
    const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
      {
        role: "system",
        content: missingFoodInfoPromptsByModel["gpt-4"].systemPrompt
      },
      {
        role: "user",
        content: missingFoodInfoPromptsByModel["gpt-4"].prompt
          .replace("EXTRA_ONLINE_INFO", onlineSearchInfo)
          .replace("FOOD_INFO_HERE", JSON.stringify(simplifyFoodInfo(foodInfo)))
      }
    ]

    try {
      response = await chatCompletion({ model, messages, temperature, response_format: "json_object" }, user)
      if (response.content) {
        console.log("response", response.content)
        let food_result: FoodMissingInfo = extractAndParseLastJSON(response.content) as FoodMissingInfo
        food_result = convertFieldsToNumbers(food_result)
        console.log(`food_result`, JSON.stringify(food_result, null, 2))
        return updateFoodItemWithMissingInfo(foodInfo, food_result)
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

export async function completeMissingFoodInfoLlama(
  foodInfo: FoodItemWithNutrientsAndServing,
  user: Tables<"User">
): Promise<FoodItemWithNutrientsAndServing | null> {
  console.log(`Looking for info about: ${foodInfo.name} by ${foodInfo.brand}`)

  let onlineSearchInfo = ""
  try {
    const foodName = foodInfo.brand ? `${foodInfo.name} by ${foodInfo.brand}` : foodInfo.name
    onlineSearchInfo = await searchGoogleForFoodInfo(foodName, 4)
    // onlineSearchInfo = await getMissingFoodInfoOnlineQuery(foodInfo.brand ? `${foodInfo.name} by ${foodInfo.brand}` : foodInfo.name) || "";
    // console.log("onlineSearchInfo", onlineSearchInfo);
  } catch (e) {
    console.error("Could not get missing food info online query", e)
  }

  const model = "accounts/fireworks/models/llama-v3-70b-instruct"
  const temperature = 0
  const prompt = missingFoodInfoPromptsByModel["llama3-70b"].prompt
    .replace("EXTRA_ONLINE_INFO", onlineSearchInfo)
    .replace("FOOD_INFO_HERE", JSON.stringify(simplifyFoodInfo(foodInfo)))
  console.log('prompt', prompt)
  const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
    {
      role: "system",
      content: missingFoodInfoPromptsByModel["llama3-70b"].systemPrompt
    },
    {
      role: "user",
      content: prompt
    }
  ]

  try {
    const response = await FireworksChatCompletion(user, { model, messages, temperature })
    if (response) {
      console.log("response", response)
      let foodResult: FoodMissingInfo = extractAndParseLastJSON(response)
      foodResult = convertFieldsToNumbers(foodResult)
      return updateFoodItemWithMissingInfo(foodInfo, foodResult)
    }
  } catch (error) {
    console.error(`Complete food info using Llama failed: ${error}`)
  }

  return null
}

async function getUserByEmail(email: string) {
  const supabase = createAdminSupabase()
  const { data, error } = await supabase.from("User").select("*").eq("email", email).single()
  return data
}

async function testCompleteMissingFoodInfo() {
  const foodItemToComplete: FoodItemWithNutrientsAndServing = {
    ...{
      id: 0,
      createdAtDateTime: "2024-02-07T16:50:22.451Z",
      externalId: "2479220",
      UPC: null,
      knownAs: [],
      description: null,
      lastUpdated: "2024-02-07T16:50:22.451Z",
      verified: true,
      userId: null,
      foodInfoSource: "FATSECRET",
      messageId: null,
      name: "Shrimp Shumai",
      brand: "JFC",
      defaultServingWeightGram: NaN,
      defaultServingLiquidMl: null,
      isLiquid: false,
      weightUnknown: true,
      kcalPerServing: 230,
      totalFatPerServing: 10,
      carbPerServing: 24,
      proteinPerServing: 13,
      satFatPerServing: null,
      fiberPerServing: null,
      sugarPerServing: null,
      transFatPerServing: null,
      addedSugarPerServing: null,
      Serving: [
        {
          servingWeightGram: NaN,
          servingAlternateAmount: null,
          servingAlternateUnit: null,
          servingName: "10 pieces",
          defaultServingAmount: null,
          id: 0,
          foodItemId: 0
        }
      ],
      Nutrient: [
        {
          nutrientName: "Cholesterol",
          nutrientAmountPerDefaultServing: 55,
          nutrientUnit: "mg",
          id: 0,
          foodItemId: 0
        }
      ],
      adaEmbedding: null,
      bgeBaseEmbedding: null
    },
    ...({} as Partial<FoodItemWithNutrientsAndServing>)
  } as FoodItemWithNutrientsAndServing

  const user = await getUserByEmail("seb.grubb@gmail.com")
  const fooditem = await completeMissingFoodInfoLlama(foodItemToComplete, user!)
  console.log(fooditem)
}

async function testMoreFoodCompletion() {
  const user = await getUserByEmail("seb.grubb@gmail.com")
  const food = {
    id: 0,
    createdAtDateTime: "2024-04-01T20:11:15.552Z",
    knownAs: [],
    description: null,
    lastUpdated: "2024-04-01T20:11:15.552Z",
    verified: true,
    userId: null,
    foodInfoSource: "USDA",
    messageId: null,
    name: "Intense Dark 72% Cacao Dark Chocolate, Intense Dark",
    brand: "Ghirardelli",
    weightUnknown: false,
    defaultServingWeightGram: 32,
    defaultServingLiquidMl: null,
    isLiquid: false,
    foodItemCategoryID: null,
    foodItemCategoryName: null,
    Serving: [
      {
        id: 0,
        foodItemId: 0,
        defaultServingAmount: null,
        servingWeightGram: 32,
        servingAlternateAmount: null,
        servingAlternateUnit: null,
        servingName: "3 squares"
      }
    ],
    UPC: 747599414275,
    externalId: "2214660",
    Nutrient: [
      {
        id: 0,
        foodItemId: 0,
        nutrientName: "cholesterol",
        nutrientUnit: "mg",
        nutrientAmountPerDefaultServing: 0
      },
      {
        id: 0,
        foodItemId: 0,
        nutrientName: "sodium",
        nutrientUnit: "mg",
        nutrientAmountPerDefaultServing: 0
      },
      {
        id: 0,
        foodItemId: 0,
        nutrientName: "calcium",
        nutrientUnit: "mg",
        nutrientAmountPerDefaultServing: 19.8
      },
      {
        id: 0,
        foodItemId: 0,
        nutrientName: "iron",
        nutrientUnit: "mg",
        nutrientAmountPerDefaultServing: 1.2
      },
      {
        id: 0,
        foodItemId: 0,
        nutrientName: "potassium",
        nutrientUnit: "mg",
        nutrientAmountPerDefaultServing: 200
      }
    ],
    kcalPerServing: 170,
    proteinPerServing: 2,
    totalFatPerServing: 15,
    carbPerServing: 14,
    fiberPerServing: 3.01,
    sugarPerServing: 8,
    satFatPerServing: 9,
    transFatPerServing: 0,
    addedSugarPerServing: 8,
    adaEmbedding: null,
    bgeBaseEmbedding: null
  } as FoodItemWithNutrientsAndServing

  const food_result = {
    default_serving_amount_grams: 32,
    default_serving_amount_ml: null,
    description:
      "Intense Dark 72% Cacao Dark Chocolate by Ghirardelli offers a rich and luxurious chocolate experience with a high cacao content, providing 170 calories, 2g of protein, 15g of fat, and 14g of carbs per serving.",
    serving: [
      {
        serving_id: 0,
        serving_name: "3 squares",
        serving_weight_grams: 32,
        serving_default_serving_amount: 1,
        serving_alternate_amount: 1.1428571428571428,
        serving_alternate_unit: "oz"
      },
      {
        serving_id: 1,
        serving_name: "piece",
        serving_weight_grams: 8,
        serving_default_serving_amount: 4,
        serving_alternate_amount: 0.2857142857142857,
        serving_alternate_unit: "oz"
      },
      {
        serving_id: 2,
        serving_name: "ounce",
        serving_weight_grams: 28,
        serving_default_serving_amount: 1.1428571428571428,
        serving_alternate_amount: 1,
        serving_alternate_unit: "oz"
      }
    ]
  }

  // const fooditem = await completeMissingFoodInfo(food, user!)
  console.log(updateFoodItemWithMissingInfo(food, food_result))
}

// testCompleteMissingFoodInfo()
// testMoreFoodCompletion()
