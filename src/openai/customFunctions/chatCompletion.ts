import OpenAI from "openai"
import { User } from "@prisma/client"
import { LogOpenAiUsage } from "../utils/openAiHelper"



const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
})

interface ChatCompletionOptions {
  model?: string
  max_tokens?: number
  temperature?: number
  messages: OpenAI.Chat.CreateChatCompletionRequestMessage[]
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
    const result = await openai.chat.completions.create({
      model,
      messages,
      max_tokens,
      temperature,
      functions,
      function_call
    })

    if (!result.choices[0].message) {
      throw new Error("No return error from chat")
    }
    if (result.data.usage) {
      // log usage
      await LogOpenAiUsage(user, result.data.usage, model)
    }

    return result.choices[0].message
  } catch (error) {
    console.log(error)
    throw error
  }
}


export interface ChatCompletionInstructOptions {
  model?: string;
  prompt: string;
  temperature?: number;
  max_tokens?: number;
  stop?: string;
  [key: string]: any;  // for other potential parameters
}

export function correctAndParseResponse(responseText: string): any {
  try {
      // Remove trailing commas from JSON-like strings
      const correctedResponse = responseText
          .replace(/,\s*}/g, '}')
          .replace(/,\s*\]/g, ']')
          .replace(/(?<!["'])\b(\w+)\b(?!["']):/g, '"$1":')
          .replace(/\bFalse\b/g, 'false')
          .replace(/\bTrue\b/g, 'true');
      
      return JSON.parse(correctedResponse);
  } catch (error) {
      console.error("Failed to correct and parse the response:", responseText, error);
      return null;
  }
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
  user: User
) {
  try {
    const result = await openai.completions.create({
      model,
      prompt,
      temperature,
      max_tokens,
      stop,
      ...options  // pass other options if any
    })

    if (!result.choices || result.choices.length === 0 || !result.choices[0].text) {
      throw new Error("No return data from instruction completion")
    }
    
    if (result.data.usage) {
      // log usage
      await LogOpenAiUsage(user, result.data.usage, model)
    }

    return result.choices[0];
  } catch (error) {
    console.log(error);
    throw error;
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
  user: User
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
    });

    for await (const chunk of stream) {
      if (chunk.choices && chunk.choices[0].text) {
        yield chunk.choices[0].text;
      }

      if (chunk.usage) {
        // log usage
        await LogOpenAiUsage(user, chunk.usage, model);
      }
    }
  } catch (error) {
    console.error(error);
    throw error;
  }
}