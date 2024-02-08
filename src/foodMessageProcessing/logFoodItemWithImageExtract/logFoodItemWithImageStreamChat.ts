import { createAdminSupabase } from "@/utils/supabase/serverAdmin"
import { Tables } from "types/supabase"
import {
  OpenAiVisionChatStream,
  ChatCompletionVisionStreamOptions
} from "@/languageModelProviders/openai/customFunctions/chatCompletion"
import { FoodItemToLog, LoggedFoodServing } from "../../utils/loggedFoodItemInterface"
import { AddLoggedFoodItemToQueue } from "../addLogFoodItemToQueue"
import OpenAI from "openai"
import { getUserByEmail, getUserMessageById } from "../common/debugHelper"
import { e, mode } from "mathjs"
import { exit } from "process"

const image_system_prompt = `You are a nutrition logging assistant that accurately uses user images and text to generate a structured JSON ouput. You can only output in JSON.`

const food_logging_prompt = `
Your task is to identify based on pictures provided and the user INPUT_TO_PROCESS text what a user ate along with good portion estimates.

1. Identify Distinct Food Items: Look at both the images and the user input and determine for each unique food item what it is. Sometimes the user is trying to add detail to the picture and sometimes trying to say they had something in addition.

2. Fix any typos: Typos may exist due to fast typing or because the text is a result of voice recognition. If you notice any typos, correct them to the best of your ability. E.g. "one pair" should be corrected to "one pear" or "lin choclate" likely means "lindt chocolate".

3. Separate elements: Combine elements only when they naturally constitute a single item, such as in the case of a flavored yogurt. For example, ensure that distinct components like a pancake and its topping (e.g., whipped cream) are logged as separate entries.

4. IMPORTANT: 'full_single_food_database_search_name' must as specific as possible to correctly search. Include any detail provided or obviously inferrable from the text or picture like brand, flavor, preparation (cooked, blended, dry, uncooked, raw etc). Do not includes details about sides (e.g. pancake with honey, just create a new entry for honey, unless it is definitely part of the item like cinammon pancake would just be one thing).

5. Include Detailed Serving Information: The 'full_single_item_user_message_including_serving_or_quantity' should include all available information about the specfic item (but not include information about sides since we create a new entry for those), including both explicitly stated and reasonably inferred details like quantity or type (e.g., '100g of full-fat salted butter'). Serving details must always be included and can be inferred from the picture.

6. The sum of all items in the full_single_item_user_message_including_serving_or_quantity field should seperately add up to the total meal logged and should not overlap or have any duplicates.

Output Format: Your output should be in a JSON format. This format should consist only of the elements related to each food item's name and serving details, as mentioned in steps 3 and 4. Avoid including any additional information or commentary outside of this JSON structure.

INPUT_TO_PROCESS:
"USER_INPUT_CONTENT"

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

You can only output JSON. Beginning of JSON output: 
`

async function* processStreamedLoggedFoodItemsWithImages(user: Tables<"User">, options: ChatCompletionVisionStreamOptions) {
  // Call ChatCompletionJsonStream to get the stream
  const stream = await OpenAiVisionChatStream(user, options)

  let buffer = "" // Buffer to accumulate chunks of data
  let lastProcessedIndex = -1 // Track the last processed index
  for await (const chunk of stream) {
    if (chunk === null || chunk === undefined) {
      return // Exit the generator when no more data is available
    }
    buffer += chunk // Append the new chunk to the buffer
    // process.stdout.write(chunk)
    const { jsonObj, endIndex } = extractLatestValidJSON(buffer)

    if (jsonObj && endIndex !== lastProcessedIndex) {
      // console.log(jsonObj); // Output the new JSON object
      lastProcessedIndex = endIndex // Update the last processed index
      yield jsonObj // Yield the new JSON object
    }
  }
  return
}

async function generateSignedUrls(userImages: Tables<"UserMessageImages">[]) {
    const supabase = createAdminSupabase()
    return await Promise.all(userImages.map(async image => {
      const { data, error } = await supabase.storage
        .from('userUploadedImages')
        .createSignedUrl(image.imagePath, 3600); // 3600 seconds = 1 hour
  
      if (error) {
        console.error('Error generating signed URL:', error.message);
        return null; // Handle this as appropriate for your application
      }
  
      return {
        ...image,
        signedImageUrl: data.signedUrl,
      };
    }));
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

async function getUserImagesByMessageId(messageId: number) {
    const supabase = createAdminSupabase()
    const { data, error } = await supabase
      .from('UserMessageImages')
      .select('imagePath, uploadedAt') // Specify the columns you want to retrieve
      .eq('messageId', messageId)
  
    if (error) {
      console.error(error)
      return null
    }
  
    return data
  }

export async function logFoodItemStreamWithImages(
  user: Tables<"User">,
  user_message: Tables<"Message">
): Promise<{ foodItemsToLog: FoodItemToLog[]; isBadFoodLogRequest: boolean }> {
  const foodItemsToLog: FoodItemToLog[] = []
  let isBadFoodLogRequest = false
  const loggingTasks: Promise<any>[] = []

  let model = "gpt-4-vision-preview"

  const user_images = await getUserImagesByMessageId(user_message.id) as Tables<"UserMessageImages">[]
  const prompt = food_logging_prompt.replace("USER_INPUT_CONTENT", user_message.content)
  const user_images_with_signed_urls = await generateSignedUrls(user_images);

  const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
    {
      role: "system",
      content: image_system_prompt,
    },
    {
      role: "user",
      content: [
        { type: "text", text: prompt },
        // Filter out any images that are null or do not have a signed URL
        ...(user_images_with_signed_urls ?? []).filter(image => image && image.signedImageUrl).map(image => ({
          "type": "image_url",
          image_url: {
            url: image?.signedImageUrl,
            detail: "low" as const, // 
          },
        })) as OpenAI.Chat.ChatCompletionContentPartImage[],
      ],
    },
  ];
  
  const stream = processStreamedLoggedFoodItemsWithImages(user, {
    messages,
    temperature: 0.01,
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
      console.log("just logged: ", foodItemToLog)
      const loggingTask = AddLoggedFoodItemToQueue(user, user_message, foodItemToLog)
      loggingTasks.push(loggingTask)
    } else if (chunk.hasOwnProperty("contains_valid_food_items")) {
      console.log(chunk.contains_valid_food_items)
      isBadFoodLogRequest = !chunk.contains_valid_food_items
    }
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
  const { data, error } = await supabase.from("Message").select("*").eq("id", 997)
  const message = data![0] as Tables<"Message">
  // console.log(message)
  await logFoodItemStreamWithImages(user!, message)
}

async function testVisionFoodLoggingStream() {
  const user = (await getUserByEmail("seb.grubb@gmail.com"))! as Tables<"User">
  const message = await getUserMessageById(1235)

  await logFoodItemStreamWithImages(user, message!)
}

// testVisionFoodLoggingStream().then(() => {
//   console.log("Test complete")
//   exit()
// })
