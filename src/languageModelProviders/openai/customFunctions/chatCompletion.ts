import OpenAI from "openai"
import { LogOpenAiUsage } from "../utils/openAiHelper"
import { ChatCompletionCreateParamsStreaming } from "openai/resources/chat"
import * as math from "mathjs"
import { Tables } from "types/supabase"
import { encode } from "gpt-tokenizer"
import { getPromptOutputFromCache, writePromptOutputToCache } from "@/languageModelProviders/promptCaching/redisPromptCache"

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
})

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
    model = "gpt-3.5-turbo-0613",
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

export interface ChatCompletionInstructOptions {
  model?: string
  prompt: string
  temperature?: number
  max_tokens?: number
  stop?: string
  [key: string]: any // for other potential parameters
}

function removeTrailingCommas(str: string) {
  let correctedResponse = str
  let previousString = ""
  while (correctedResponse !== previousString) {
    previousString = correctedResponse
    correctedResponse = correctedResponse.replace(/,\s*}/g, "}").replace(/,\s*\]/g, "]")
  }
  return correctedResponse
}
function correctMathExpressions(text: string): string {
  // Match mathematical expressions that end with a comma (after optional spaces)
  // Ensuring either enclosed by two quotation marks or without quotation marks.
  const mathExpressionPattern = /:\s*(?:(["])([\d\s\.\+\-\*\/]+)\1|([\d\s\.\+\-\*\/]+))\s*,/g

  return text.replace(mathExpressionPattern, (match, quote1, expressionWithQuote, expressionWithoutQuote) => {
    const expression = expressionWithQuote || expressionWithoutQuote

    try {
      const evaluatedValue = math.evaluate(expression)
      return `: ${evaluatedValue},`
    } catch (e) {
      // If mathjs fails to evaluate, return the original expression.
      return match
    }
  })
}

export function correctAndParseResponse(responseText: string): any {
  try {
    // Recursive removal of trailing commas until none are left
    let correctedResponse = removeTrailingCommas(responseText)

    // Replace keys without quotes to be with quotes
    correctedResponse = correctedResponse.replace(/(?<!["'])\b(\w+)\b(?!["']):/g, '"$1":')

    // Convert 'False' to 'false' and 'True' to 'true'
    correctedResponse = correctedResponse.replace(/\bFalse\b/g, "false").replace(/\bTrue\b/g, "true")

    // Replace fractions with their decimal representation
    correctedResponse = replaceFractionsWithDecimals(correctedResponse)

    // fix math expressions
    correctedResponse = correctMathExpressions(correctedResponse)

    // Ensure there's a comma at the end of a line if the next line is not a closing bracket
    correctedResponse = ensureCommaAtEndOfLine(correctedResponse)

    return JSON.parse(correctedResponse)
  } catch (error) {
    console.error("Failed to correct and parse the response:", responseText, error)
    return null
  }
}

function replaceFractionsWithDecimals(text: string): string {
  // Match the fraction pattern and possible guessed decimal value
  const fractionPattern = /(\b\d+)\s*\/\s*(\d+\b)(?:\s*=\s*([\d.]+))?/g

  return text.replace(fractionPattern, (match, numerator, denominator) => {
    const decimalValue = (Number(numerator) / Number(denominator)).toFixed(2) // Truncate to 3 significant figures
    return decimalValue.toString()
  })
}

function ensureCommaAtEndOfLine(text: string): string {
  const lines = text.split("\n")
  for (let i = 0; i < lines.length - 1; i++) {
    const line = lines[i].trim()
    const nextLine = lines[i + 1].trim()
    if (
      line &&
      !line.endsWith(",") &&
      !nextLine.startsWith("}") &&
      !nextLine.startsWith("]") &&
      !line.endsWith("{") &&
      !line.endsWith("[")
    ) {
      lines[i] = line + ","
    }
  }
  return lines.join("\n")
}

export async function chatCompletionInstruct(
  {
    model = "gpt-3.5-turbo-instruct",
    prompt,
    temperature = 0.5,
    max_tokens = 2048,
    stop,
    ...options
  }: ChatCompletionInstructOptions,
  user: Tables<"User">
) {
  try {
    const result = await openai.completions.create({
      model,
      prompt,
      temperature,
      max_tokens,
      stop,
      ...options // pass other options if any
    })

    if (!result.choices || result.choices.length === 0 || !result.choices[0].text) {
      throw new Error("No return data from instruction completion")
    }

    if (result.usage) {
      // log usage
      await LogOpenAiUsage(user, result.usage, model)
    }

    return result.choices[0]
  } catch (error) {
    console.log(error)
    throw error
  }
}

export async function* chatCompletionInstructStream(
  {
    model = "gpt-3.5-turbo-instruct",
    prompt,
    temperature = 0.5,
    max_tokens = 2048,
    stop,
    ...options
  }: ChatCompletionInstructOptions,
  user: Tables<"User">
): AsyncIterable<string> {
  try {
    const stream = await openai.completions.create({
      model,
      prompt,
      temperature,
      max_tokens,
      stop,
      stream: true,
      ...options
    })

    let accumulatedContent = ""

    for await (const chunk of stream) {
      accumulatedContent += chunk.choices[0].text

      while (true) {
        let startPos = accumulatedContent.indexOf("{")
        if (startPos === -1) {
          break // If we can't find a start brace, break and wait for more chunks
        }

        let balance = 0
        let endPos = -1
        for (let i = startPos; i < accumulatedContent.length; i++) {
          if (accumulatedContent[i] === "{") {
            balance++
          } else if (accumulatedContent[i] === "}") {
            balance--
          }

          if (balance === 0) {
            endPos = i
            break
          }
        }

        if (endPos === -1) {
          break // If we can't find a balanced closing brace, break and wait for more chunks
        }

        const potentialJsObject = accumulatedContent.substring(startPos, endPos + 1)
        const correctedJson = correctAndParseResponse(potentialJsObject)
        if (correctedJson) {
          yield correctedJson
        }
        accumulatedContent = accumulatedContent.substring(endPos + 1)
      }
    }
  } catch (error) {
    console.error(error)
    throw error
  }
}

export async function* chatCompletionFunctionStream(
  {
    model = "gpt-3.5-turbo-0613",
    messages,
    temperature = 0.5,
    max_tokens = 2048,
    stop,
    functions,
    function_call = "auto",
    ...options
  }: ChatCompletionOptions,
  user: Tables<"User">
): AsyncIterable<string> {
  try {
    const stream = await openai.chat.completions.create({
      model,
      messages: messages,
      temperature,
      max_tokens,
      functions,
      function_call,
      stream: true
    } as ChatCompletionCreateParamsStreaming)

    for await (const chunk of stream) {
      // Check if 'content' exists and yield it
      if (chunk?.choices[0]?.delta?.content) {
        yield chunk.choices[0].delta.content
      }
      // If 'content' doesn't exist, check for 'function_call.arguments' and yield that
      else if (chunk?.choices[0]?.delta?.function_call?.arguments) {
        yield chunk.choices[0].delta.function_call.arguments
      }
    }
  } catch (error) {
    console.error(error)
    throw error
  }
}

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
export async function* OpenAiChatCompletionJsonStream(user: Tables<"User">, options: ChatCompletionStreamOptions) {
  const {
    model = "gpt-3.5-turbo-1106",
    prompt,
    temperature = 0,
    max_tokens = 2048,
    stop,
    response_format = "json_object",
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
    const resultLength = cachedResult.length;
    let startIndex = 0;
    while (startIndex < resultLength) {
      const endIndex = Math.min(startIndex + 4, resultLength);
      const chunk = cachedResult.slice(startIndex, endIndex);
      yield chunk;
      startIndex += 4;
    }
    return;
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

  console.log("comppleted response", totalResponse)
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
    "openai",
    completionTimeMs
  )
}

export interface ChatCompletionVisionStreamOptions {
  model?: string
  messages: OpenAI.Chat.ChatCompletionMessageParam[]
  temperature?: number
  max_tokens?: number
  stop?: string
  [key: string]: any
}

export async function* OpenAiVisionChatStream(user: Tables<"User">, options: ChatCompletionVisionStreamOptions) {
  const {
    model = "gpt-4-vision-preview",
    prompt,
    messages,
    temperature = 0,
    max_tokens = 3096,
    stop,
    detail = "auto",
    ...otherParams
  } = options

  console.log("Model, Temperature, Detail", model, temperature, detail)
  const systemPrompt = "You are a helpful assistant."
  const startTime = performance.now()

  const stream = await openai.chat.completions.create({
    model,
    messages,
    temperature,
    max_tokens,
    stop,
    ...otherParams,
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

  const imageTokenCounts = messages.reduce((acc, message) => {
    // Check if the message's content is an array, indicating it might include text and/or images.
    if (Array.isArray(message.content)) {
      const tokensForImages = message.content.reduce((innerAcc, contentPart) => {
        // Check if the content part is an image by its type
        if (contentPart.type === "image_url") {
          // Safely cast the contentPart to ChatCompletionContentPartImage now that we've confirmed its type
          const imagePart = contentPart as OpenAI.Chat.ChatCompletionContentPartImage
          const imageDetail = imagePart.image_url.detail || "low" // Defaulting to low if detail is not specified

          // Accumulate tokens based on the detail level
          return innerAcc + (imageDetail === "high" ? 130 : 65)
        }
        return innerAcc
      }, 0)

      return acc + tokensForImages
    }
    return acc
  }, 0)

  const textTokenCount = messages.reduce((acc, message) => {
    // If the message content is a string, directly count its tokens.
    if (typeof message.content === "string") {
      return acc + new TextEncoder().encode(message.content).length
    }
    // If the message content is an array, filter for text parts and count their tokens.
    else if (Array.isArray(message.content)) {
      const textParts = message.content.filter(
        (part) => part.type === "text"
      ) as OpenAI.Chat.ChatCompletionContentPartText[]
      const textPartsTokenCount = textParts.reduce((innerAcc, part) => {
        return innerAcc + new TextEncoder().encode(part.text).length
      }, 0)
      return acc + textPartsTokenCount
    }
    return acc
  }, 0)
  const systemPromptTokenCount = new TextEncoder().encode(systemPrompt).length
  const promptTokens = textTokenCount + systemPromptTokenCount + imageTokenCounts

  const resultTokens = new TextEncoder().encode(totalResponse).length
  const totalTokens = resultTokens + promptTokens

  console.log("Logging performance", performance.now() - startTime, resultTokens, promptTokens, totalTokens)

  await LogOpenAiUsage(
    user,
    {
      total_tokens: totalTokens,
      prompt_tokens: promptTokens,
      completion_tokens: resultTokens
    },
    model,
    "openai",
    performance.now() - startTime
  )
  console.log("Logging performance done")
}
