import Redis from "ioredis";
import crypto from "crypto";

// Ensure that you have PROMPT_CACHE_REDIS_URL defined in your .env file or environment
const redisUrl = process.env.PROMPT_CACHE_REDIS_URL;
const ONE_MONTH_SECONDS = 60 * 60 * 24 * 30;

if (!redisUrl) {
  throw new Error("PROMPT_CACHE_REDIS_URL is not defined in your environment.");
}

const redis = new Redis(redisUrl);

function generateCompositeKey({
  systemPrompt,
  userMessage,
  modelName,
  temperature,
  max_tokens,
  response_format = "text",
  stop,
  stop_sequences,
  options
}: {
  systemPrompt: string;
  userMessage: string;
  modelName: string;
  temperature: number;
  max_tokens: number;
  response_format?: string;
  stop?: string;
  stop_sequences?: string[];
  options?: Record<string, any>;
}) {
  const combinedInput = systemPrompt + userMessage;
  const hash = crypto.createHash("sha256").update(combinedInput).digest("hex");
  const optionsString = options ? JSON.stringify(options) : "";
  return `prompt:${hash}:${modelName}:${temperature}:${max_tokens}:${response_format}:${stop || ""}:${stop_sequences?.join(",") || ""}:${optionsString}`;
}

async function writePromptOutputToCache(
  {
    systemPrompt,
    userMessage,
    modelName,
    temperature,
    max_tokens,
    response_format = "text",
    stop_sequences = [],
    options = {}
  }: {
    systemPrompt: string;
    userMessage: string;
    modelName: string;
    temperature: number;
    max_tokens: number;
    response_format?: string;
    stop_sequences?: string[];
    options?: Record<string, any>;
  },
  promptOutput: string
) {
  const compositeKey = generateCompositeKey({
    systemPrompt,
    userMessage,
    modelName,
    temperature,
    max_tokens,
    response_format,
    stop_sequences,
    options
  });

  try {
    await redis.set(compositeKey, promptOutput, "EX", ONE_MONTH_SECONDS);
    console.log(`Data for ${compositeKey} saved successfully.`);
  } catch (error) {
    console.error("Error saving data to Redis:", error);
  }
  return;
}

async function getPromptOutputFromCache(
  {
    systemPrompt,
    userMessage,
    modelName,
    temperature,
    max_tokens,
    response_format = "text",
    stop_sequences = [],
    options = {}
  }: {
    systemPrompt: string;
    userMessage: string;
    modelName: string;
    temperature: number;
    max_tokens: number;
    response_format?: string;
    stop_sequences?: string[];
    options?: Record<string, any>;
  }
) {
  const compositeKey = generateCompositeKey({
    systemPrompt,
    userMessage,
    modelName,
    temperature,
    max_tokens,
    response_format,
    stop_sequences,
    options
  });

  try {
    const promptOutput = await redis.get(compositeKey);
    if (promptOutput !== null) {
      console.log(`Data retrieved for ${compositeKey}`);
      return promptOutput;
    } else {
      return null;
    }
  } catch (error) {
    console.error('Error retrieving data from Redis:', error);
    return null;
  }
}

export { writePromptOutputToCache, getPromptOutputFromCache, redis };