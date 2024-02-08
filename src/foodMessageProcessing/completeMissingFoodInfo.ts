import { getMissingFoodInfoOnlineQuery } from "./missingFoodInfoOnlineQuery"
import { chatCompletion } from "@/languageModelProviders/openai/customFunctions/chatCompletion"
import { Tables } from "types/supabase"
import { FoodItemWithNutrientsAndServing } from "@/app/dashboard/utils/FoodHelper"
import { createAdminSupabase } from "@/utils/supabase/serverAdmin"
import OpenAI from "openai"
import { extractAndParseLastJSON } from "./common/extractJSON"
import * as math from "mathjs"

const prompt = `The item below is missing some information. Using reasonable guesses and the available info, output in perfect JSON format all info about:

FOOD_INFO_HERE

Important: Only fill in the missing fields. If a field already has info just reuse that. Make sure to scale any values to the other know values.
Since your goal is to fill in the blanks you must be sure to scale if needed.

We know the following about the food item:
EXTRA_ONLINE_INFO

1. You may reason about all the fields and make educated guesses. (max 2-3 sentences)
2. If you can't find the info, please do a best guess based on similar items. (max 2-3 sentences)
3. Output in perfect JSON format all info about:
fields with number | string must either be a number or a string with an evaluable expression.
The expression can only contain ( ) + - * / and numbers and cannot contain any variables or functions.

description is a one sentence description of the food item with a focus on the main ingredients and nutritional content.
serving_alternate_unit is the unit of the serving in the serving_alternate_amount (e.g. in oz instead of g) - leave blank if not applicable
serving_alternate_amount is the amount of the serving in the serving_alternate_unit (e.g. in oz instead of g) - leave blank if not applicable
default_serving_amount_ml can be null if the item is not liquid. otherwise string (equation) or number
default_serving_amount_grams is the weight of the default serving in grams and can be a simple expression, if the item is liquid we can try to estimate the weight based on the density of the liquid. 1a. A small tip about weights: the minimum weight of an item must always be more than the sum of its macronutrients (e.g. if it has 10g carbs and 10g protein it is clearly 20g or more).

{
    default_serving_amount_grams: number | string,
    default_serving_amount_ml: number | string | null,
    description: string,
    serving: {
        serving_id: number,
        serving_name: string,
        serving_weight_grams: number | string,
        serving_default_serving_amount: number,
        serving_alternate_amount: number,
        serving_alternate_unit: string,
    }[]
}`

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
  if (!foodItem.description) foodItem.description = missingInfo.description

  // Update default serving amounts if they are not set correctly
  foodItem.defaultServingWeightGram = foodItem.defaultServingWeightGram
    ? foodItem.defaultServingWeightGram
    : (missingInfo.default_serving_amount_grams as number)
  foodItem.defaultServingLiquidMl = foodItem.defaultServingLiquidMl
    ? foodItem.defaultServingLiquidMl
    : (missingInfo.default_serving_amount_ml as number)

  // Iterate over servings to update them
  foodItem.Serving.forEach((serving) => {
    const updateInfo = missingInfo.serving.find((si) => si.serving_id === serving.id)
    if (updateInfo) {
      serving.servingWeightGram = !serving.servingWeightGram
        ? (updateInfo.serving_weight_grams as number)
        : serving.servingWeightGram
      serving.defaultServingAmount = serving.defaultServingAmount || updateInfo.serving_default_serving_amount
      serving.servingAlternateAmount = serving.servingAlternateAmount || updateInfo.serving_alternate_amount
      serving.servingAlternateUnit = serving.servingAlternateUnit || updateInfo.serving_alternate_unit
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
//   console.log(simplifyFoodInfo(foodInfo))

  let onlineSearchInfo = ""

  try {
    onlineSearchInfo = (await getMissingFoodInfoOnlineQuery(
      foodInfo.brand ? `${foodInfo.name} by ${foodInfo.brand}` : foodInfo.name
    ))!
  } catch (e) {
    console.log("could not get missing food info online query", e)
  }

//   console.log(onlineSearchInfo)

  const model = "gpt-4-turbo-preview";
  const temperatures = [0.01, 0.1]; // Initial and retry temperatures
  let retryCount = 0;
  const maxRetries = 1; // Allows for one retry
  let response;

  while (retryCount <= maxRetries) {
    const temperature = temperatures[retryCount]; // Use initial or higher temperature based on retryCount
    const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
      {
        role: "system",
        content: "You are a useful food assistant that knows all about food item nutritional info. You can reason a bit then output in perfect JSON,"
      },
      {
        role: "user",
        content: prompt
          .replace("EXTRA_ONLINE_INFO", onlineSearchInfo)
          .replace("FOOD_INFO_HERE", JSON.stringify(simplifyFoodInfo(foodInfo)))
      }
    ];

    try {
      response = await chatCompletion({ model, messages, temperature }, user);
      if (response.content) {
        let food_result: FoodMissingInfo = extractAndParseLastJSON(response.content) as FoodMissingInfo;
        food_result = convertFieldsToNumbers(food_result);
        // console.log(food_result);
        return updateFoodItemWithMissingInfo(foodInfo, food_result);
      }
      // Exit the loop if the response is successful but has no content
      break;
    } catch (error) {
      console.log(`Attempt for foodcompletion ${retryCount + 1} failed: ${error}`);
      retryCount++;
      // Continue to retry if there was an error and retryCount is within limits
    }
  }

  // Return null if retries exceeded or if no content was obtained
  return null;
}

async function getUserByEmail(email: string) {
  const supabase = createAdminSupabase()
  const { data, error } = await supabase.from("User").select("*").eq("email", email).single()
  return data
}

async function testCompleteMissingFoodInfo() {
  const foodItemToComplete: FoodItemWithNutrientsAndServing = {
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
  }

  const user = await getUserByEmail("seb.grubb@gmail.com")
  const fooditem = await completeMissingFoodInfo(foodItemToComplete, user!)
  console.log(fooditem)
}

// testCompleteMissingFoodInfo()
