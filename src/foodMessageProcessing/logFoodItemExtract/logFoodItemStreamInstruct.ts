import { isWithinTokenLimit } from "gpt-tokenizer"
import { FoodItemToLog, LoggedFoodServing } from "../../utils/loggedFoodItemInterface"
import { chatCompletionInstructStream } from "../../languageModelProviders/openai/customFunctions/chatCompletion"
// import { HandleLogFoodItems } from "../../database/OpenAiFunctions/HandleLogFoodItems"
import { Tables } from "types/supabase"
import { createAdminSupabase } from "@/utils/supabase/serverAdmin"

// Token limit
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

  return input;
}


function mapToFoodItemToLog(outputItem: any): FoodItemToLog {
  // Since serving is no longer available in the output, we need to handle its absence
  let serving: LoggedFoodServing | undefined
  if (outputItem.serving) {
    serving = {
      serving_amount: outputItem.serving.serving_amount,
      serving_name: outputItem.serving.serving_name,
      total_serving_g_or_ml: outputItem.serving.total_serving_size_g_or_ml,
      serving_g_or_ml: outputItem.serving.g_or_ml
    }
  }

  return {
    food_database_search_name: outputItem.food_database_complete_search_term,
    full_item_user_message_including_serving: outputItem.full_item_user_message_including_serving,
    brand: outputItem.brand,
    branded: outputItem.branded,
    serving
  }
}

export async function logFoodItemStreamInstruct(
  user: Tables<"User">,
  user_request: string,
  messageId: number
): Promise<FoodItemToLog[]> {
  const sanitizedUserRequest = sanitizeInput(user_request)
  console.log("Sanitized user request:", sanitizedUserRequest)
  if (!isWithinTokenLimit(sanitizedUserRequest, tokenLimit)) {
    console.log("Input too long.")
    return []
  }
  const prompt = `Please analyze the user's request carefully and produce a structured JSON representation of the foods they want to log.

Instructions:
1. Identify distinct food items or beverages in the user_request.
2. Correct any typos you find.
3. Group identical items with their respective quantities, such as "3 oranges" as a single entry.
4. Examine combinations of words closely. If a descriptor (like a flavor, variant, or type) is positioned around a food item or brand (either before or after), it should be interpreted as part of the main item description and not as separate entities. For example, "chocolate protein powder" or "protein powder chocolate" means a chocolate-flavored protein powder, not chocolate and a protein bar separately.
5. If a brand is mentioned, mark the item as "branded" and specify the brand. For items with no brands, set "brand" to null.
6. If there's any confusion regarding the serving size, use the details provided by the user to determine the most probable serving size.

user_request: "${sanitizedUserRequest}"

Expected output format:
{
    food_database_complete_search_term: string,
    full_item_user_message_including_serving: string,
    branded: boolean,
    brand: string | null,
}[]

Output: 
[`

  const foodItemsToLog: FoodItemToLog[] = []
  const loggingTasks: Promise<any>[] = []

  const supabase = createAdminSupabase()

  const { data: messageInfo } = await supabase
    .from("Message")
    .select("itemsProcessed")
    .eq("id", messageId)
    .single()
  const itemsAlreadyProcessed = messageInfo?.itemsProcessed || 0

  let itemsExtracted = 0

  try {
    for await (const chunk of chatCompletionInstructStream(
      {
        prompt,
        temperature: 0,
        stop: "]"
      },
      user
    )) {
      // increment the number of items extracted
      itemsExtracted++
      // map to a FoodItemToLog schema
      const foodItemToLog: FoodItemToLog = mapToFoodItemToLog(chunk)
      itemsExtracted++
      console.dir(foodItemToLog)
      foodItemsToLog.push(foodItemToLog)
      // Skip processing if this item is already processed
      if (itemsExtracted <= itemsAlreadyProcessed) {
        continue
      }
      // Add logging task to the tasks array
      // const loggingTask = HandleLogFoodItems(user, { food_items: [foodItemToLog] }, messageId)
      // loggingTasks.push(loggingTask)
    }

    // Wait for all logging tasks to complete
    const results = await Promise.allSettled(loggingTasks)

    // Optionally, you can handle the results:
    // e.g., to log errors if any task failed
    for (const result of results) {
      if (result.status === "rejected") {
        console.error("Error while logging food item:", result.reason)
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
      dateOfBirth: null,
      emailVerified: null,
      activityLevel: null,
  } as Tables<"User">;
  let userRequestString = "20g of peanut butter"
  let result = await logFoodItemStreamInstruct(user, userRequestString, 1)
  //console.dir(result, { depth: null })
}

//testFoodLog()
