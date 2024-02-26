import { createAdminSupabase } from "@/utils/supabase/serverAdmin"
import { Tables } from "types/supabase"
import {
  OpenAiChatCompletionJsonStream,
  ChatCompletionStreamOptions
} from "@/languageModelProviders/openai/customFunctions/chatCompletion"
import { fireworksChatCompletionStream } from "@/languageModelProviders/fireworks/fireworks"
import { FoodItemToLog, LoggedFoodServing } from "../../utils/loggedFoodItemInterface"
import { AddLoggedFoodItemToQueue } from "../addLogFoodItemToQueue"
import { getUserByEmail } from "../common/debugHelper"
import { getMessageTimeChat } from "../messageTime/extractMessageTime"

const food_logging_prompt = `
INPUT_TO_PROCESS:
"INPUT_HERE"

Your task is to analyze INPUT_TO_PROCESS, which is a message of a user describing their meal for logging purposes. Follow these steps to ensure accurate identification and logging of each food item:

1. Set containsTemporalExpression to true if INPUT_TO_PROCESS contains any clues of when they ate something. e.g."i had apple for dinner" is a clue of when. Breakfast, brunch, lunch, afternoon snack, dinner, tomorrow, last night, this afternoon, yesterday, today, at 1pm, 2 hours ago, etc. are all examples of temporal expressions.

2. Identify Distinct Food Items: Examine the user's sentence and identify each distinct food item. Ensure that each entry corresponds to a unique item that can be found in our food database.

3. Fix any typos: Typos may exist due to fast typing or because the text is a result of voice recognition. If you notice any typos, correct them to the best of your ability. E.g. "one pair" should be corrected to "one pear" or "lin choclate" likely means "lindt chocolate".

4. Separate elements: Combine elements only when they naturally constitute a single item, such as in the case of a flavored yogurt. For examples ensure that distinct components like a pancake and its topping (e.g., whipped cream) are logged as separate entries.

5. Determine 'full_single_food_database_search_name': For each identified food item, determine its 'full_single_food_database_search_name'. This name should be specific enough to encompass various forms and preparations of the food (e.g., specify if oats are cooked, or if butter is salted or unsalted).

6. Include Detailed Serving Information: The 'full_single_item_user_message_including_serving_or_quantity' should include all available information about the specfic item (but not include information about sides since we create a new entry for those), including both explicitly stated and reasonably inferred details like quantity or type (e.g., '100g of full-fat salted butter'). It is fine to assume serving details if not provided.

7. The sum of all items in the full_single_item_user_message_including_serving_or_quantity field should seperately add up to the total meal logged and should not overlap or have any duplicates.


Output Format: Your output should be in a JSON format. This format should consist only of the elements related to each food item's name and serving details, as mentioned in steps 4 and 5. Avoid including any additional information or commentary outside of this JSON structure.


Expected JSON Output:
{
  "containsTemporalExpression": "boolean",
  "food_items": [
    {
      "full_single_food_database_search_name": "string",
      "full_single_item_user_message_including_serving_or_quantity": "string",
      "branded": "boolean",
      "brand": "string"
    }
  ],
  "contains_valid_food_items": "boolean",
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

async function* processStreamedLoggedFoodItemsMixtral(user: Tables<"User">, options: ChatCompletionStreamOptions) {
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
  // console.log("inputString", inputString);
  let braceCount = 0
  let endIndex = -1
  let startIndex = -1

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
        startIndex = i
        break // Exit the loop as we found the JSON start
      }
    }
  }

  // If we found a potential JSON object, try to parse it
  if (startIndex !== -1 && endIndex !== -1) {
    const jsonStr = inputString.substring(startIndex, endIndex + 1)
    try {
      const jsonObj = JSON.parse(jsonStr)
      return { jsonObj, endIndex } // Return both the object and the end index
    } catch (e) {
      console.error("Failed to parse JSON:", e)
    }
  } else {
    // console.log("braceCount", braceCount)
    if (braceCount === -1) {
      // Ensure we're dealing with a top-level item
      const regex = /"\s*[^"]+"\s*:\s*([^,}]+)(,?)/g
      let matches = inputString.match(regex)
      if (matches && matches.length > 0) {
        // Attempt to parse the last matched potential property
        let lastMatch = matches[matches.length - 1]
        let matchResult = lastMatch.match(/:\s*(.*?)(,?)$/) // Adjusted to capture trailing comma

        if (matchResult !== null) {
          let matchValue = matchResult[1].trim()
          let hasComma = matchResult[2] === ","

          // Simplify the validation logic by directly checking against patterns
          let isValidValue = /^(true|false|null|\d+(\.\d+)?|".*?"|\[|\{)$/.test(matchValue)

          if (isValidValue) {
            // Ensure correct JSON formatting without adding an extra '}'
            let potentialJson = `{${lastMatch.split(":")[0].trim()}: ${matchValue}}`
            try {
              const jsonObj = JSON.parse(potentialJson)
              endIndex = inputString.lastIndexOf(lastMatch) + lastMatch.length - (hasComma ? 1 : 0)
              return { jsonObj, endIndex }
            } catch (e) {
              console.error("Failed to parse top-level JSON property:", e, potentialJson)
            }
          }
        }
      }
    }
  }

  return { jsonObj: null, endIndex: -1 } // Return null if no JSON content is found
}

// if the message contains a temporal expression, we need to wait for the time eaten provided by the user
// that is processed by the getMessageTimeChat extract step
// if the message does not contain a temporal expression, we can process the food items immediately
// if the message is being edited, we can process the food items immediately and we ignore the temporal expression
export async function logFoodItemStream(
  user: Tables<"User">,
  user_message: Tables<"Message">,
  consumedOn: Date = new Date(),
  isMessageBeingEdited: boolean = false
): Promise<{ foodItemsToLog: FoodItemToLog[]; isBadFoodLogRequest: boolean, newConsumedOnTime?: Date }> {
  const foodItemsToLog: FoodItemToLog[] = []
  let isBadFoodLogRequest = false
  // Add logging task to the tasks array
  const loggingTasks: Promise<any>[] = []
  const currentDateTime = new Date()
  // define a variable to store a future promise we will set later
  let getTimeEatenPromise: Promise<{ timeWasSpecified: boolean; consumedDateTime: Date | null }> | undefined = undefined

  let model = "gpt-3.5-turbo-0125"
  // if (user_message.status === "FAILED") {
  //   model = "gpt-4-1106-preview"
  // }

  const stream = processStreamedLoggedFoodItems(user, {
    prompt: food_logging_prompt.replace("INPUT_HERE", user_message.content),
    temperature: 0.1,
    model: model,
    response_format: "json_object"
  })

  let messageContainsTemporalExpression: boolean | undefined = isMessageBeingEdited ? false : undefined

  for await (const chunk of stream) {
    if (messageContainsTemporalExpression === undefined && chunk.hasOwnProperty("containsTemporalExpression")) {
      messageContainsTemporalExpression = chunk.containsTemporalExpression
      // if getTimeEatenPromise is not defined we can send it out if containsTemporalExpression is true
      if (messageContainsTemporalExpression && !getTimeEatenPromise) {
        getTimeEatenPromise = getMessageTimeChat(user, user_message.content)
      }
    }
    if (chunk.hasOwnProperty("full_single_food_database_search_name")) {
      const elapsedTime = new Date().getTime() - currentDateTime.getTime()
      // It's a single food item
      const foodItemToLog = {
        food_database_search_name: chunk.full_single_food_database_search_name,
        full_item_user_message_including_serving: chunk.full_single_item_user_message_including_serving_or_quantity,
        branded: chunk.branded,
        brand: chunk.brand || "",
        timeEaten: new Date(consumedOn.getTime() + elapsedTime).toISOString()
      } as FoodItemToLog
      foodItemsToLog.push(foodItemToLog)
      // console.log("just logged: ", foodItemToLog, "containsTemporalExpression: ", containsTemporalExpression)
      if (!messageContainsTemporalExpression) {
        console.log("adding to queue NOW", foodItemToLog)
        const newLoggingTask = AddLoggedFoodItemToQueue(user, user_message, foodItemToLog)
        loggingTasks.push(newLoggingTask)
      }
    }
    if (chunk.hasOwnProperty("contains_valid_food_items")) {
      isBadFoodLogRequest = !chunk.contains_valid_food_items
    }
  }
  
  let newConsumedOnTime: Date | null = null
  //await getTimeEatenPromise
  if (getTimeEatenPromise && messageContainsTemporalExpression) {
    const { timeWasSpecified, consumedDateTime } = await getTimeEatenPromise
    newConsumedOnTime = consumedDateTime
    let additionalTime = 0
    for (const foodItemToLog of foodItemsToLog) {
      let consumedOnForFoodItem = consumedDateTime || consumedOn
      foodItemToLog.timeEaten = new Date(consumedOnForFoodItem.getTime() + additionalTime).toISOString()
      console.log("adding to queue LATER", foodItemToLog)
      const newLoggingTask = AddLoggedFoodItemToQueue(user, user_message, foodItemToLog)
      loggingTasks.push(newLoggingTask)
      additionalTime += 1000
    }
  }
  await Promise.all(loggingTasks)
  
  if (newConsumedOnTime) {
    return { foodItemsToLog, isBadFoodLogRequest, newConsumedOnTime }
  }
  return { foodItemsToLog, isBadFoodLogRequest }
}

async function testChatCompletionJsonStream() {
  const supabase = createAdminSupabase()
  const user = await getUserByEmail("seb.grubb@gmail.com")
  // const userMessage = "Two apples with a latte from starbucks with 2% milk and 3 waffles with butter and maple syrup"
  // // Make sure to include all required fields in your insert object
  // const insertObject = {
  //   content: userMessage,
  //   userId: user![0].id,
  //   role: "User",
  //   messageType: "FOOD_LOG_REQUEST",
  //   createdAt: new Date().toISOString(),
  //   function_name: null,
  //   hasimages: false,
  //   itemsProcessed: 0,
  //   itemsToProcess: 0,
  //   local_id: null,
  //   resolvedAt: null,
  //   status: "RECEIVED"
  // } as Tables<"Message">

  // const { data, error } = await supabase.from("Message").insert([insertObject]).select()
  // const { data, error } = await supabase.from("Message").select("*").eq("id", 997)
  // const message = data![0] as Tables<"Message">
  const message = {
    id: 997,
    createdAt: new Date().toISOString(),
    content: "i had a banana and a latte yesterday",
    function_name: null,
    role: "User",
    userId: "uuid-of-the-user",
    itemsProcessed: 0,
    itemsToProcess: 0,
    messageType: "FOOD_LOG_REQUEST",
    resolvedAt: null,
    status: "RECEIVED",
    local_id: null,
    hasimages: false,
    isAudio: false,
    isBadFoodRequest: null,
    consumedOn: null,
    deletedAt: null
  } as Tables<"Message">
  await logFoodItemStream(user!, message, new Date(), true)
}

async function testFoodLoggingStream() {
  // const userMessage = "Two apples with a latte from starbcuks with 2% milk and 3 waffles with butter and maple syrup"
}
// testChatCompletionJsonStream()
