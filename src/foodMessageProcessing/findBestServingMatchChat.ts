import { FoodItemToLog } from "@/utils/loggedFoodItemInterface"
import { FoodItemWithNutrientsAndServing } from "@/app/dashboard/utils/FoodHelper"
import { Tables } from "types/supabase-generated.types"
import { createAdminSupabase } from "@/utils/supabase/serverAdmin"
import { chatCompletion } from "@/languageModelProviders/openai/customFunctions/chatCompletion"
import OpenAI from "openai"
import * as math from "mathjs"

const serving_assignement_prompt = `Your task is to calculate the gram amount of a specified serving, using available information.
1. If the user's description is vague, estimate as accurately as possible.
2. In cases where the item is described in relative terms like 'large' or 'small', and standard portions exist, apply a suitable multiplier (e.g., 'large' might be 1.1 times the standard).
3. Only use the serving info if it seems that user is referring to it.
4. If the user uses common measure units like ml, oz, lb, cup etc please use an appropriate conversion to grams.
5. Ultimately make sure that the user_serving_equation_amount_grams results in what would be a reasonable amount in grams for the serving.

Consider the statement: "USER_SERVING_INPUT"

Information about FOOD_NAME servings is as follows:
FOOD_SERVING_DETAILS

The servingWeightGram refers to the weight of the entire serving.
The defaultServingAmount is the standard quantity in one serving.
servingName might provide additional insights into the serving size.
Your output should be in JSON format, structured as follows:

equation:
Also known as the User Serving Equation Amount for Grams - This is the calculated gram amount the user consumed. Represent this as a mathematical equation (using operators like */+-) for precision. If the calculation is straightforward, a simple number can be used. The result cannot be zero. Make an educated estimate if necessary. It will be run in a js math eval environment so cannot contain any variable or unit names.
serving_name: 
User serving name of unit short - short description of the serving unit the user specified, ideally less than 10 characters and limited to 1-2 words. "g", "lg", "small", "oz", "oz", "bun", "cookie", "serving" etc all ok
amount
User Serving Amount - The quantity consumed by the user, in terms of user_serving_unit_short.
Provide the output in this JSON format:

{
  "equation": "string",
  "serving_name": "string",
  "amount": "number"
}`

export async function findBestServingMatchChat(
  food_item_to_log: FoodItemToLog,
  food_item: FoodItemWithNutrientsAndServing,
  user: Tables<"User">
): Promise<FoodItemToLog> {
  let servings = JSON.stringify(
    food_item.Serving
      // Filter out servings with no weight
      .filter(
        (serving) =>
          serving.servingWeightGram !== null && serving.servingWeightGram !== undefined && serving.servingWeightGram > 0
      )
      // Sort servings by weight, treating null as a large number
      .sort((a, b) => (a.servingWeightGram ?? Number.MAX_VALUE) - (b.servingWeightGram ?? Number.MAX_VALUE))
      // Keep only the top 6 servings
      .slice(0, 6)
      // Remove id and foodItemId from each serving
      .map((serving) => {
        const { id, foodItemId, ...rest } = serving
        return rest
      })
  )

  let food_name = food_item.brand ? `${food_item.brand} ${food_item.name}` : food_item.name

  let serving_prompt = serving_assignement_prompt
    .replace("USER_SERVING_INPUT", food_item_to_log.full_item_user_message_including_serving)
    .replace("FOOD_NAME", food_name)
    .replace("FOOD_SERVING_DETAILS", servings)

  let messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
    { role: "system", content: "You are a helpful assistant that only outputs valid JSON" },
    { role: "user", content: serving_prompt }
  ]

  // console.log(serving_prompt)

  // throw new Error("stop")
  let model = "gpt-4-0125-preview"
  let max_tokens = 2048
  let temperature = 0.05

  const response = await chatCompletion(
    {
      messages,
      model,
      temperature,
      max_tokens,
      response_format: "json_object"
    },
    user
  )

  console.log(JSON.parse(response.content!))

  const serving_result = JSON.parse(response.content!) as { equation: string; serving_name: string; amount: number }

  const serving_amount_grams = math.evaluate(serving_result.equation)

  let matchingServingId = 0 // Default to 0 if no match is found

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
  console.log("sortedServings", sortedServings)
  console.log("serving_amount_grams", serving_amount_grams)
  console.log("amount", serving_result.amount)
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
    serving_amount: serving_result.amount,
    serving_name: serving_result.serving_name,
    serving_g_or_ml: "g",
    total_serving_g_or_ml: serving_amount_grams,
    serving_id: matchingServingId,
    full_serving_string: `${serving_result.amount} ${serving_result.serving_name}`
  }

  return food_item_to_log
}

async function getUserByEmail(email: string) {
  const supabase = createAdminSupabase()
  const { data, error } = await supabase.from("User").select("*").eq("email", email)

  if (error) {
    console.error(error)
    return null
  }

  return data
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
  const user = (await getUserByEmail("seb.grubb@gmail.com"))![0] as Tables<"User">

  const food_serving_request = {
    brand: "Skinny Dipped",
    branded: true,
    food_database_search_name: "Chocolate skinny dipped almonds",
    full_item_user_message_including_serving: "0.1lb of skinny dipped almonds"
  }
  const indicesFood = [385, 424, 481, 396, 531, 406, 150, 303, 84]

  for (const index of indicesFood) {
    const originalData = (await getFoodItem(index)) as FoodItemWithNutrientsAndServing
    if (originalData) {
      const simplifiedData = {
        food_info: {
          name: originalData.name,
          brand: originalData.brand,
          defaultServingWeightGram: originalData.defaultServingWeightGram,
          kcalPerServing: originalData.kcalPerServing,
          defaultServingLiquidMl: originalData.defaultServingLiquidMl,
          isLiquid: originalData.isLiquid,
          weightUnknown: originalData.weightUnknown
        },
        food_serving_info: originalData.Serving.map((serving, index) => ({
          id: index + 1, // Start indexing at 1
          servingWeightGram: serving.servingWeightGram,
          servingName: serving.servingName,
          servingAlternateAmount: serving.servingAlternateAmount,
          servingAlternateUnit: serving.servingAlternateUnit,
          defaultServingAmount: serving.defaultServingAmount
        }))
      }

      console.log(simplifiedData)
    }
  }
  // const food_item = (await getFoodItem(1)) as FoodItemWithNutrientsAndServing

  // console.log(food_item)

  // Print everything in the object except for the bgeBaseEmbedding field
  // const { bgeBaseEmbedding, ...rest } = food_item
  // console.log(rest)

  // const serving_result = await findBestServingMatchChat(food_serving_request, food_item, user)
  // console.log(serving_result)
}

testServingMatchRequest()
