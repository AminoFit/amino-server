import { createAdminSupabase } from "@/utils/supabase/serverAdmin"
import { Tables } from "types/supabase"
import { ChatCompletionJsonStream, ChatCompletionJsonStreamOptions } from "@/languageModelProviders/openai/customFunctions/chatCompletion"

const test_prompt = `
Your task is to analyze a sentence provided by a user, describing their meal for logging purposes. Follow these steps to ensure accurate identification and logging of each food item:

1. Identify Distinct Food Items: Examine the user's sentence and identify each distinct food item. Ensure that each entry corresponds to a unique item that can be found in our food database.

2. Seperate elements: Combine elements only when they naturally constitute a single item, such as in the case of a flavored yogurt. For examples ensure that distinct components like a pancake and its topping (e.g., whipped cream) are logged as separate entries.

3. Determine 'full_unique_food_database_search_name': For each identified food item, determine its 'full_unique_food_database_search_name'. This name should be specific enough to encompass various forms and preparations of the food (e.g., specify if oats are cooked, or if butter is salted or unsalted).

4. Include Detailed Serving Information: The 'full_unique_item_user_message_including_serving_or_quantity' should include all available information about the specfic item (but not include information about sides since we create a new entry for those), including both explicitly stated and reasonably inferred details like quantity or type (e.g., '100g of full-fat salted butter'). It is fine to assume serving details if not provided.

5. The sum of all items in the full_unique_item_user_message_including_serving_or_quantity field should seperately add up to the total meal logged and should not overlap or have any duplicates.

Output Format: Your output should be in a JSON format. This format should consist only of the elements related to each food item's name and serving details, as mentioned in steps 3 and 4. Avoid including any additional information or commentary outside of this JSON structure.

INPUT_TO_PROCESS:
"starbucks latte with 2% milk and 3 waffles with butter and maple syrup with two oikos strawberry greek yogurts and a banana"

Expected JSON Output:
{
  "food_items": [
    {
      "full_unique_food_database_search_name": "string",
      "full_unique_item_user_message_including_serving_or_quantity": "string",
      "branded": "boolean",
      "brand": "string"
    }
  ],
  "contains_valid_food_items": "boolean"
}

Beginning of JSON output: 
`

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
    const user = await getUserByEmail("seb.grubb@gmail.com")
    const stream = processStreamedLoggedFoodItems(user![0], { prompt: test_prompt })
    for await (const chunk of stream) {
      // process.stdout.write(chunk)
      console.log(chunk)
      // console.log(chunk)
    }
  }
  
  testChatCompletionJsonStream()
  
  async function* processStreamedLoggedFoodItems(user: Tables<"User">, options: ChatCompletionJsonStreamOptions) {
    // Call ChatCompletionJsonStream to get the stream
    const stream = await ChatCompletionJsonStream(user, options);
  
    let buffer = ""; // Buffer to accumulate chunks of data
    let lastProcessedIndex = -1; // Track the last processed index
  
    for await (const chunk of stream) {
      buffer += chunk; // Append the new chunk to the buffer
      const { jsonObj, endIndex } = extractLatestValidJSON(buffer);
  
      if (jsonObj && endIndex !== lastProcessedIndex) {
        // console.log(jsonObj); // Output the new JSON object
        lastProcessedIndex = endIndex; // Update the last processed index
        yield jsonObj; // Yield the new JSON object
      }
    }
  }
  
  function extractLatestValidJSON(inputString: string) {
    let braceCount = 0;
    let endIndex = -1;
  
    // Start from the end of the string and look for the first closing brace
    for (let i = inputString.length - 1; i >= 0; i--) {
      if (inputString[i] === "}") {
        if (braceCount === 0) {
          // This is the end of the latest JSON object
          endIndex = i;
        }
        braceCount++;
      } else if (inputString[i] === "{") {
        braceCount--;
        if (braceCount === 0) {
          // Found the start of the latest JSON object
          const jsonStr = inputString.substring(i, endIndex + 1);
          try {
            const jsonObj = JSON.parse(jsonStr);
            return { jsonObj, endIndex }; // Return both the object and the end index
          } catch (e) {
            console.error("Failed to parse JSON:", e);
            return { jsonObj: null, endIndex: -1 };
          }
        }
      }
    }
  
    return { jsonObj: null, endIndex: -1 }; // Return null if no well-formed JSON object is found
  }