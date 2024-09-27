import { createAdminSupabase } from "@/utils/supabase/serverAdmin"
import { Tables } from "types/supabase"
import {
  OpenAiChatCompletionJsonStream,
  ChatCompletionStreamOptions
} from "@/languageModelProviders/openai/customFunctions/chatCompletion"
import { FireworksChatCompletionStream } from "@/languageModelProviders/fireworks/chatCompletionFireworks"
import { FoodItemToLog, LoggedFoodServing } from "../../utils/loggedFoodItemInterface"
import { AddLoggedFoodItemToQueue } from "../addLogFoodItemToQueue"
import { logFoodItemPrompts } from "./logFoodItemPrompts"
import { getUserByEmail } from "../common/debugHelper"
import { claudeChatCompletionStream } from "@/languageModelProviders/anthropic/anthropicChatCompletion"
import { vertexChatCompletionStream } from "@/languageModelProviders/vertex/chatCompletionVertex"
import { sanitizeFoodItemNutritionFieldsJSON } from "../common/sanitizeNutrients"

function mapToFoodItemToLog(outputItem: any): FoodItemToLog {
  // Since serving is no longer available in the output, we need to handle its absence
  let serving: LoggedFoodServing | undefined
  // if (outputItem.serving) {
  //   serving = {
  //     serving_amount: outputItem.serving.serving_amount,
  //     serving_name: outputItem.serving.serving_name,
  //     total_serving_g_or_ml: outputItem.serving.total_serving_size_g_or_ml,
  //     serving_g_or_ml: outputItem.serving.g_or_ml
  //   }
  // }

  return {
    food_database_search_name: outputItem.full_single_food_database_search_name,
    full_item_user_message_including_serving: outputItem.full_single_item_user_message_including_serving_or_quantity,
    brand: outputItem.brand || "",
    branded: outputItem.branded || false,
    serving: serving || undefined
  }
}

async function* processStreamedLoggedFoodItems(user: Tables<"User">, options: ChatCompletionStreamOptions) {
  // Call ChatCompletionJsonStream to get the stream
  const stream = await OpenAiChatCompletionJsonStream(user, options)

  let buffer = "" // Buffer to accumulate chunks of data
  let lastProcessedIndex = -1 // Track the last processed index

  for await (const chunk of stream) {
    buffer += chunk // Append the new chunk to the buffer
    const { jsonObj, endIndex } = extractLatestValidJSON(buffer)

    if (jsonObj && endIndex !== lastProcessedIndex) {
      // console.log(jsonObj); // Output the new JSON object
      lastProcessedIndex = endIndex // Update the last processed index
      yield jsonObj // Yield the new JSON object
    }
  }
}

async function* processStreamedLoggedFoodItemsVertex(user: Tables<"User">, options: ChatCompletionStreamOptions) {
  const stream = vertexChatCompletionStream(
    {
      model: "gemini-1.5-flash-002",
      systemPrompt: options.systemPrompt || "You are a helpful assistant that only replies with valid JSON.",
      userMessage: options.prompt,
      temperature: 0.1,
      max_tokens: options.max_tokens || 1024,
      response_format: "json_object"
    },
    user
  )

  let buffer = "" // Buffer to accumulate chunks of data
  let lastProcessedIndex = -1 // Track the last processed index

  for await (const chunk of stream) {
    buffer += chunk // Append the new chunk to the buffer
    const { jsonObj, endIndex } = extractLatestValidJSON(buffer)

    if (jsonObj && endIndex !== lastProcessedIndex) {
      lastProcessedIndex = endIndex // Update the last processed index
      yield jsonObj // Yield the new JSON object
    }
  }
}

async function* processStreamedLoggedFoodItemsMixtral(user: Tables<"User">, options: ChatCompletionStreamOptions) {
  //   console.log("calling mixtral with options", options)
  // Call ChatCompletionJsonStream to get the stream
  const stream = await FireworksChatCompletionStream(
    user,
    {
      model: "accounts/fireworks/models/mixtral-8x7b-instruct",
      systemPrompt: "You are a helpful assistant that only replies with valid JSON.",
      prompt: options.prompt
    }
  )

  let buffer = "" // Buffer to accumulate chunks of data
  let lastProcessedIndex = -1 // Track the last processed index

  for await (const chunk of stream) {
    // console.log(chunk)
    process.stdout.write(chunk.toString())
    buffer += chunk // Append the new chunk to the buffer
    const { jsonObj, endIndex } = extractLatestValidJSON(buffer)

    if (jsonObj && endIndex !== lastProcessedIndex) {
      // console.log(jsonObj); // Output the new JSON object
      lastProcessedIndex = endIndex // Update the last processed index
      yield jsonObj // Yield the new JSON object
    }
  }
}

async function* processStreamedLoggedFoodItemsClaude(user: Tables<"User">, options: ChatCompletionStreamOptions) {
  const stream = claudeChatCompletionStream(
    {
      messages: [
        {
          role: "user",
          content: options.prompt
        },
        { role: "assistant", content: "{" }
      ],
      model: "claude-3-haiku",
      temperature: 0,
      max_tokens: 4096,
      system: logFoodItemPrompts['claude-3-haiku'].systemPrompt
    },
    user
  );

  let buffer = "{" // Buffer to accumulate chunks of data
  let lastProcessedIndex = -1 // Track the last processed index

  for await (const chunk of stream) {
    // process.stdout.write(chunk);
    buffer += chunk; // Append the new chunk to the buffer
    const { jsonObj, endIndex } = extractLatestValidJSON(buffer);

    if (jsonObj && endIndex !== lastProcessedIndex) {
      lastProcessedIndex = endIndex; // Update the last processed index
      yield jsonObj; // Yield the new JSON object
    }
  }
}

async function* processStreamedLoggedFoodItemsLlama(user: Tables<"User">, options: ChatCompletionStreamOptions) {
  //   console.log("calling mixtral with options", options)
  // Call ChatCompletionJsonStream to get the stream
  const stream = await FireworksChatCompletionStream(
    user,
    {
      model: options.model,
      systemPrompt: logFoodItemPrompts['llama3-70b'].systemPrompt,
      prompt: options.prompt
    }
  )

  let buffer = "" // Buffer to accumulate chunks of data
  let lastProcessedIndex = -1 // Track the last processed index

  // let i = 0;

  for await (const chunk of stream) {
    // console.log("chunk #", i, chunk)
    // i++;
    // process.stdout.write(chunk.toString())
    buffer += chunk // Append the new chunk to the buffer
    const { jsonObj, endIndex } = extractLatestValidJSON(buffer)

    if (jsonObj && endIndex !== lastProcessedIndex) {
      // console.log(jsonObj); // Output the new JSON object
      lastProcessedIndex = endIndex // Update the last processed index
      yield jsonObj // Yield the new JSON object
    }
  }
}

function extractLatestValidJSON(inputString: string) {
  let braceCount = 0
  let endIndex = -1

  // Start from the end of the string and look for the first closing brace
  for (let i = inputString.length - 1; i >= 0; i--) {
    if (inputString[i] === "}") {
      if (braceCount === 0) {
        // This is the end of the latest JSON object
        endIndex = i
      }
      braceCount++
    } else if (inputString[i] === "{") {
      braceCount--
      if (braceCount === 0) {
        // Found the start of the latest JSON object
        const jsonStr = inputString.substring(i, endIndex + 1)
        try {
          const jsonObj = JSON.parse(jsonStr)
          return { jsonObj, endIndex } // Return both the object and the end index
        } catch (e) {
          console.error("Failed to parse JSON:", e)
          return { jsonObj: null, endIndex: -1 }
        }
      }
    }
  }

  return { jsonObj: null, endIndex: -1 } // Return null if no well-formed JSON object is found
}

export async function logFoodItemStream(
  user: Tables<"User">,
  user_message: Tables<"Message">,
  consumedOn: Date = new Date()
): Promise<{ foodItemsToLog: FoodItemToLog[]; isBadFoodLogRequest: boolean }> {
  const foodItemsToLog: FoodItemToLog[] = []
  let isBadFoodLogRequest = false
  // Add logging task to the tasks array
  const loggingTasks: Promise<any>[] = []
  const currentDateTime = new Date()

  // Change the model to GPT-4o mini
  let model = "gpt-4o-mini"

  // Use the OpenAI stream processing function
  const stream = processStreamedLoggedFoodItemsVertex(user, {
    prompt: logFoodItemPrompts['gpt-4o-mini'].prompt.replace("INPUT_HERE", user_message.content),
    systemPrompt: logFoodItemPrompts['gpt-4o-mini'].systemPrompt,
    temperature: 0,
    model: model,
    max_tokens: 4096
  })


  console.log("user_message", user_message.content)

  // llama
  // let model = 'accounts/fireworks/models/llama-v3-70b-instruct'
  // const stream = processStreamedLoggedFoodItemsLlama(user, {
  //   prompt: logFoodItemPrompts['llama3-70b'].prompt.replace("INPUT_HERE", user_message.content),
  //   systemPrompt: logFoodItemPrompts['llama3-70b'].systemPrompt,
  //   temperature: 0,
  //   model: model
  // })
  // claude
  // let model = 'claude-3-haiku'
  // const stream = processStreamedLoggedFoodItemsClaude(user, {
  //   prompt: logFoodItemPrompts['claude-3-haiku'].prompt.replace("INPUT_HERE", user_message.content),
  //   systemPrompt: logFoodItemPrompts['claude-3-haiku'].systemPrompt,
  //   temperature: 0,
  //   model: model
  // })


  for await (const chunk of stream) {
    // console.log("chunk #", i, chunk)
    // i++;

    if (chunk.hasOwnProperty("full_single_food_database_search_name")) {
      const elapsedTime = new Date().getTime() - currentDateTime.getTime()
      // It's a single food item
      const sanitizedFoodItem = sanitizeFoodItemNutritionFieldsJSON(chunk)
      const foodItemToLog = {
        food_database_search_name: chunk.full_single_food_database_search_name,
        full_item_user_message_including_serving: chunk.full_single_item_user_message_including_serving_or_quantity,
        branded: sanitizedFoodItem.branded,
        brand: sanitizedFoodItem.brand || "",
        timeEaten: new Date(consumedOn.getTime() + elapsedTime).toISOString(),
        nutritional_information: sanitizedFoodItem.nutritional_information
      } as FoodItemToLog
      foodItemsToLog.push(foodItemToLog)
      console.log("just logged: ", foodItemToLog)
      const loggingTask = AddLoggedFoodItemToQueue(user, user_message, foodItemToLog, foodItemsToLog.length - 1)
      loggingTasks.push(loggingTask)
    } else if (chunk.hasOwnProperty("contains_valid_food_items")) {
      console.log(chunk.contains_valid_food_items)
      isBadFoodLogRequest = !chunk.contains_valid_food_items
    }
  }
  // Await for all tasks and get their return values
  const results = await Promise.all(loggingTasks)

  // Update each foodItemToLog with its corresponding database_id
  results.forEach(({ loggedFoodItemId, index }) => {
    foodItemsToLog[index].database_id = loggedFoodItemId
  })

  // console.log("foodItemsToLog", foodItemsToLog)

  return { foodItemsToLog, isBadFoodLogRequest }
}

async function testChatCompletionJsonStream() {
  const supabase = createAdminSupabase()
  const user = await getUserByEmail("seb.grubb@gmail.com")
  const userMessage = "one cliff oat chocolate chip bar (230 cals) with starbucks tukrey bacon sandwich with cup of greek yogurt and a banana with 300 cals of chicken breast and a 200 cals smoothie with 20g protein"
  // Make sure to include all required fields in your insert object
  const insertObject = {
    content: userMessage,
    userId: user?.id,
    role: "User",
    messageType: "FOOD_LOG_REQUEST",
    createdAt: new Date().toISOString(),
    function_name: null,
    hasimages: false,
    itemsProcessed: 0,
    itemsToProcess: 0,
    local_id: null,
    resolvedAt: null,
    status: "RECEIVED"
  } as Tables<"Message">

  // const { data, error } = await supabase.from("Message").insert([insertObject]).select()
  // const { data, error } = await supabase.from("Message").select("*").eq("id", 997)
  // const message = data![0] as Tables<"Message">
  // console.log(message)
  await logFoodItemStream(user!, insertObject)
}

async function testFoodLoggingStream() {
  // const userMessage = "Two apples with a latte from starbcuks with 2% milk and 3 waffles with butter and maple syrup"
}

// testChatCompletionJsonStream()
