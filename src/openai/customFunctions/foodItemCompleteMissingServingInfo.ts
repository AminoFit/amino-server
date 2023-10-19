import { chatCompletion } from "./chatCompletion"
import OpenAI from "openai"
import { FoodItemWithNutrientsAndServing } from "../../app/dashboard/utils/FoodHelper"
import { User, Serving } from "@prisma/client"
import { checkCompliesWithSchema } from "../utils/openAiHelper"
import { prisma } from "../../database/prisma"

const servingInfoCompleteProperties = {
    type: 'object',
    properties: {
        servings: {
            type: 'array',
            items: {
                type: 'object',
                properties: {
                    serving_id: {
                        type: 'number'
                    },
                    servingAlternateAmount: {
                        type: 'number'
                    },
                    servingAlternateUnit: {
                        type: 'string'
                    }
                },
                required: ['serving_id', 'servingAlternateAmount', 'servingAlternateUnit']
            }
        }
    },
    required: ['servings']
};

const updateServingInfo = (servings: Serving[], autocompleteResults: any[]): Serving[] => {
  return servings.map((serving) => {
    const newServing = autocompleteResults.find((result) => result.serving_id === serving.id)
    if (newServing) {
      serving.servingAlternateAmount = newServing.servingAlternateAmount
      serving.servingAlternateUnit = newServing.servingAlternateUnit
    }
    return serving
  })
}

export async function foodItemCompleteMissingServingInfo(
  foodItem: FoodItemWithNutrientsAndServing,
  user: User
): Promise<FoodItemWithNutrientsAndServing> {
  const system =
    "You are a bot that autocompletes food item missing serving info. Call the autocomplete_missing_serving_info function to do so."

  const functions: any[] = [
    {
      name: "autocomplete_missing_serving_info",
      description: `
      Completes the missing serving information based on the servingName:
      - For format "x units", sets servingAlternateAmount to x and servingAlternateUnit to the singular form of the unit.
      - For a single word, assumes servingAlternateAmount as 1 and servingAlternateUnit as the word itself.
      - For format "name (x units)", sets servingAlternateAmount to x and servingAlternateUnit as "unit of name".
      `,
      parameters: servingInfoCompleteProperties
    }
  ]

  const inquiry = `
Food item: ${foodItem.name}${foodItem.brand ? "\nBrand: " + foodItem.brand : ""}
${generateServingString(foodItem)}
  `

  let result: any = null
  let messages: any[] = [
    { role: "system", content: system },
    { role: "user", content: inquiry }
  ]

  try {
    console.log("Calling chatCompletion with messages:", messages)
    console.log("Calling chatCompletion with functions:", JSON.stringify(functions))
    result = await chatCompletion(
      {
        messages,
        functions,
        model: "gpt-3.5-turbo-0613",
        temperature: 0.05,
        max_tokens: 2048
      },
      user
    )

    console.log("Result:", result)
    const servingInfoCompletionResult = JSON.parse(result.function_call.arguments)

    const has_valid_schema = checkCompliesWithSchema(servingInfoCompleteProperties, servingInfoCompletionResult)

    if (!has_valid_schema) {
      throw new Error("Invalid serving info completion")
    }

    foodItem.Servings = updateServingInfo(foodItem.Servings, servingInfoCompletionResult.servings)
    return foodItem
  } catch (error) {
    throw error
  }
}

const generateServingString = (foodItem: FoodItemWithNutrientsAndServing): string => {
  // Filter servings that have empty servingAlternateAmount and servingAlternateUnit
  const incompleteServings = foodItem.Servings.filter(
    (serving) => !serving.servingAlternateAmount || !serving.servingAlternateUnit
  ).slice(0, 5) // Take up to 5 servings only

  const servingsData = incompleteServings
    .map(
      (serving) => `---
  servingId: ${serving.id}
  servingName: ${serving.servingName}`
    )
    .join("\n")

  return servingsData
}
async function getFoodItemWithServingAndNutrient(id: number) {
  try {
    const foodItem = await prisma.foodItem.findUnique({
      where: { id: id },
      include: {
        Servings: true, // Include related Serving data
        // Assuming there is a relation called Nutrients on the FoodItem model
        Nutrients: true // Include related Nutrient data
      }
    })

    if (!foodItem) {
      throw new Error(`FoodItem with ID ${id} not found.`)
    }

    return foodItem
  } catch (error) {
    console.error("Error fetching FoodItem:", error)
    throw error
  }
}

async function getUserById(userId: string) {
  try {
    const user = await prisma.user.findUnique({
      where: { id: userId }
    })

    if (!user) {
      throw new Error(`User with ID ${userId} not found.`)
    }

    return user
  } catch (error) {
    console.error("Error fetching User:", error)
    throw error
  }
}

async function testCompleteMissingServingInfo() {
  const gummies = (await getFoodItemWithServingAndNutrient(80)) as FoodItemWithNutrientsAndServing
  const user = await getUserById("clklnwf090000lzssqhgfm8kr")
  const result = await foodItemCompleteMissingServingInfo(gummies, user)
  console.dir(result, { depth: null })
}

//testCompleteMissingServingInfo()
