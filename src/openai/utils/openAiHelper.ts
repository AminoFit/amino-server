import { openai } from "../../utils/openaiFunctionSchemas"
import { FoodItemToLog } from "@/utils/loggedFoodItemInterface"
import { User } from "@prisma/client"
import OpenAI from "openai"
import { prisma } from "../../database/prisma"

// Log usage
export async function LogOpenAiUsage(
  user: User,
  usage: OpenAI.CompletionUsage,
  modelName: string
) {
  //console.log(`This request used ${usage.total_tokens || "??"} tokens`)
  //console.log(`user id: ${user.id}`)
  const data = {
    promptTokens: usage.prompt_tokens,
    completionTokens: usage.completion_tokens,
    totalTokens: usage.total_tokens,
    userId: user.id,
    modelName
  }
  return await prisma.openAiUsage.create({
    data
  })
}

function checkType(actual: any, expected: any) {
  if (expected === "array") return Array.isArray(actual)
  else if (expected === "object")
    return actual !== null && typeof actual === "object"
  else if (expected === "integer" || expected === "number")
    return typeof actual === "number"
  else return typeof actual === expected
}

export function checkCompliesWithSchema(
  schema: { [key: string]: any },
  obj: any
) {
  if (!schema || typeof obj !== "object" || obj === null) {
    console.error(`The input object is either null or not an object.`)
    return false
  }

  // Check if required fields are in the object and they have the correct types
  for (const field of schema.required || []) {
    if (!(field in obj)) {
      console.error(`The required field ${field} is missing from the object.`)
      return false
    }

    if (!checkType(obj[field], schema.properties[field].type)) {
      console.error(
        `The field ${field} is of incorrect type (${typeof obj[
          field
        ]}). Expected ${schema.properties[field].type}.`
      )
      return false
    }

    // If it's an object or an array, do a recursive check
    if (schema.properties[field].type === "object") {
      // Make sure to check the properties of the object
      if (
        !checkCompliesWithSchema(
          schema.properties[field].properties,
          obj[field]
        )
      ) {
        console.error(`The object ${field} does not comply with its schema.`)
        return false
      }
    } else if (schema.properties[field].type === "array") {
      // Check each object in the array
      for (const item of obj[field]) {
        if (!checkCompliesWithSchema(schema.properties[field].items, item)) {
          console.error(
            `An item in the array ${field} does not comply with its schema.`
          )
          return false
        }
      }
    }
  }

  return true
}
// Checks that completions match a certain format
function checkOutput(completion: any): boolean {
  if (completion?.data.choices[0]) {
    const functionCall = completion.data.choices[0].message?.function_call

    if (functionCall) {
      const parameters = JSON.parse(functionCall.arguments)
      if (functionCall.name === "log_food_items") {
        const foodItems: FoodItemToLog[] = parameters.food_items

        // Check if any food item has total_serving_grams as 0 and serving_amount is non-zero
        for (const item of foodItems) {
          if (
            item.serving.total_serving_g_or_ml === 0 &&
            item.serving.serving_amount !== 0
          ) {
            return false // This means the completion is not valid
          }
        }
      }
    }
  }
  return true // Default to true if no issues are found
}

// Will do a first try with GPT3.5 and then fall back on GPT4
export async function getOpenAICompletion(
  gptRequest: any,
  user: User,
  maxRetries: number = 1,
  retryModel: string = "gpt-4-0613",
  retryTemperature: number = 0.1
): Promise<any | null> {
  let retries = 0
  let completion
  let successfulResponse = false

  while (retries < maxRetries && !successfulResponse) {
    try {
      // get completion from OpenAI
      completion = await openai.chat.completions.create(gptRequest)

      // Check for a successful response
      if (completion?.usage) {
        await LogOpenAiUsage(user, completion.usage, gptRequest.model)
        successfulResponse = checkOutput(completion)
        if (successfulResponse) {
          return completion
        }
      }
    } catch (err) {
      const error = err as { message: string; response?: { data: any } }
      console.error(
        "Error getting req from OpenAi",
        error.message,
        error.response?.data
      )
    }

    if (!successfulResponse && retries === 0) {
      gptRequest.model = retryModel
      gptRequest.temperature = retryTemperature
    }
    retries++
  }

  return null // Return null if no successful completion after all retries
}
