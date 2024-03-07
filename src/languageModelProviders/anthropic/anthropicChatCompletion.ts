import Anthropic from "@anthropic-ai/sdk"
import { LogOpenAiUsage } from "../openai/utils/openAiHelper"
import AnthropicBedrock from "@anthropic-ai/bedrock-sdk"

import { Tables } from "types/supabase"
import {
  getPromptOutputFromCache,
  writePromptOutputToCache
} from "@/languageModelProviders/promptCaching/redisPromptCache"
import { CompletionUsage } from "openai/resources"
import { getUserByEmail } from "@/foodMessageProcessing/common/debugHelper"

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY
})

const anthropicBedrockClient = new AnthropicBedrock({
  awsAccessKey: process.env.AWS_BEDROCK_ACCESS_KEY_ID,
  awsSecretKey: process.env.AWS_SECRET_ACCESS_KEY,
  awsRegion: "us-east-1"
})

function containsNoImages(messages: Anthropic.Messages.MessageParam[]): boolean {
	return messages.every(message => {
	  if (typeof message.content === 'string') {
		// It's a string, so no images here
		return true;
	  } else {
		// It's an array, so look for image blocks
		return message.content.every(content => {
		  if (typeof content === 'object' && content.type === 'image') {
			// Found an image
			return false;
		  }
		  return true;
		});
	  }
	});
  }

interface ChatCompletionOptions {
  model?: string
  max_tokens?: number
  temperature?: number
  messages: Anthropic.Messages.MessageParam[]
  systemPrompt?: string
  stop?: string
}

export async function anthropicChatCompletion(
  {
    messages,
    systemPrompt = "",
    model = "claude-3-sonnet-20240229",
    temperature = 0.1,
    max_tokens = 1024,
    ...options
  }: ChatCompletionOptions,
  user: Tables<"User">
): Promise<string> {
  // Extract the first user message
  let userMessage = JSON.stringify(messages)
  if (typeof systemPrompt === "string" && containsNoImages(messages)) {
    const cachedResponse = await getPromptOutputFromCache({
      systemPrompt,
      userMessage,
      modelName: model,
      temperature,
      max_tokens
    })
    if (cachedResponse) {
      cachedResponse
    }
  }
  let startTime = performance.now()
  try {
    const result = await anthropic.messages.create({
      model,
      max_tokens,
      temperature,
      system: systemPrompt,
      messages: messages
    })

    if (!result.content[0].text) {
      throw new Error("No return error from chat")
    }

    if (result.usage) {
      // log usage
      let completionTimeMs = performance.now() - startTime
      const tokenCompletionUsage: CompletionUsage = {
        prompt_tokens: result.usage.input_tokens,
        completion_tokens: result.usage.output_tokens,
        total_tokens: result.usage.input_tokens + result.usage.output_tokens
      }

      await LogOpenAiUsage(user, tokenCompletionUsage, model, "anthropic", completionTimeMs)
    }

    if (typeof systemPrompt === "string" && typeof userMessage === "string" && result.content[0].text !== null) {
      await writePromptOutputToCache(
        {
          systemPrompt,
          userMessage,
          modelName: model,
          temperature,
          max_tokens
        },
        result.content[0].text
      )
    } else {
      // Handle the case where systemPrompt or userMessage are not strings
      console.log("Either systemPrompt or userMessage is not a string.")
    }

    return result.content[0].text
  } catch (error) {
    console.log(error)
    throw error
  }
}

export async function anthropicBedrockChatCompletion(
  {
    messages,
    systemPrompt = "",
    model = "anthropic.claude-3-sonnet-20240229-v1:0",
    temperature = 0.1,
    max_tokens = 1024,
    ...options
  }: ChatCompletionOptions,
  user: Tables<"User">
):  Promise<string> {
  // Extract the first user message
  let userMessage = JSON.stringify(messages)
  if (typeof systemPrompt === "string" && containsNoImages(messages)) {
    const cachedResponse = await getPromptOutputFromCache({
      systemPrompt,
      userMessage,
      modelName: model,
      temperature,
      max_tokens
    })
    if (cachedResponse) {
      return cachedResponse
    }
  }
  let startTime = performance.now()
  try {
    const result = await anthropicBedrockClient.messages.create({
      model,
      max_tokens,
      temperature,
      system: systemPrompt,
      messages: messages
    })

    if (!result.content[0].text) {
      throw new Error("No return error from chat")
    }

    if (result.usage) {
      // log usage
      let completionTimeMs = performance.now() - startTime
      const tokenCompletionUsage: CompletionUsage = {
        prompt_tokens: result.usage.input_tokens,
        completion_tokens: result.usage.output_tokens,
        total_tokens: result.usage.input_tokens + result.usage.output_tokens
      }

      await LogOpenAiUsage(user, tokenCompletionUsage, model, "anthropic", completionTimeMs)
    }

    if (typeof systemPrompt === "string" && typeof userMessage === "string" && result.content[0].text !== null) {
      await writePromptOutputToCache(
        {
          systemPrompt,
          userMessage,
          modelName: model,
          temperature,
          max_tokens
        },
        result.content[0].text
      )
    } else {
      // Handle the case where systemPrompt or userMessage are not strings
      console.log("Either systemPrompt or userMessage is not a string.")
    }

    return result.content[0].text
  } catch (error) {
    console.log(error)
    throw error
  }
}

async function test() {
  const user = await getUserByEmail("seb.grubb@gmail.com")
  const messages = [
    {
      role: "user",
      content: [
        {
          type: "text",
          text: `Count to 10 for me.`
        }
      ]
    }
  ] as Anthropic.Messages.MessageParam[]
  const systemPrompt = "You are a helpful assistant that only replies in valid JSON."
  const result = await anthropicBedrockChatCompletion({ messages, systemPrompt }, user!)
  console.log(result)
}

// test()
