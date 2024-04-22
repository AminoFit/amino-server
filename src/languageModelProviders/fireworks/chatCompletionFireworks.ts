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
  baseURL: "https://api.fireworks.ai/inference/v1",
  apiKey: process.env.FIREWORKS_AI_API_KEY
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
export async function* FireworksChatCompletionStream(user: Tables<"User">, options: ChatCompletionStreamOptions) {
  const {
    model = "accounts/fireworks/models/llama-v3-70b-instruct",
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
    "fireworks",
    completionTimeMs
  )
}

async function testFireworks() {
  const user = (await getUserByEmail("seb.grubb@gmail.com"))!
  const stream = FireworksChatCompletionStream(user, {
    model: "accounts/fireworks/models/llama-v3-70b-instruct",
    prompt: "count to 10",
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

async function testFireworksFetch() {
  const result = await fetch("https://api.fireworks.ai/inference/v1/chat/completions", {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.FIREWORKS_AI_API_KEY}`
    },
    body: JSON.stringify({
      model: "accounts/fireworks/models/llama-v3-70b-instruct",
      max_tokens: 1024,
      top_p: 1,
      top_k: 40,
      presence_penalty: 0,
      frequency_penalty: 0,
      temperature: 0.6,
      messages: [
        {
          role: "user",
          content: "testing"
        }
      ]
    })
  })
  console.log(result)
}

// testFireworksFetch()

// testFireworks()
