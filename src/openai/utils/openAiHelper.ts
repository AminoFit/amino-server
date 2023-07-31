import { openai } from "@/utils/openaiFunctionSchemas"
import { FoodItemToLog } from "@/utils/loggedFoodItemInterface"
import { User } from "@prisma/client"
import { CreateCompletionResponseUsage } from "openai"
import { prisma } from "@/database/prisma"

// Log usage
async function LogOpenAiUsage(
  user: User,
  usage: CreateCompletionResponseUsage,
  modelName: string
) {
  console.log(`This request used ${usage.total_tokens || "??"} tokens`)
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
            item.serving.total_serving_grams === 0 &&
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
      completion = await openai.createChatCompletion(gptRequest)

      // Check for a successful response
      if (completion?.data.usage) {
        await LogOpenAiUsage(user, completion.data.usage, gptRequest.model)
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
