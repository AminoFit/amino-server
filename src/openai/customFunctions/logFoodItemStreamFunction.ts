import { chatCompletionFunctionStream } from "./chatCompletion"
import { isWithinTokenLimit } from "gpt-tokenizer"
import { FoodItemToLog } from "../../utils/loggedFoodItemInterface"
import { logFoodSchema } from "@/utils/openaiFunctionSchemas"
import { HandleLogFoodItems } from "../../database/OpenAiFunctions/HandleLogFoodItems"
import { createAdminSupabase } from "@/utils/supabase/serverAdmin"
import { Tables } from "types/supabase"

const tokenLimit = 2048

function sanitizeInput(input: string): string {
  // Trim leading and trailing whitespace
  input = input.trim();

  // Replace multiple spaces with a single space
  input = input.replace(/\s+/g, ' ');

  // Remove control characters, non-standard symbols, and HTML tags
  input = input.replace(/[\x00-\x1F\x7F]/g, ''); // Control characters
  input = input.replace(/<[^>]*>/g, ''); // HTML tags
  input = input.replace(/[^\x20-\x7E]/g, ''); // Non-standard ASCII

  // Optional: Remove offensive or inappropriate language
  // This might require a more sophisticated approach or external library

  // Limit excessively long text
  const maxLength = 1000; // Adjust based on your requirements
  if (input.length > maxLength) {
    input = input.substring(0, maxLength);
  }

  return input;
}

enum ParseState {
  UNKNOWN,
  START_FOOD_ITEMS,
  IN_FOOD_ITEM,
  END_FOOD_ITEMS
}

export async function logFoodItemFunctionStream(
  user: Tables<"User">,
  user_request: string,
  lastUserMessageId: number
): Promise<FoodItemToLog[]> {
  const sanitizedUserRequest = sanitizeInput(user_request)
  if (!isWithinTokenLimit(sanitizedUserRequest, tokenLimit)) {
    console.log("Input too long.")
    return []
  }

  const prompt = `Call log_food_items. Based on user request give a structured JSON of what foods user wants to log. Group items if possible. Fix typos.`

  const foodItemsToLog: FoodItemToLog[] = []
  const loggingTasks: Promise<any>[] = []

  const supabase = createAdminSupabase()

  const { data: messageInfo } = await supabase
    .from("Message")
    .select("itemsProcessed")
    .eq("id", lastUserMessageId)
    .single()

  // const messageInfo = await pris.message.findUnique({
  //   where: { id: lastUserMessageId },
  //   select: {
  //     itemsProcessed: true
  //   }
  // })
  const itemsAlreadyProcessed = messageInfo?.itemsProcessed || 0
  let itemsExtracted = 0
  let buffer = ""
  let state = ParseState.UNKNOWN
  let itemBuffer = ""

  try {
    for await (const chunk of chatCompletionFunctionStream(
      {
        model: "gpt-3.5-turbo-0613",
        messages: [
          {
            role: "system",
            content: prompt
          },
          {
            role: "user",
            content: user_request
          }
        ],
        functions: [
          {
            name: "log_food_items",
            parameters: logFoodSchema
          }
        ],
        function_call: "auto"
      },
      user
    )) {
      buffer += chunk

      switch (state) {
        case ParseState.UNKNOWN:
          if (/\{\s*"food_items"\s*:\s*\[/i.test(buffer)) {
            buffer = buffer.replace(/\{\s*"food_items"\s*:\s*\[/i, "")
            state = ParseState.START_FOOD_ITEMS
          }
          break

        case ParseState.START_FOOD_ITEMS:
        case ParseState.IN_FOOD_ITEM:
          itemBuffer += chunk
          const openBrackets = (itemBuffer.match(/{/g) || []).length
          const closeBrackets = (itemBuffer.match(/}/g) || []).length

          if (itemBuffer.trim() === "]") {
            state = ParseState.END_FOOD_ITEMS
            itemBuffer = ""
          } else if (openBrackets === closeBrackets && itemBuffer.trim()) {
            // Remove trailing comma if it exists
            if (itemBuffer.trim().endsWith(",")) {
              itemBuffer = itemBuffer.trim().slice(0, -1)
            }

            try {
              const parsedItem = JSON.parse(itemBuffer.trim())
              console.log("Parsed item:", parsedItem)
              foodItemsToLog.push(parsedItem)
              itemBuffer = ""
              state = ParseState.IN_FOOD_ITEM
              // increment the number of items extracted
              itemsExtracted++

              // Skip processing if this item is already processed
              if (itemsExtracted > itemsAlreadyProcessed) {
                // Add logging task to the tasks array
                const loggingTask = HandleLogFoodItems(user, { food_items: [parsedItem] }, lastUserMessageId)
                loggingTasks.push(loggingTask)
              }
              break
            } catch (err) {
              console.log("Error parsing JSON item:", itemBuffer)
              const error = err as Error
              console.error("Failed to parse JSON item:", error.message)
            }
          }
          break
        case ParseState.END_FOOD_ITEMS:
          if (buffer.includes("]}")) {
            state = ParseState.UNKNOWN // reset state if you're expecting more data or finalize processing
            itemBuffer = ""
            buffer = ""
          }
          break
      }
    }
    return foodItemsToLog
  } catch (error) {
    if (error instanceof Error) {
      console.log("Error:", error.message)
    } else {
      console.log("Error:", error)
    }
    return []
  }
}

async function testFoodLog() {
  const user: Tables<"User"> = {
    id: "clmzqmr2a0000la08ynm5rjju",
    fullName: "John",
    email: "john.doe@example.com",
    phone: "123-456-7890",
    dateOfBirth: new Date("1990-01-01T00:00:00").toISOString(),
    weightKg: 70.5,
    heightCm: 180,
    calorieGoal: 2000,
    proteinGoal: 100,
    carbsGoal: 200,
    fatGoal: 50,
    fitnessGoal: "Maintain",
    unitPreference: "IMPERIAL",
    setupCompleted: false,
    sentContact: false,
    sendCheckins: false,
    tzIdentifier: "America/New_York",
    avatarUrl: null,
    emailVerified: null,
    activityLevel: null,
  } as Tables<"User">;
  let userRequestString = "1 oz of almonds, 1 fl oz of milk, 1 cup of cooked rice"
  let result = await logFoodItemFunctionStream(user, userRequestString, 1)
  console.dir(result, { depth: null })
}

// testFoodLog()
