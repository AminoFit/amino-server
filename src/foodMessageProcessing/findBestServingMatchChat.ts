import { FoodItemToLog } from "@/utils/loggedFoodItemInterface"
import { FoodItemWithNutrientsAndServing } from "@/app/dashboard/utils/FoodHelper"
import { Tables } from "types/supabase"
import { createAdminSupabase } from "@/utils/supabase/serverAdmin"
import { chatCompletion } from "@/languageModelProviders/openai/customFunctions/chatCompletion"
import OpenAI from "openai"
import * as math from "mathjs"
import { extractAndParseLastJSON } from "./common/extractJSON"
import { getUserByEmail } from "./common/debugHelper"

const serving_assignement_prompt = `User_message:
"USER_SERVING_INPUT"

food_info:
FOOD_INFO_DETAILS

food_serving_info:
FOOD_SERVING_DETAILS

Goal:
Your task is to calculate the gram amount of a specified serving, using available information.

Information
1. If the user's description is vague, estimate as accurately as possible.
2. In cases where the item is described in relative terms like 'large' or 'small', and standard portions exist, apply a suitable multiplier (e.g., 'large' might be 1.1 times the standard).
3. Only use the serving info if it seems that user is referring to it.
4. If the user uses common measure units like ml, oz, lb, cup etc please use an appropriate conversion to grams.
5. Ultimately make sure that the equation_grams results in what would be a reasonable amount in grams for the serving.

Your output should be in JSON format, structured as follows:

equation_grams:
Also known as the User Serving Equation Amount for Grams - This is the calculated gram amount the user consumed. If the calculation is straightforward, a simple number can be used. The result cannot be zero. Make an educated estimate if necessary. MUST ONLY CONTAINS NUMBERS AND NUMERICAL OPERATORS LIKE +-/*

serving_name: 
User serving name of unit short - short description of the serving unit the user specified, ideally less than 10 characters and limited to 1-2 words. "g", "lg", "small", "oz", "oz", "bun", "cookie", "serving" etc all ok

amount:
User Serving Amount - The quantity consumed by the user, in terms of user_serving_unit_short.

matching_serving_id:
The matching serving id - if there is a serving that matches the user request we can use that.

You can reason for max 1-2 sentences then output in JSON.

You will output in this perfect JSON format:
{
  "equation_grams": "string",
  "serving_name": "string",
  "amount": "number,
  "matching_serving_id":"number | null"
}`

let systemPrompt = `You are a helpful food serving matching assistant. You accurately and precisely determine how much a user ate in grams. You reply in a perfect JSON.`
interface ConversionResult {
  simplifiedData: any // Adjust this type according to your needs
  idMapping: Record<number, number>
}

const convertToDatabaseOptions = (foodItem: FoodItemWithNutrientsAndServing): ConversionResult => {
  const idMapping: Record<number, number> = {} // Maps new ID (index + 1) to original ID (serving.id)

  const simplifiedData = {
    food_info: {
      name: foodItem.name,
      brand: foodItem.brand,
      defaultServingWeightGram: foodItem.defaultServingWeightGram,
      kcalPerServing: foodItem.kcalPerServing,
      defaultServingLiquidMl: foodItem.defaultServingLiquidMl,
      isLiquid: foodItem.isLiquid,
      weightUnknown: foodItem.weightUnknown
    },
    food_serving_info: foodItem.Serving.map((serving, index) => {
      const newId = index + 1
      idMapping[newId] = serving.id // Map new ID to original ID
      return {
        id: newId,
        servingWeightGram: serving.servingWeightGram,
        servingName: serving.servingName,
        servingAlternateAmount: serving.servingAlternateAmount,
        servingAlternateUnit: serving.servingAlternateUnit,
        defaultServingAmount: serving.defaultServingAmount
      }
    })
  }

  return { simplifiedData, idMapping }
}

const remapIds = (jsonResult: any, idMapping: Record<number, number>): any => {
  if (jsonResult.matching_serving_id !== null && idMapping[jsonResult.matching_serving_id]) {
    jsonResult.matching_serving_id = idMapping[jsonResult.matching_serving_id]
  }
  return jsonResult
}

function convertToServing(
  response: string,
  idMapping: Record<number, number>,
  food_item: FoodItemWithNutrientsAndServing,
  food_item_to_log: any
) {
  const JSON_result = remapIds(extractAndParseLastJSON(response), idMapping) as {
    equation_grams: string
    serving_name: string
    amount: number
    matching_serving_id: number | null
  }

  const serving_amount_grams = math.evaluate(JSON_result.equation_grams)

  let matchingServingId = JSON_result.matching_serving_id || 0

  // Define the threshold as a percentage of the user's serving amount in grams
  const thresholdPercentage = 0.01 // 1%
  const threshold = serving_amount_grams * thresholdPercentage

  // Filter, sort servings by weight per unit, and find the best match
  const sortedServings = food_item.Serving.filter((serving) => serving.servingWeightGram !== null) // Filter out null servingWeightGram
    .sort((a, b) => {
      const weightPerUnitA = (a.servingWeightGram ?? 0) / (a.defaultServingAmount ?? 1)
      const weightPerUnitB = (b.servingWeightGram ?? 0) / (b.defaultServingAmount ?? 1)
      return weightPerUnitA - weightPerUnitB
    })
  for (const serving of sortedServings) {
    const weightPerUnit = (serving.servingWeightGram ?? 0) / (serving.defaultServingAmount ?? 1)
    const userUnits = serving_amount_grams / weightPerUnit

    if (Number.isInteger(userUnits) && Math.abs(serving_amount_grams - userUnits * weightPerUnit) <= threshold) {
      matchingServingId = serving.id
      break
    }
  }

  // Update the serving details in food_item_to_log
  food_item_to_log.serving = {
    serving_amount: JSON_result.amount,
    serving_name: JSON_result.serving_name,
    serving_g_or_ml: "g",
    total_serving_g_or_ml: serving_amount_grams,
    serving_id: matchingServingId,
    full_serving_string: `${JSON_result.amount} ${JSON_result.serving_name}`
  }

  return food_item_to_log
}

async function getResponseWithRetry(
  messages: OpenAI.Chat.ChatCompletionMessageParam[],
  model: string,
  backup_model: string,
  temperature: number,
  max_tokens: number,
  user: Tables<"User">
) {
  let response = await chatCompletion(
    {
      messages,
      model,
      temperature,
      max_tokens
    },
    user
  )
  if (!response.content || extractAndParseLastJSON(response.content) === null) {
    response = await chatCompletion(
      {
        messages,
        model: backup_model,
        temperature,
        max_tokens
      },
      user
    )
  }
  return response
}

export async function findBestServingMatchChat(
  food_item_to_log: FoodItemToLog,
  food_item: FoodItemWithNutrientsAndServing,
  user: Tables<"User">
): Promise<FoodItemToLog> {
  const { simplifiedData, idMapping } = convertToDatabaseOptions(food_item)

  let serving_prompt = serving_assignement_prompt
    .replace("USER_SERVING_INPUT", food_item_to_log.full_item_user_message_including_serving)
    .replace("FOOD_INFO_DETAILS", JSON.stringify(simplifiedData.food_info))
    .replace("FOOD_SERVING_DETAILS", JSON.stringify(simplifiedData.food_serving_info))

  let messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
    { role: "system", content: systemPrompt },
    { role: "user", content: serving_prompt }
  ]

  // throw new Error("stop")
  let model = "ft:gpt-3.5-turbo-1106:hedge-labs::8oaRSJIo"
  let backup_model = "gpt-4-0125-preview"
  let max_tokens = 2048
  let temperature = 0.0

  let response = await getResponseWithRetry(messages, model, backup_model, temperature, max_tokens, user)

  food_item_to_log = convertToServing(response.content!, idMapping, food_item, food_item_to_log)

  if ((food_item_to_log.serving?.total_serving_g_or_ml ?? 0) < 1) {
    temperature = 0.1
    response = await getResponseWithRetry(messages, model, backup_model, temperature, max_tokens, user)
    food_item_to_log = convertToServing(response.content!, idMapping, food_item, food_item_to_log)
  }
  if ((food_item_to_log.serving?.total_serving_g_or_ml ?? 0) < 1) {
    model = "gpt-4-0125-preview"
    response = await getResponseWithRetry(messages, model, backup_model, temperature, max_tokens, user)
  }
  return food_item_to_log
}

async function getFoodItem(id: number) {
  const supabase = createAdminSupabase()
  const { data, error } = await supabase.from("FoodItem").select("*, Serving(*)").eq("id", id).single()

  if (error) {
    console.error(error)
    return null
  }

  return data
}

async function testServingMatchRequest() {
  const user = (await getUserByEmail("seb.grubb@gmail.com"))! as Tables<"User">

  const food_serving_request = {
    brand: "Aplenty",
    branded: true,
    food_database_search_name: "chicken dumplings",
    full_item_user_message_including_serving: "3 chicken dumplings by aplenty"
  }
  const food_item = (await getFoodItem(557)) as FoodItemWithNutrientsAndServing

  // console.log(food_item)

  // Print everything in the object except for the bgeBaseEmbedding field
  // const { bgeBaseEmbedding, ...rest } = food_item
  // console.log(rest)
  // console.log(food_item)
  const serving_result = await findBestServingMatchChat(food_serving_request, food_item, user)
  console.log(serving_result)
  return
}

// testServingMatchRequest()
