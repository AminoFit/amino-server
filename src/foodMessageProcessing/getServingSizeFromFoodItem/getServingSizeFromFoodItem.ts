import { FoodItemToLog } from "@/utils/loggedFoodItemInterface"
import { FoodItemWithNutrientsAndServing } from "@/app/dashboard/utils/FoodHelper"
import { Tables } from "types/supabase"
import { createAdminSupabase } from "@/utils/supabase/serverAdmin"
import * as math from "mathjs"
import { extractAndParseLastJSON } from "../common/extractJSON"
import { getUserByEmail } from "../common/debugHelper"
import { vertexChatCompletion } from "@/languageModelProviders/vertex/chatCompletionVertex"

const serving_assignement_prompt = `<user_message>
USER_SERVING_INPUT
</user_message>

<food_info>
FOOD_INFO_DETAILS
</food_info>

<food_serving_info>
FOOD_SERVING_DETAILS
</food_serving_info>

<goal>
Your task is to calculate the gram amount of a specified serving, using available information or general knowledge about food.
</goal>

<instructions>
1. If the user's description is vague, estimate as accurately as possible. If there is no informaiton assume the default serving size.
2. In cases where the item is described in relative terms like 'large' or 'small', and standard portions exist, apply a suitable multiplier (e.g., 'large' might be 1.1 times the standard).
3. Only use the serving info if it seems that user is referring to it.
4. If the user uses common measure units like ml, oz, lb, cup etc please use an appropriate conversion to grams.
5. Ultimately make sure that the equation_grams results in what would be a reasonable amount in grams for the serving.

Your output should be in JSON format, structured as follows:

reasoning:
Think about what information can be best used to estimate the gram amount

equation_grams:
Also known as the User Serving Equation Amount for Grams - This is the calculated gram amount the user consumed. If the calculation is straightforward, a simple number can be used. The result cannot be zero. Make an educated estimate if necessary. MUST ONLY CONTAINS NUMBERS AND NUMERICAL OPERATORS LIKE +-/*

serving_name: 
User serving name of unit short - short description of the serving unit the user specified, ideally less than 10 characters and limited to 1-2 words. "g", "lg", "small", "oz", "oz", "bun", "cookie", "serving" etc all ok

amount:
User Serving Amount - The quantity consumed by the user, in terms of user_serving_unit_short.

full_serving_string:
This is the most common way to describe the serving. E.g. "3 pieces", "50g", "1.5cups", "1 bottle" etc based on what the food is.

matching_serving_id:
The matching serving id - if there is a serving that matches the user request we can use that.
<instructions>

<examples>
Example 1:
Input: "3 Mini Chicken & Vegetable Wonton bibigo"
Food Info: {"name":"Mini Wontons Chicken & Vegetable","brand":"Bibigo","defaultServingWeightGram":140,"kcalPerServing":230,"defaultServingLiquidMl":null,"isLiquid":false,"weightUnknown":false}
Serving Info: [{"id":1,"servingWeightGram":140,"servingName":"pieces","servingAlternateAmount":null,"servingAlternateUnit":null,"defaultServingAmount":13}]
Output:
{
  "reasoning": "The default serving amount is 13 pieces for 140 gram so we can normalize that to get 3 pieces",
  "equation_grams": "140 / 13 * 3",
  "amount": 3,
  "serving_name": "pcs",
  "full_serving_string": "3 pieces",
  "matching_serving_id": 1
}

Example 2:
Input: "1 tbsp of chocolate hazelnut spread"
Food Info: {"name":"Hazelnut Chocolate Spread","brand":"Bonne Maman","defaultServingWeightGram":33,"kcalPerServing":180,"defaultServingLiquidMl":null,"isLiquid":false,"weightUnknown":false}
Serving Info: [{"id":1,"servingWeightGram":33,"servingName":"tbsp","servingAlternateAmount":null,"servingAlternateUnit":null,"defaultServingAmount":2}]
Output:
{
  "reasoning": "defaultServingAmount is 2 tbsp for 33 gram so we can normalize that to get 1 tbsp which is what the user requested",
  "equation_grams": "33 / 2 * 1",
  "amount": 1,
  "serving_name": "tbsp",
  "full_serving_string": "1 tbsp",
  "matching_serving_id": 1
}
Example 3:
Input: "10 raspberries"
Food Info: {"name":"Raspberries, Raw","brand":"","defaultServingWeightGram":100,"kcalPerServing":57.3375,"defaultServingLiquidMl":null,"isLiquid":false,"weightUnknown":false}
Serving Info: []
Output:
{
  "reasoning": "The default serving doesn't tell us much about the weight of a single raspberry. However we know that an individual raspberry weighs 3–5 g. We can assume 4g to calculate the total weight of 10 raspberries.",
  "equation_grams": "10 * 4",
  "amount": 4,
  "serving_name": "raspberries",
  "full_serving_string": "4 raspberries",
  "matching_serving_id": null
}
Example 4:
Input: 2 salmon avocado sushi
Food Info: {"name":"salmon avocado sushi","brand":null,"defaultServingWeightGram":210.98,"kcalPerServing":329.12,"defaultServingLiquidMl":null,"isLiquid":false,"weightUnknown":false}
Serving Info:[{"id":1,"servingWeightGram":210.98,"servingName":"roll","servingAlternateAmount":1,"servingAlternateUnit":"roll","defaultServingAmount":1},{"id":2,"servingWeightGram":26,"servingName":"piece","servingAlternateAmount":1,"servingAlternateUnit":"piece","defaultServingAmount":1},{"id":3,"servingWeightGram":28.3495,"servingName":"wt. oz","servingAlternateAmount":1,"servingAlternateUnit":"wt. oz","defaultServingAmount":1}]
Output:
{
  "reasoning": "The user specified 2 salmon avocado sushi which usually means 2 pieces. We can use that to calculate the total weight of 2 pieces.",
  "equation_grams": "26 * 2",
  "amount": 2,
  "serving_name": "pieces",
  "full_serving_string": "2 pieces",
  "matching_serving_id": 2
}
Example 5:
Input: half an avocado
Food Info: {"name":"Avocado, Raw","brand":"","defaultServingWeightGram":100,"kcalPerServing":160,"defaultServingLiquidMl":null,"isLiquid":false,"weightUnknown":false}
Serving Info: [{"id":1,"servingWeightGram":150,"servingName":"1 fruit","servingAlternateAmount":null,"servingAlternateUnit":null,"defaultServingAmount":1},{"id":2,"servingWeightGram":230,"servingName":"1 cup, mashed or pureed","servingAlternateAmount":0,"servingAlternateUnit":"","defaultServingAmount":1},{"id":3,"servingWeightGram":150,"servingName":"1 cup","servingAlternateAmount":0,"servingAlternateUnit":"","defaultServingAmount":1},{"id":4,"servingWeightGram":15,"servingName":"1 slice","servingAlternateAmount":0,"servingAlternateUnit":"","defaultServingAmount":1}]
Output:
{
  "reasoning": "The user specified half an avocado. We can see that one avocado fruit is 150 grams so we can use that to calculate the total weight of 0.5 avocados.",
  "equation_grams": "150 / 2",
  "amount": 0.5,
  "serving_name": "avocado",
  "full_serving_string": "0.5 avocado",
  "matching_serving_id": null
}
Example 6:
Input: one cup of Carbo Gain
Food Info: {"name":"Carbo Gain","brand":"Now Foods","defaultServingWeightGram":67,"kcalPerServing":250,"defaultServingLiquidMl":null,"isLiquid":false,"weightUnknown":false}
Serving Info: [{"id":1,"servingWeightGram":67,"servingName":"2/3 cup","servingAlternateAmount":null,"servingAlternateUnit":null,"defaultServingAmount":1}]
Output:
{
  "reasoning": "Using the serving information provided, we know that 2/3 cup of Carbo Gain weighs 67 grams. Thus 1 cup is 67/(2/3)",
  "equation_grams": "67 / (2/3) * 1",
  "amount": 1,
  "serving_name": "cup",
  "full_serving_string": "1 cup",
  "matching_serving_id": 1
}
Example 7:
Input: one whole Chia Seed Pudding container
Food Info:{"name":"Chia Seed Pudding","brand":"Juice Press","defaultServingWeightGram":129,"kcalPerServing":220,"defaultServingLiquidMl":null,"isLiquid":false,"weightUnknown":false}
Serving Info: [{"id":1,"servingWeightGram":129,"servingName":"0.5 container","servingAlternateAmount":0.5,"servingAlternateUnit":"container","defaultServingAmount":1}]
Output:
{
  "reasoning": "The user specified one whole container of Chia Seed Pudding. One serving is likely 0.5 container. According to the food serving info provided, 0.5 of a container weighs 129 grams.",
  "equation_grams": "129 / 0.5 * 1",
  "amount": 1,
  "serving_name": "container",
  "full_serving_string": "1 container",
  "matching_serving_id": 1
}
</examples>

<output_format>
{
  "reasoning": "string:
  "equation_grams": "string",
  "amount": "number,
  "serving_name": "string",
  "full_serving_string": "string",
  "matching_serving_id":"number | null"
}
</output_format>`

const systemPrompt = `You are a helpful food serving matching assistant. You accurately and precisely determine how much a user ate in grams. You reply in a perfect JSON.`
const SERVING_MATCH_MODEL = process.env.VERTEX_SERVING_MATCH_MODEL ?? "gemini-2.5-flash"
const DEFAULT_MAX_TOKENS = 1256
const MIN_VALID_SERVING_GRAMS = 1
const SERVING_MATCH_TEMPERATURES = [0, 0.1, 0.2]
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
    full_serving_string: string
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
    full_serving_string: `${JSON_result.full_serving_string}`
  }

  return food_item_to_log
}

interface ServingMatchRequestOptions {
  temperature?: number
  maxTokens?: number
}

async function requestServingMatchCompletion(
  user: Tables<"User">,
  prompt: string,
  { temperature = 0, maxTokens = DEFAULT_MAX_TOKENS }: ServingMatchRequestOptions = {}
) {
  try {
    const response = await vertexChatCompletion(
      {
        model: SERVING_MATCH_MODEL,
        systemPrompt,
        userMessage: prompt,
        temperature,
        max_tokens: maxTokens,
        response_format: "json_object"
      },
      user
    )

    return response?.trim()
  } catch (error) {
    console.error("Error requesting serving match completion from Vertex:", error)
    throw error
  }
}

export async function findBestServingMatchChatGemini(
  food_item_to_log: FoodItemToLog,
  food_item: FoodItemWithNutrientsAndServing,
  user: Tables<"User">
): Promise<FoodItemToLog> {
  const { simplifiedData, idMapping } = convertToDatabaseOptions(food_item)

  const user_serving_input = food_item_to_log.full_item_user_message_including_serving +
  (food_item_to_log.nutritional_information?.kcal ? ` with target calories ${food_item_to_log.nutritional_information.kcal}` : '');

  const serving_prompt = serving_assignement_prompt
    .replace("USER_SERVING_INPUT", user_serving_input)
    .replace("FOOD_INFO_DETAILS", JSON.stringify(simplifiedData.food_info))
    .replace("FOOD_SERVING_DETAILS", JSON.stringify(simplifiedData.food_serving_info))

  let updatedFoodItem = food_item_to_log

  for (const temperature of SERVING_MATCH_TEMPERATURES) {
    let response: string | undefined | null

    try {
      response = await requestServingMatchCompletion(user, serving_prompt, {
        temperature,
        maxTokens: DEFAULT_MAX_TOKENS
      })
    } catch (error) {
      // Surface the error on the first attempt; otherwise continue with the next temperature
      if (temperature === SERVING_MATCH_TEMPERATURES[0]) {
        throw error
      }
      console.warn("Retrying serving match after Vertex error", error)
      continue
    }

    if (!response) {
      continue
    }

    if (!extractAndParseLastJSON(response)) {
      console.warn("Vertex completion did not return valid JSON for serving match. Retrying with next temperature.")
      continue
    }

    updatedFoodItem = convertToServing(response, idMapping, food_item, updatedFoodItem)

    if ((updatedFoodItem.serving?.total_serving_g_or_ml ?? 0) >= MIN_VALID_SERVING_GRAMS) {
      break
    }
  }

  return updatedFoodItem
}

export const findBestServingMatchChatVertex = findBestServingMatchChatGemini
export const findBestServingMatchChatLlama = findBestServingMatchChatGemini

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
    brand: "Coca Cola",
    branded: true,
    serving: {
      serving_id: 0,
      serving_name: "can",
      serving_amount: 1,
      serving_g_or_ml: "g",
      full_serving_string: "1 can",
      total_serving_g_or_ml: 355
    },
    timeEaten: "2024-06-17T19:33:17.174Z",
    second_best_match: null,
    nutritional_information: { kcal: 160, carbG: 43, sugarG: 43, proteinG: 0, sodiumMg: 35, totalFatG: 0 },
    food_database_search_name: "Coca-Cola Classic",
    full_item_user_message_including_serving: "One can of Coca-Cola Classic (355ml, 160 calories)"
  } as FoodItemToLog
  const food_item = (await getFoodItem(700)) as FoodItemWithNutrientsAndServing

  // console.log(food_item)

  // Print everything in the object except for the bgeBaseEmbedding field
  // const { bgeBaseEmbedding, ...rest } = food_item
  // console.log(rest)
  // console.log(food_item)
  const serving_result = await findBestServingMatchChatGemini(food_serving_request, food_item, user)
  console.log("serving_result:")
  console.log(serving_result)
  return
}

// testServingMatchRequest()
