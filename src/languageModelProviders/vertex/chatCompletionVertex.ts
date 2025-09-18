// src/languageModelProviders/vertex/chatCompletionVertex.ts

// New SDK
import { GoogleGenAI, Type } from "@google/genai"
import { LogOpenAiUsage } from "../openai/utils/openAiHelper"
import { Tables } from "types/supabase"
import {
  getPromptOutputFromCache,
  writePromptOutputToCache
} from "@/languageModelProviders/promptCaching/redisPromptCache"
import { CompletionUsage } from "openai/resources"
import { encode } from "gpt-tokenizer"
import { getUserByEmail } from "@/foodMessageProcessing/common/debugHelper"

// ---------------------------
// Types & Constants
// ---------------------------

// Keep ChatCompletionOptions shape compatible; add optional 'thinking' knob.
// thinking:
//  - omitted or false  => OFF (thinkingBudget: 0)
//  - true or "auto"    => dynamic (thinkingBudget: -1)
//  - number            => explicit budget
export interface ChatCompletionOptions {
  model: string
  systemPrompt?: string
  userMessage: string
  temperature?: number
  max_tokens?: number
  response_format?: "json_object" | "text"
  safetySettings?: Array<{ category: string; threshold: string }> // accept legacy-like shape
  // NEW (optional, backwards-compatible):
  // See mapping above. Off by default.
  thinking?: boolean | number | "auto"
  // Pass-through bag for any future config fields
  [key: string]: any
}

// Initialize Google GenAI client
const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY!
})

// Helper: build GenAI config object (shared by both funcs)
function buildGenAIConfig({
  systemPrompt,
  temperature,
  topP = 0.95,
  topK = 40,
  max_tokens,
  response_format,
  safetySettings,
  thinking,
  extraConfig = {}
}: {
  systemPrompt?: string
  temperature?: number
  topP?: number
  topK?: number
  max_tokens?: number
  response_format?: "json_object" | "text"
  safetySettings?: Array<{ category: string; threshold: string }>
  thinking?: boolean | number | "auto"
  extraConfig?: Record<string, any>
}) {
  // Thinking: OFF by default
  let thinkingBudget: number = 0
  if (thinking === true || thinking === "auto") thinkingBudget = -1
  else if (typeof thinking === "number") thinkingBudget = thinking

  const config: Record<string, any> = {
    temperature,
    topP,
    topK,
    maxOutputTokens: max_tokens,
    responseMimeType: response_format === "json_object" ? "application/json" : "text/plain",
    thinkingConfig: { thinkingBudget }, // 0 disables; -1 enables dynamic
    ...extraConfig
  }

  if (systemPrompt) {
    // The JS SDK accepts strings or Content; keep it simple for system prompts
    config.systemInstruction = systemPrompt
  }

  if (safetySettings && Array.isArray(safetySettings) && safetySettings.length) {
    config.safetySettings = safetySettings
  }

  return config
}

/**
 * Non-streaming chat completion for Gemini via Google GenAI SDK.
 * Signature unchanged for backwards compatibility.
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
    thinking, // optional; OFF by default
    responseSchema, // optional structured output schema (works with responseMimeType)
    ...options
  }: ChatCompletionOptions,
  user: Tables<"User">
): Promise<string> {
  // Serve from cache if available
  if (systemPrompt && userMessage) {
    const cachedResponse = await getPromptOutputFromCache({
      systemPrompt,
      userMessage,
      modelName: model,
      temperature,
      max_tokens,
      response_format
    })
    if (cachedResponse) return cachedResponse
  }

  const startTime = performance.now()
  try {
    // Build config; pass any extra unknown options through for forward-compat
    const config = buildGenAIConfig({
      systemPrompt,
      temperature,
      max_tokens,
      response_format,
      safetySettings,
      thinking,
      extraConfig: {
        ...options,
        ...(responseSchema
          ? { responseSchema }
          : {})
      }
    })

    const contents = [
      {
        role: "user",
        parts: [{ text: userMessage }]
      }
    ]

    const response = await ai.models.generateContent({
      model,
      contents,
      config
    })

    // New SDK exposes `text` as a property; keep fallback to function for safety
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    const responseText: string = typeof response.text === "function" ? response.text() : response.text

    if (responseText) {
      const completionTimeMs = performance.now() - startTime
      const totalTokens = encode(responseText).length
      const promptTokens = encode(JSON.stringify({ systemPrompt, userMessage })).length

      const tokenCompletionUsage: CompletionUsage = {
        prompt_tokens: promptTokens,
        completion_tokens: Math.max(0, totalTokens - promptTokens),
        total_tokens: totalTokens
      }

      await LogOpenAiUsage(user, tokenCompletionUsage, model, "vertex", completionTimeMs)

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
    console.error(`Error with GenAI generateContent:`, error)
    throw error
  }
}

/**
 * Streaming chat completion for Gemini via Google GenAI SDK.
 * Signature unchanged for backwards compatibility.
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
    thinking, // optional; OFF by default
    responseSchema,
    ...restOptions
  }: ChatCompletionOptions,
  user: Tables<"User">
): AsyncGenerator<string, void, unknown> {
  // Cache check first
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

  const startTime = performance.now()
  let totalResponse = ""

  try {
    const config = buildGenAIConfig({
      systemPrompt,
      temperature,
      max_tokens,
      response_format,
      safetySettings,
      thinking,
      extraConfig: {
        ...restOptions,
        ...(responseSchema
          ? { responseSchema }
          : {})
      }
    })

    const contents = [
      {
        role: "user",
        parts: [{ text: userMessage }]
      }
    ]

    // Stream chunks directly from the new SDK
    const stream = await ai.models.generateContentStream({
      model,
      contents,
      config
    })

    // Buffer to yield fixed-size chunks (4 chars), matching prior behavior
    let buffer = ""

    for await (const chunk of stream) {
      const chunkText: string = (chunk as any).text ?? ""
      if (!chunkText) continue
      buffer += chunkText
      totalResponse += chunkText

      while (buffer.length >= 4) {
        yield buffer.slice(0, 4)
        buffer = buffer.slice(4)
      }
    }

    if (buffer.length > 0) {
      yield buffer
    }

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

      const completionTimeMs = performance.now() - startTime
      const totalTokens = encode(totalResponse).length
      const promptTokens = encode(JSON.stringify({ systemPrompt, userMessage })).length

      const tokenCompletionUsage: CompletionUsage = {
        prompt_tokens: promptTokens,
        completion_tokens: Math.max(0, totalTokens - promptTokens),
        total_tokens: totalTokens
      }

      await LogOpenAiUsage(user, tokenCompletionUsage, model, "vertex", completionTimeMs)
    }
  } catch (error) {
    console.error(`Error with GenAI generateContentStream:`, error)
    throw error
  }
}

// ---------------------------
// Testing Functions
// ---------------------------

/**
 * Test the non-streaming function.
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

  const systemPrompt = messages.find((m) => m.role === "system")?.content
  const userMessage = messages.find((m) => m.role === "user")?.content
  if (!userMessage) {
    console.error("No user message found.")
    return
  }

  try {
    const response = await vertexChatCompletion(
      {
        model: "gemini-2.5-flash",
        systemPrompt,
        userMessage,
        temperature: 0.7,
        max_tokens: 1024,
        response_format: "text",
        // thinking is OFF by default; enable dynamic thinking with `thinking: true`
        // thinking: true,
        // Example safety settings (strings accepted by new SDK):
        // safetySettings: [
        //   { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_ONLY_HIGH" }
        // ]
      },
      user!
    )
    console.log("Vertex AI Response:", response)
  } catch (error) {
    console.error("Error with chat completion:", error)
  }
}

/**
 * Test the streaming function.
 */
async function testVertexChatCompletionStream() {
  const user = await getUserByEmail("seb.grubb@gmail.com")

  const messages = [
    { role: "system", content: "You are a helpful assistant." },
    { role: "user", content: "Please tell me all the cool ways we can use AI to help us." }
  ]

  const systemPrompt = messages.find((m) => m.role === "system")?.content
  const userMessage = messages.find((m) => m.role === "user")?.content
  if (!userMessage) {
    console.error("No user message found.")
    return
  }

  try {
    for await (const chunk of vertexChatCompletionStream(
      {
        model: "gemini-2.5-flash",
        systemPrompt,
        userMessage,
        temperature: 0.1,
        max_tokens: 1024,
        response_format: "json_object",
        // thinking: 512, // Example: explicit thinking budget
        // responseSchema: { type: Type.OBJECT, properties: { ideas: { type: Type.ARRAY, items: { type: Type.STRING } } } }
      },
      user!
    )) {
      process.stdout.write(chunk)
    }
    process.stdout.write("\n")
  } catch (error) {
    console.error("Error with streaming chat completion:", error)
  }
}

// Uncomment to run tests
// testVertexChatCompletion()
// testVertexChatCompletionStream()