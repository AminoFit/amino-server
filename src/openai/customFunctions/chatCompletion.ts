import { Configuration, OpenAIApi, ChatCompletionRequestMessage } from "openai"
import { User } from "@prisma/client"
import { LogOpenAiUsage } from "../utils/openAiHelper"

const configuration = new Configuration({
  apiKey: process.env.OPENAI_API_KEY
})

const openai = new OpenAIApi(configuration)

interface ChatCompletionOptions {
  model?: string
  max_tokens?: number
  temperature?: number
  messages: ChatCompletionRequestMessage[]
  functions?: any[] // You should replace 'any' with the appropriate type.
  function_call?: string
}

export async function chatCompletion(
  {
    messages,
    functions,
    model = "gpt-3.5-turbo-0613",
    temperature = 0.5,
    max_tokens = 2048,
    function_call = "auto",
    ...options
  }: ChatCompletionOptions,
  user: User
) {
  try {
    const result = await openai.createChatCompletion({
      model,
      messages,
      max_tokens,
      temperature,
      functions,
      function_call
    })

    if (!result.data.choices[0].message) {
      throw new Error("No return error from chat")
    }
    if (result.data.usage) {
      // log usage
      await LogOpenAiUsage(user, result.data.usage, model)
    }

    return result.data.choices[0].message
  } catch (error) {
    console.log(error)
    throw error
  }
}
