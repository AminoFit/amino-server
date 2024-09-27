// src/languageModelProviders/vertex/chatCompletionVertex.ts

import { GoogleGenerativeAI, SafetySetting, HarmCategory, HarmBlockThreshold, Part } from "@google/generative-ai"
import { LogOpenAiUsage } from "../openai/utils/openAiHelper"
import { Tables } from "types/supabase"
import {
  getPromptOutputFromCache,
  writePromptOutputToCache
} from "@/languageModelProviders/promptCaching/redisPromptCache"
import { CompletionUsage } from "openai/resources"
import { encode } from "gpt-tokenizer"
import { getUserByEmail } from "@/foodMessageProcessing/common/debugHelper"

// Initialize Google Generative AI with your API key
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!)

// Define the ChatCompletionOptions interface
export interface ChatCompletionOptions {
  model: string // Model name is required
  systemPrompt?: string // Optional system prompt
  userMessage: string // Single user message
  temperature?: number
  max_tokens?: number
  response_format?: "json_object" | "text"
  safetySettings?: SafetySetting[] // Optional safety settings
  [key: string]: any
}

/**
 * Non-streaming chat completion function for Vertex AI Gemini models.
 *
 * @param options - ChatCompletionOptions containing model, messages, and other parameters.
 * @param user - The user making the request.
 * @returns A promise that resolves to the generated response text.
 */
export async function vertexChatCompletion(
  {
    model,
    systemPrompt,
    userMessage,
    temperature = 0.1,
    max_tokens = 1024,
    response_format = "text",
    safetySettings,
    ...options
  }: ChatCompletionOptions,
  user: Tables<"User">
): Promise<string> {
  // Check cache to avoid redundant API calls
  if (systemPrompt && userMessage) {
    const cachedResponse = await getPromptOutputFromCache({
      systemPrompt,
      userMessage,
      modelName: model,
      temperature,
      max_tokens,
      response_format
    })
    if (cachedResponse) {
      return cachedResponse
    }
  }

  let startTime = performance.now()
  try {
    // Start a new chat session with the specified model
    const generativeModel = genAI.getGenerativeModel({ model })
    const inputToGemini = {
      systemInstruction: {
        role: "system",
        parts: [
          {
            text: systemPrompt || ""
          }
        ]
      },
      safetySettings,
      generationConfig: {
        temperature,
        topP: 0.95, // You can adjust or make this configurable
        topK: 40, // You can adjust or make this configurable
        maxOutputTokens: max_tokens,
        responseMimeType: response_format === "json_object" ? "application/json" : "text/plain"
      },
      ...options
    }
    console.log("inputToGemini", JSON.stringify(inputToGemini, null, 2))
    const chatSession = generativeModel.startChat(inputToGemini)

    // Send the user message
    const result = await chatSession.sendMessage(userMessage)

    // Extract the response text
    const responseText = result.response.text()

    // Log usage and cache the response
    if (responseText) {
      let completionTimeMs = performance.now() - startTime
      const totalTokens = encode(responseText).length
      const promptTokens = encode(JSON.stringify({ systemPrompt, userMessage })).length

      const tokenCompletionUsage: CompletionUsage = {
        prompt_tokens: promptTokens,
        completion_tokens: totalTokens - promptTokens,
        total_tokens: totalTokens
      }

      // Log usage data
      await LogOpenAiUsage(user, tokenCompletionUsage, model, "vertex", completionTimeMs)

      // Cache the response for future requests
      if (systemPrompt && userMessage) {
        await writePromptOutputToCache(
          {
            systemPrompt,
            userMessage,
            modelName: model,
            temperature,
            max_tokens,
            response_format
          },
          responseText
        )
      }
    }

    return responseText
  } catch (error) {
    console.error(`Error with Vertex AI API:`, error)
    throw error
  }
}

/**
 * Streaming chat completion function for Vertex AI Gemini models.
 *
 * @param options - ChatCompletionOptions containing model, messages, and other parameters.
 * @param user - The user making the request.
 * @returns An async generator that yields chunks of the generated response text.
 */
export async function* vertexChatCompletionStream(
    {
      model,
      systemPrompt,
      userMessage,
      temperature = 0.1,
      max_tokens = 1024,
      response_format = "text",
      safetySettings,
      ...options
    }: ChatCompletionOptions,
    user: Tables<"User">
  ): AsyncGenerator<string, void, unknown> {
    // Check cache before initiating a new chat session
    if (systemPrompt && userMessage) {
      const cachedResponse = await getPromptOutputFromCache({
        systemPrompt,
        userMessage,
        modelName: model,
        temperature,
        max_tokens,
        response_format
      })
      if (cachedResponse) {
        // Yield the cached response in chunks of 4 characters
        let startIndex = 0
        const responseLength = cachedResponse.length
        while (startIndex < responseLength) {
          const endIndex = Math.min(startIndex + 4, responseLength)
          yield cachedResponse.slice(startIndex, endIndex)
          startIndex += 4
        }
        return
      }
    }
  
    let startTime = performance.now()
    let totalResponse = ""
  
    try {
      // Start a new chat session with the specified model
      const generativeModel = genAI.getGenerativeModel({ model })
      const chatSession = generativeModel.startChat({
        systemInstruction: {
          role: "system",
          parts: [
            {
              text: systemPrompt || ""
            }
          ]
        },
        safetySettings, // Pass safety settings if provided
        generationConfig: {
          temperature,
          topP: 0.95, // You can adjust or make this configurable
          topK: 40, // You can adjust or make this configurable
          maxOutputTokens: max_tokens,
          responseMimeType: response_format === "json_object" ? "application/json" : "text/plain"
        },
        ...options
      })
  
      // Send the user message and receive the streaming response
      const streamResult = await chatSession.sendMessageStream(userMessage)
  
      // Buffer to hold partial chunks of text
      let buffer = ""
  
      // Iterate over the streaming response
      for await (const chunk of streamResult.stream) {
        const chunkText = chunk.text() // Get the text from the chunk
        buffer += chunkText // Append the chunk to the buffer
        totalResponse += chunkText // Accumulate the full response for caching
  
        // Process and yield the buffer in parts of 4 characters
        while (buffer.length >= 4) {
          yield buffer.slice(0, 4) // Yield the first 4 characters
          buffer = buffer.slice(4) // Remove the first 4 characters from the buffer
        }
      }
  
      // Yield the remaining characters if any
      if (buffer.length > 0) {
        yield buffer
      }
  
      // After streaming is complete, cache the full response
      if (systemPrompt && userMessage && totalResponse) {
        await writePromptOutputToCache(
          {
            systemPrompt,
            userMessage,
            modelName: model,
            temperature,
            max_tokens,
            response_format
          },
          totalResponse
        )
  
        // Log usage data
        let completionTimeMs = performance.now() - startTime
        const totalTokens = encode(totalResponse).length
        const promptTokens = encode(JSON.stringify({ systemPrompt, userMessage })).length
  
        const tokenCompletionUsage: CompletionUsage = {
          prompt_tokens: promptTokens,
          completion_tokens: totalTokens - promptTokens,
          total_tokens: totalTokens
        }
  
        await LogOpenAiUsage(user, tokenCompletionUsage, model, "vertex", completionTimeMs)
      }
    } catch (error) {
      console.error(`Error with Vertex AI streaming API:`, error)
      throw error
    }
  }

// ---------------------------
// Testing Functions
// ---------------------------

/**
 * Test the non-streaming Vertex AI chat completion function.
 */
async function testVertexChatCompletion() {
  const user = await getUserByEmail("seb.grubb@gmail.com")

  const messages = [
    { role: "system", content: "You are a helpful assistant." },
    {
      role: "user",
      content:
        "Please provide a brief comparison of quantum computing and classical computing in terms of their fundamental principles and potential applications. Write in markdown."
    }
  ]

  // Extract systemPrompt and userMessage
  const systemPrompt = messages.find((msg) => msg.role === "system")?.content
  const userMessage = messages.find((msg) => msg.role === "user")?.content

  if (!userMessage) {
    console.error("No user message found.")
    return
  }

  try {
    const response = await vertexChatCompletion(
      {
        model: "gemini-1.5-flash-002",
        systemPrompt: systemPrompt || undefined,
        userMessage: userMessage,
        temperature: 0.7,
        max_tokens: 1024,
        response_format: "text"
        // safetySettings: [ // Optional
        //   {
        //     category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
        //     threshold: HarmBlockThreshold.HARM_BLOCK_THRESHOLD_HIGH,
        //   },
        // ],
      },
      user!
    )
    console.log("Vertex AI Response:", response)
  } catch (error) {
    console.error("Error with Vertex AI chat completion:", error)
  }
}

/**
 * Test the streaming Vertex AI chat completion function.
 */
async function testVertexChatCompletionStream() {
  const user = await getUserByEmail("seb.grubb@gmail.com")

  const messages = [
    { role: "system", content: "You are a helpful assistant." },
    {
      role: "user",
      content: "Please tell me all the cool ways we can use AI to help us."
    }
  ]

  // Extract systemPrompt and userMessage
  const systemPrompt = messages.find((msg) => msg.role === "system")?.content
  const userMessage = messages.find((msg) => msg.role === "user")?.content

  if (!userMessage) {
    console.error("No user message found.")
    return
  }

  try {
    for await (const chunk of vertexChatCompletionStream(
      {
        model: "gemini-1.5-flash-002",
        systemPrompt: systemPrompt || undefined,
        userMessage: userMessage,
        temperature: 0.1,
        max_tokens: 1024,
        response_format: "json_object"
        // safetySettings: [ // Optional
        //   {
        //     category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
        //     threshold: HarmBlockThreshold.HARM_BLOCK_THRESHOLD_HIGH,
        //   },
        // ],
      },
      user!
    )) {
      process.stdout.write(chunk)
    }
    process.stdout.write("\n")
  } catch (error) {
    console.error("Error with Vertex AI chat completion stream:", error)
  }
}

// Uncomment to run tests
// testVertexChatCompletion()
// testVertexChatCompletionStream();
