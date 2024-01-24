import { createAdminSupabase } from "@/utils/supabase/serverAdmin"
import { Tables } from "types/supabase"
import {
  OpenAiChatCompletionJsonStream,
  ChatCompletionJsonStreamOptions
} from "@/languageModelProviders/openai/customFunctions/chatCompletion"
import { fireworksChatCompletionStream } from "@/languageModelProviders/fireworks/fireworks"
import { FoodItemToLog, LoggedFoodServing } from "../../utils/loggedFoodItemInterface"
import { AddLoggedFoodItemToQueue } from "@/database/OpenAiFunctions/HandleLogFoodItems"
import { mode } from "mathjs"

const food_logging_prompt = `
Your task is to analyze a sentence provided by a user, describing their meal for logging purposes. Follow these steps to ensure accurate identification and logging of each food item:

1. Identify Distinct Food Items: Examine the user's sentence and identify each distinct food item. Ensure that each entry corresponds to a unique item that can be found in our food database.

2. Seperate elements: Combine elements only when they naturally constitute a single item, such as in the case of a flavored yogurt. For examples ensure that distinct components like a pancake and its topping (e.g., whipped cream) are logged as separate entries.

3. Determine 'full_single_food_database_search_name': For each identified food item, determine its 'full_single_food_database_search_name'. This name should be specific enough to encompass various forms and preparations of the food (e.g., specify if oats are cooked, or if butter is salted or unsalted).

4. Include Detailed Serving Information: The 'full_single_item_user_message_including_serving_or_quantity' should include all available information about the specfic item (but not include information about sides since we create a new entry for those), including both explicitly stated and reasonably inferred details like quantity or type (e.g., '100g of full-fat salted butter'). It is fine to assume serving details if not provided.

5. The sum of all items in the full_single_item_user_message_including_serving_or_quantity field should seperately add up to the total meal logged and should not overlap or have any duplicates.

Output Format: Your output should be in a JSON format. This format should consist only of the elements related to each food item's name and serving details, as mentioned in steps 3 and 4. Avoid including any additional information or commentary outside of this JSON structure.

INPUT_TO_PROCESS:
"INPUT_HERE"

Expected JSON Output:
{
  "food_items": [
    {
      "full_single_food_database_search_name": "string",
      "full_single_item_user_message_including_serving_or_quantity": "string",
      "branded": "boolean",
      "brand": "string"
    }
  ],
  "contains_valid_food_items": "boolean"
}

Beginning of JSON output: 
`

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

async function* processStreamedLoggedFoodItems(user: Tables<"User">, options: ChatCompletionJsonStreamOptions) {
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

async function* processStreamedLoggedFoodItemsMixtral(user: Tables<"User">, options: ChatCompletionJsonStreamOptions) {
  //   console.log("calling mixtral with options", options)
  // Call ChatCompletionJsonStream to get the stream
  const stream = await fireworksChatCompletionStream(
    {
      model: "accounts/fireworks/models/mixtral-8x7b-instruct",
      systemPrompt: "You are a helpful assistant that only replies with valid JSON.",
      prompt: options.prompt
    },
    user
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
  user_message: Tables<"Message">
): Promise<{ foodItemsToLog: FoodItemToLog[]; isBadFoodLogRequest: boolean }> {
  const foodItemsToLog: FoodItemToLog[] = []
  let isBadFoodLogRequest = false
  // Add logging task to the tasks array
  const loggingTasks: Promise<any>[] = []

  let model = "gpt-3.5-turbo-1106"
  // if (user_message.status === "FAILED") {
  //   model = "gpt-4-1106-preview"
  // }

  const stream = processStreamedLoggedFoodItems(user, {
    prompt: food_logging_prompt.replace("INPUT_HERE", user_message.content),
    temperature: 0.1,
    model: model
  })

  for await (const chunk of stream) {
    // console.log(chunk);

    if (chunk.hasOwnProperty("full_single_food_database_search_name")) {
      // It's a single food item
      const foodItemToLog = {
        food_database_search_name: chunk.full_single_food_database_search_name,
        full_item_user_message_including_serving: chunk.full_single_item_user_message_including_serving_or_quantity,
        branded: chunk.branded,
        brand: chunk.brand || ""
      }
      foodItemsToLog.push(foodItemToLog)
      // console.log("just logged: ", foodItemToLog)
      const loggingTask = AddLoggedFoodItemToQueue(user, user_message, foodItemToLog)
      loggingTasks.push(loggingTask)
    } else if (chunk.hasOwnProperty("contains_valid_food_items")) {
      console.log(chunk.contains_valid_food_items)
      isBadFoodLogRequest = !chunk.contains_valid_food_items
    }
  }
  return { foodItemsToLog, isBadFoodLogRequest }
}

async function getUserByEmail(email: string) {
  const supabase = createAdminSupabase()
  const { data, error } = await supabase.from("User").select("*").eq("email", email)

  if (error) {
    console.error(error)
    return null
  }

  return data
}

async function testChatCompletionJsonStream() {
  const supabase = createAdminSupabase()
  const user = await getUserByEmail("seb.grubb@gmail.com")
  const userMessage = "Two apples with a latte from starbcuks with 2% milk and 3 waffles with butter and maple syrup"
  // const {data, error} = await supabase.from("Message").insert([{content: userMessage, userId: user![0].id}]).select("*").single()
  const { data, error } = await supabase
    .from("Message")
    .insert([{ content: userMessage, userId: user![0].id}])
    .select()
  const message = data![0] as Tables<"Message">
  await logFoodItemStream(user![0], message)
}

async function testFoodLoggingStream() {
  // const userMessage = "Two apples with a latte from starbcuks with 2% milk and 3 waffles with butter and maple syrup"
}
//  testChatCompletionJsonStream()
