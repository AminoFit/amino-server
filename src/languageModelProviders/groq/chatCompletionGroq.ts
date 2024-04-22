import OpenAI from "openai"
import { LogOpenAiUsage } from "../openai/utils/openAiHelper"
import { ChatCompletionCreateParams, ChatCompletionCreateParamsStreaming } from "openai/resources/chat"
import * as math from "mathjs"
import { Tables } from "types/supabase"
import { encode } from "gpt-tokenizer"
import {
  getPromptOutputFromCache,
  writePromptOutputToCache
} from "@/languageModelProviders/promptCaching/redisPromptCache"
import { getUserByEmail } from "@/foodMessageProcessing/common/debugHelper"

const openai = new OpenAI({
  baseURL: "https://api.groq.com/openai/v1",
  apiKey: process.env.GROQ_API_KEY
})

// Define the options interface with additional user and model details
export interface ChatCompletionStreamOptions {
  model?: string
  prompt: string
  temperature?: number
  max_tokens?: number
  stop?: string
  systemPrompt?: string
  response_format?: "json_object" | "text"
  [key: string]: any
}

// Define the async generator function
export async function* GroqChatCompletionStream(user: Tables<"User">, options: ChatCompletionStreamOptions) {
  const {
    model = "llama3-70b-8192",
    prompt,
    temperature = 0,
    max_tokens = 2048,
    stop,
    response_format = "text",
    systemPrompt = "You are a helpful assistant that only replies in valid JSON.",
    ...otherParams
  } = options

  const cachedResult = await getPromptOutputFromCache({
    systemPrompt,
    userMessage: prompt,
    modelName: model,
    temperature,
    max_tokens,
    response_format: response_format
  })

  if (cachedResult) {
    // console.log("cached result", cachedResult);
    const resultLength = cachedResult.length
    let startIndex = 0
    while (startIndex < resultLength) {
      const endIndex = Math.min(startIndex + 4, resultLength)
      const chunk = cachedResult.slice(startIndex, endIndex)
      yield chunk
      startIndex += 4
    }
    return
  }

  console.log("model and temp", model, temperature)
  const startTime = performance.now()

  const stream = await openai.chat.completions.create({
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: prompt }
    ],
    temperature,
    model,
    max_tokens,
    stop,
    ...otherParams,
    response_format: { type: response_format },
    stream: true
  })

  let totalResponse = ""
  for await (const chunk of stream) {
    if (chunk?.choices[0]?.delta?.content) {
      const content = chunk.choices[0].delta.content
      yield content
      totalResponse += content
    }
  }

  console.log("completed response", totalResponse)
  // Calculate token count and log usage
  const completionTimeMs = performance.now() - startTime
  const resultTokens = encode(totalResponse).length
  const promptTokens = encode(prompt + systemPrompt).length
  const totalTokens = resultTokens + promptTokens

  await writePromptOutputToCache(
    {
      systemPrompt,
      userMessage: prompt,
      modelName: model,
      temperature,
      max_tokens,
      response_format: response_format
    },
    totalResponse
  )

  console.log("logging performance", completionTimeMs, resultTokens, promptTokens, totalTokens)

  await LogOpenAiUsage(
    user,
    {
      total_tokens: totalTokens,
      prompt_tokens: promptTokens,
      completion_tokens: resultTokens
    },
    model,
    "groq",
    completionTimeMs
  )
}

interface ChatCompletionOptions {
    model?: string
    max_tokens?: number
    temperature?: number
    messages: OpenAI.Chat.ChatCompletionMessageParam[]
    functions?: any[] // You should replace 'any' with the appropriate type.
    function_call?: string
    prompt?: string
    stop?: string
    response_format?: "text" | "json_object"
  }
  
  export async function chatCompletion(
    {
      messages,
      functions,
      model = "llama3-70b-8192",
      temperature = 0.5,
      max_tokens = 2048,
      function_call = "auto",
      response_format = "text",
      ...options
    }: ChatCompletionOptions,
    user: Tables<"User">
  ) {
      // Extract the first system message
      let systemPrompt = messages.find((message) => message.role === "system")?.content
  
      // Extract the first user message
      let userMessage = messages.find((message) => message.role === "user")?.content
    if (!functions && typeof systemPrompt === "string" && typeof userMessage === "string") {
      const cachedResponse = await getPromptOutputFromCache({
        systemPrompt,
        userMessage,
        modelName: model,
        temperature,
        max_tokens,
        response_format: response_format
      })
      if (cachedResponse) {
        return {content: cachedResponse} as OpenAI.Chat.ChatCompletionMessage
      }
    }
    let startTime = performance.now()
    try {
      const result = await openai.chat.completions.create({
        model,
        messages,
        max_tokens,
        temperature,
        functions,
        response_format: { type: response_format }
      })
  
      if (!result.choices[0].message) {
        throw new Error("No return error from chat")
      }
  
      if (result.usage) {
        // log usage
        let completionTimeMs = performance.now() - startTime
        console.log("It took groq", completionTimeMs, "ms to complete this request")
        await LogOpenAiUsage(user, result.usage, model, "openai", completionTimeMs)
      }
  
      if (!functions && typeof systemPrompt === "string" && typeof userMessage === "string" && result.choices[0].message.content !== null) {
        await writePromptOutputToCache(
          {
            systemPrompt,
            userMessage,
            modelName: model,
            temperature,
            max_tokens,
            response_format: response_format
          },
          result.choices[0].message.content
        );
      } else {
        // Handle the case where systemPrompt or userMessage are not strings
        console.log("Either systemPrompt or userMessage is not a string.");
      }
  
      return result.choices[0].message
    } catch (error) {
      console.log(error)
      throw error
    }
  }

async function testGroq() {
  const user = (await getUserByEmail("seb.grubb@gmail.com"))!
//   const result = await chatCompletion(
//     {
//       messages: [
//         {
//           role: "system",
//           content: "You are a helpful assistant that only replies with valid JSON."
//         },
//         {
//           role: "user",
//           content: "count to 18"
//         }
//       ]
//     },
//     user
//   )
//   console.log(result)
  const stream = GroqChatCompletionStream(user, {
    model: "llama3-70b-8192",
    prompt: "count to 15",
    systemPrompt: "You are a helpful assistant that only replies with valid JSON.",
    response_format: "text"
  })
  let i = 0
  for await (const chunk of stream) {
    process.stdout.write(chunk.toString())
    // console.log(i, chunk.toString())
    // i++
    // if (chunk.choices && chunk.choices[0] && chunk.choices[0].delta && chunk.choices[0].delta.content) {
    //   process.stdout.write(chunk.choices[0].delta.content);
    // }
  }
}


// testGroq()
