import Anthropic from "@anthropic-ai/sdk"
import { LogOpenAiUsage } from "../openai/utils/openAiHelper"
import AnthropicBedrock from "@anthropic-ai/bedrock-sdk"
import { AnthropicVertex } from "@anthropic-ai/vertex-sdk"
import { Tables } from "types/supabase"
import {
  getPromptOutputFromCache,
  writePromptOutputToCache
} from "@/languageModelProviders/promptCaching/redisPromptCache"
import { CompletionUsage } from "openai/resources"
import { getUserByEmail } from "@/foodMessageProcessing/common/debugHelper"
import { TextBlock } from "@anthropic-ai/sdk/resources"
import { GoogleAuth } from "google-auth-library"
import { Message, MessageCreateParamsBase } from "@anthropic-ai/sdk/resources/messages"
import { Stream } from "@anthropic-ai/sdk/streaming"

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY
})

const anthropicBedrockClient = new AnthropicBedrock({
  awsAccessKey: process.env.AWS_BEDROCK_ACCESS_KEY_ID,
  awsSecretKey: process.env.AWS_SECRET_ACCESS_KEY,
  awsRegion: "us-east-1"
})

const modelMappings: Record<string, Record<string, string>> = {
  anthropic: {
    "claude-3-opus": "claude-3-opus-20240229",
    "claude-3-sonnet": "claude-3-sonnet-20240229",
    "claude-3-haiku": "claude-3-haiku-20240307"
  },
  bedrock: {
    "claude-3-opus": "", // Placeholder for future mapping
    "claude-3-sonnet": "anthropic.claude-3-sonnet-20240229-v1:0",
    "claude-3-haiku": "anthropic.claude-3-haiku-20240307-v1:0"
  },
  vertex: {
    "claude-3-opus": "", // Placeholder for future mapping
    "claude-3-sonnet": "claude-3-sonnet@20240229",
    "claude-3-haiku": "claude-3-haiku@20240307"
  }
}

function containsNoImages(messages: Anthropic.Messages.MessageParam[]): boolean {
  return messages.every((message) => {
    if (typeof message.content === "string") {
      // It's a string, so no images here
      return true
    } else {
      // It's an array, so look for image blocks
      return message.content.every((content) => {
        if (typeof content === "object" && content.type === "image") {
          // Found an image
          return false
        }
        return true
      })
    }
  })
}
class RateLimitError extends Error {
  constructor(message: any) {
    super(message);
    this.name = "RateLimitError";
  }
}


export async function* claudeChatCompletionStream(
  {
    messages,
    system = "",
    model = "claude-3-sonnet",
    temperature = 0.1,
    max_tokens = 1024,
    provider = "anthropic",
    ...options
  }: MessageCreateParamsBase & { provider?: "anthropic" | "bedrock" | "vertex" },
  user: Tables<"User">
): AsyncGenerator<string, void, unknown> {
  const modelMappings: Record<string, Record<string, string>> = {
    anthropic: {
      "claude-3-opus": "claude-3-opus-20240229",
      "claude-3-sonnet": "claude-3-sonnet-20240229",
      "claude-3-haiku": "claude-3-haiku-20240307"
    },
    bedrock: {
      "claude-3-opus": "", // Placeholder for future mapping
      "claude-3-sonnet": "anthropic.claude-3-sonnet-20240229-v1:0",
      "claude-3-haiku": "anthropic.claude-3-haiku-20240307-v1:0"
    },
    vertex: {
      "claude-3-opus": "", // Placeholder for future mapping
      "claude-3-sonnet": "claude-3-sonnet@20240229",
      "claude-3-haiku": "claude-3-haiku@20240307"
    }
  }

  const mappedModel = modelMappings[provider][model]
  if (mappedModel === "") {
    throw new Error(`Model ${model} is not currently supported by provider ${provider}`)
  }

  switch (provider) {
    case "anthropic":
      yield* anthropicChatCompletionStream({ ...options, model: mappedModel, messages, max_tokens }, user)
      break
    case "bedrock":
      yield* anthropicBedrockChatCompletionStream({ ...options, model: mappedModel, messages, max_tokens }, user)
      break
    case "vertex":
      yield* anthropicVertexChatCompletionStream({ ...options, model: mappedModel, messages, max_tokens }, user)
      break
    default:
      throw new Error(`Invalid provider: ${provider}`)
  }
}

interface VertexApiError {
  status: number;
  error: {
    error: {
      code: number;
      message: string;
      status: string;
    };
  };
}

interface AnthropicsApiError {
  code: number;
  message: string;
}

interface BedrockApiError {
  status: number;
  message: string;
  errorType: string;
}

type ApiError = VertexApiError | AnthropicsApiError | BedrockApiError;

function isVertexApiError(error: any): error is VertexApiError {
  return error.status !== undefined && error.error?.error?.code !== undefined;
}

function isAnthropicsApiError(error: any): error is AnthropicsApiError {
  return typeof error.code === 'number' && typeof error.message === 'string';
}

function isBedrockApiError(error: any): error is BedrockApiError {
  return error.status !== undefined && typeof error.message === 'string' && typeof error.errorType === 'string';
}

export async function claudeChatCompletion(
  {
    messages,
    system = "",
    model = "claude-3-sonnet",
    temperature = 0.1,
    max_tokens = 1024,
    provider = "anthropic",
    ...options
  }: MessageCreateParamsBase & { provider?: "anthropic" | "bedrock" | "vertex" },
  user: Tables<"User">
): Promise<string> {
  const providers = [provider, ...Object.keys(modelMappings).filter((p) => p !== provider)] as const

  for (const p of providers) {
    const mappedModel = modelMappings[p][model]

    if (mappedModel === "") {
      throw new Error(`Model ${model} is not currently supported by provider ${p}`)
    }

    try {
      switch (p) {
        case "anthropic":
          return await anthropicChatCompletion({ ...options, model: mappedModel, messages, max_tokens }, user)
        case "bedrock":
          return await anthropicBedrockChatCompletion({ ...options, model: mappedModel, messages, max_tokens }, user)
        case "vertex":
          return await anthropicVertexChatCompletion({ ...options, model: mappedModel, messages, max_tokens }, user)
      }
    } catch (error) {
      console.error(`Error with provider ${p}:`, error);

      if (isVertexApiError(error) && error.error.error.code === 429) {
        console.warn(`Rate limit exceeded on ${p} (Vertex). Trying next provider.`);
        continue;
      }

      if (isAnthropicsApiError(error) && error.code === 429) {
        console.warn(`Rate limit exceeded on ${p} (Anthropic). Trying next provider.`);
        continue;
      }

      if (isBedrockApiError(error) && error.status === 429) {
        console.warn(`Rate limit exceeded on ${p} (Bedrock). Trying next provider.`);
        continue;
      }

      // If it’s not a recognized rate limit error or if it's the last provider
      throw error;
    }
  }

  throw new Error("All providers failed")
}

async function anthropicChatCompletion(
  {
    messages,
    system = "",
    model = "claude-3-sonnet-20240229",
    temperature = 0.1,
    max_tokens = 1024,
    ...options
  }: MessageCreateParamsBase,
  user: Tables<"User">
): Promise<string> {
  const { stream } = options
  if (stream) {
    throw new Error("use the streaming function instead to use stream")
  }
  // Extract the first user message
  let userMessage = JSON.stringify(messages)
  if (typeof system === "string" && containsNoImages(messages)) {
    const cachedResponse = await getPromptOutputFromCache({
      systemPrompt: system,
      userMessage,
      modelName: model,
      temperature,
      max_tokens,
      ...options
    })
    if (cachedResponse) {
      return cachedResponse
    }
  }
  let startTime = performance.now()
  try {
    const result = await anthropic.messages.create({
      model,
      max_tokens,
      temperature,
      system,
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

    if (typeof system === "string" && typeof userMessage === "string" && result.content[0].text !== null) {
      await writePromptOutputToCache(
        {
          systemPrompt: system,
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

async function anthropicBedrockChatCompletion(
  {
    messages,
    system = "",
    model = "anthropic.claude-3-sonnet-20240229-v1:0",
    temperature = 0.1,
    max_tokens = 1024,
    ...options
  }: MessageCreateParamsBase,
  user: Tables<"User">
): Promise<string> {
  const { stream } = options
  if (stream) {
    throw new Error("use the streaming function instead to use stream")
  }

  // Extract the first user message
  let userMessage = JSON.stringify(messages)
  if (typeof system === "string" && containsNoImages(messages)) {
    const cachedResponse = await getPromptOutputFromCache({
      systemPrompt: system,
      userMessage,
      modelName: model,
      temperature,
      max_tokens,
      ...options
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
      system,
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

    if (typeof system === "string" && typeof userMessage === "string" && result.content[0].text !== null) {
      await writePromptOutputToCache(
        {
          systemPrompt: system,
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

const auth = new GoogleAuth({
  credentials: {
    type: "service_account",
    project_id: process.env.VERTEX_PROJECT_ID,
    private_key_id: "2b6e9005c98a742a9918cbe2ec0b565c9e08e850",
    private_key: process.env.VERTEX_PRIVATE_KEY,
    client_email: "600835149314-compute@developer.gserviceaccount.com",
    client_id: "110552480798994034869",
    universe_domain: "googleapis.com"
  },
  scopes: "https://www.googleapis.com/auth/cloud-platform"
})

const vertexAiClient = new AnthropicVertex({
  projectId: process.env.VERTEX_PROJECT_ID,
  region: "us-central1",
  accessToken: process.env.ANTHROPIC_VERTEX_API_KEY,
  googleAuth: auth
})

async function anthropicVertexChatCompletion(
  {
    messages,
    system = "",
    model = "claude-3-haiku@20240307",
    temperature = 0.1,
    max_tokens = 1024,
    ...options
  }: MessageCreateParamsBase,
  user: Tables<"User">
): Promise<string> {
  const { stream } = options
  if (stream) {
    throw new Error("use the streaming function instead to use stream")
  }
  let userMessage = JSON.stringify(messages)
  if (typeof system === "string" && containsNoImages(messages)) {
    const cachedResponse = await getPromptOutputFromCache({
      systemPrompt: system,
      userMessage,
      modelName: model!,
      temperature,
      max_tokens
    })
    if (cachedResponse) {
      return cachedResponse
    }
  }
  let startTime = performance.now()
  try {
    const result = await vertexAiClient.messages.create({
      model,
      max_tokens,
      temperature,
      messages: messages.map((message) => ({
        role: message.role,
        content:
          typeof message.content === "string"
            ? message.content
            : message.content
                .filter((content): content is TextBlock => "text" in content)
                .map((content) => ({ type: "text", text: content.text }))
      })),
      ...options
    })

    if (result instanceof Stream) {
      throw new Error("Streaming is not supported in this function")
    }
    const message = result as Message

    if (!message.content[0].text) {
      throw new Error("No return error from chat")
    }

    if (message.usage) {
      let completionTimeMs = performance.now() - startTime
      const tokenCompletionUsage: CompletionUsage = {
        prompt_tokens: message.usage.input_tokens,
        completion_tokens: message.usage.output_tokens,
        total_tokens: message.usage.input_tokens + message.usage.output_tokens
      }

      await LogOpenAiUsage(user, tokenCompletionUsage, model, "vertexAi", completionTimeMs)
    }

    if (typeof system === "string" && typeof userMessage === "string" && message.content[0].text !== null) {
      await writePromptOutputToCache(
        {
          systemPrompt: system,
          userMessage,
          modelName: model,
          temperature,
          max_tokens
        },
        message.content[0].text
      )
    } else {
      console.log("Either systemPrompt or userMessage is not a string.")
    }

    return message.content[0].text
  } catch (error) {
    console.log(`Error with Vertex AI API:`, error)
    throw error
  }
}

async function* anthropicChatCompletionStream(
  {
    messages,
    system = "",
    model = "claude-3-sonnet-20240229",
    temperature = 0.1,
    max_tokens = 1024,
    ...options
  }: MessageCreateParamsBase,
  user: Tables<"User">
): AsyncGenerator<string, void, unknown> {
  try {
    const stream = await anthropic.messages.stream({
      model,
      max_tokens,
      temperature,
      system,
      messages: messages
    })

    for await (const event of stream) {
      if (event.type === "content_block_delta") {
        const delta = event.delta
        if (delta.type === "text_delta") {
          yield delta.text
        }
      }
    }
  } catch (error) {
    console.log(error)
    throw error
  }
}

export async function* anthropicBedrockChatCompletionStream(
  {
    messages,
    system = "",
    model = "anthropic.claude-3-sonnet-20240229-v1:0",
    temperature = 0.1,
    max_tokens = 1024,
    ...options
  }: MessageCreateParamsBase,
  user: Tables<"User">
): AsyncGenerator<string, void, unknown> {
  try {
    const stream = await anthropicBedrockClient.messages.stream({
      model,
      max_tokens,
      temperature,
      system,
      messages: messages
    })

    for await (const event of stream) {
      if (event.type === "content_block_delta") {
        const delta = event.delta
        if (delta.type === "text_delta") {
          yield delta.text
        }
      }
    }
  } catch (error) {
    console.log(error)
    throw error
  }
}

async function* anthropicVertexChatCompletionStream(
  {
    messages,
    system = "",
    model = "claude-3-haiku@20240307",
    temperature = 0.1,
    max_tokens = 1024,
    ...options
  }: MessageCreateParamsBase,
  user: Tables<"User">
): AsyncGenerator<string, void, unknown> {
  try {
    const stream = await vertexAiClient.messages.stream({
      model,
      max_tokens,
      temperature,
      messages: messages.map((message) => ({
        role: message.role,
        content:
          typeof message.content === "string"
            ? message.content
            : message.content
                .filter((content): content is TextBlock => "text" in content)
                .map((content) => ({ type: "text", text: content.text }))
      })),
      ...options
    })

    for await (const event of stream as AsyncIterable<any>) {
      if (event.type === "content_block_delta") {
        const delta = event.delta
        if (delta.type === "text_delta") {
          yield delta.text
        }
      }
    }
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
      content: "Please count to 10 and return the result in JSON format with the keys 'count' and 'numbers'."
    },
    {
      role: "assistant",
      content: `{`
    }
  ] as Anthropic.Messages.MessageParam[]

  const systemPrompt = "You are a helpful assistant that only replies in valid JSON."

  // Test anthropic chat completion
  try {
    const anthropicResult = await claudeChatCompletion(
      {
        messages,
        system: systemPrompt,
        model: "claude-3-haiku",
        provider: "anthropic",
        max_tokens: 1024
      },
      user!
    )
    console.log("Anthropic result:", anthropicResult)
  } catch (error) {
    console.error("Error with Anthropic chat completion:", error)
  }

  // Test bedrock chat completion
  try {
    const bedrockResult = await claudeChatCompletion(
      {
        messages,
        system: systemPrompt,
        model: "claude-3-haiku",
        provider: "bedrock",
        max_tokens: 1024
      },
      user!
    )
    console.log("Bedrock result:", bedrockResult)
  } catch (error) {
    console.error("Error with Bedrock chat completion:", error)
  }

  // Test vertex chat completion
  try {
    const vertexResult = await claudeChatCompletion(
      {
        messages,
        system: systemPrompt,
        model: "claude-3-haiku",
        provider: "vertex",
        max_tokens: 1024
      },
      user!
    )
    console.log("Vertex result:", vertexResult)
  } catch (error) {
    console.error("Error with Vertex chat completion:", error)
  }
}
async function test2() {
  const user = await getUserByEmail("seb.grubb@gmail.com")

  const messages = [
    {
      role: "user",
      content: "Please count to 10 and return the result in JSON format with the keys 'count' and 'numbers'."
    },
    {
      role: "assistant",
      content: `{`
    }
  ] as Anthropic.Messages.MessageParam[]

  const systemPrompt = "You are a helpful assistant that only replies in valid JSON."

  // Test anthropic chat completion stream
  try {
    process.stdout.write("Anthropic stream: ")
    for await (const chunk of claudeChatCompletionStream(
      {
        messages,
        system: systemPrompt,
        model: "claude-3-haiku",
        provider: "anthropic",
        max_tokens: 1024
      },
      user!
    )) {
      process.stdout.write(chunk)
    }
    process.stdout.write("\n")
  } catch (error) {
    console.error("Error with Anthropic chat completion stream:", error)
  }

  // Test bedrock chat completion stream
  try {
    process.stdout.write("Bedrock stream: ")
    for await (const chunk of claudeChatCompletionStream(
      {
        messages,
        system: systemPrompt,
        model: "claude-3-haiku",
        provider: "bedrock",
        max_tokens: 1024
      },
      user!
    )) {
      process.stdout.write(chunk)
    }
    process.stdout.write("\n")
  } catch (error) {
    console.error("Error with Bedrock chat completion stream:", error)
  }

  // Test vertex chat completion stream
  try {
    process.stdout.write("Vertex stream: ")
    for await (const chunk of claudeChatCompletionStream(
      {
        messages,
        system: systemPrompt,
        model: "claude-3-haiku",
        provider: "vertex",
        max_tokens: 1024
      },
      user!
    )) {
      process.stdout.write(chunk)
    }
    process.stdout.write("\n")
  } catch (error) {
    console.error("Error with Vertex chat completion stream:", error)
  }
}

// test2()
