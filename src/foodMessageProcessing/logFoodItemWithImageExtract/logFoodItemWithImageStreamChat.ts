import { createAdminSupabase } from "@/utils/supabase/serverAdmin"
import { Tables } from "types/supabase"
import {
  OpenAiVisionChatStream,
  ChatCompletionVisionStreamOptions
} from "@/languageModelProviders/openai/customFunctions/chatCompletion"
import { FoodItemToLog } from "../../utils/loggedFoodItemInterface"
import OpenAI from "openai"
import { getUserByEmail, getUserMessageById } from "../common/debugHelper"
import { exit } from "process"
import { AddLoggedFoodItemToQueue } from "../addLogFoodItemToQueue"
import { fetchRotateAndConvertToBase64 } from "../common/imageTools/rotateImageFromUrl"
import { fetchAndDecodeBarcode } from "./utils/barcodeExtract"
import { sanitizeFoodItemNutritionFieldsJSON } from "../common/sanitizeNutrients"

const image_system_prompt = `You are a nutrition logging assistant that accurately uses user images and text to generate a structured JSON ouput. You can only output in JSON.`

const food_logging_prompt = `<input_to_process>
"USER_INPUT_CONTENT"
</input_to_process>

<instruction>
Identify based on pictures provided and the user text inside the <input_to_process> tag what they ate along with good portion estimates of the food.

1. Identify Distinct Food Items: Look at both the images and the user input and determine for each unique food item what it is. Sometimes the user is trying to add detail to the picture and sometimes trying to say they had something in addition.

2. Fix any typos: Typos may exist due to fast typing or because the text is a result of voice recognition. If you notice any typos, correct them to the best of your ability. E.g. "one pair" should be corrected to "one pear" or "lin choclate" likely means "lindt chocolate".

3. Separate elements: Combine elements only when they naturally constitute a single food item, such as in the case of a flavored yogurt. For example, ensure that distinct components like a pancake and its topping (e.g., whipped cream) are logged as separate entries. But if someone says 'yogurt with strawberries and banana', then it is 3 items, yogurt, strawberries, and banana. It is very important to separate the items in this case. Another example is 'coffee with milk' should be logged as 'a shot of coffee' and 'milk' for example.

4. IMPORTANT: 'full_single_food_database_search_name' must as specific as possible to correctly search. Include any detail provided or obviously inferrable from the text or picture like brand, flavor, preparation (cooked, blended, dry, uncooked, raw etc). Do not includes details about sides (e.g. pancake with honey, just create a new entry for honey, unless it is definitely part of the item like cinammon pancake would just be one thing).

5. Include Detailed Serving Information: The 'full_single_item_user_message_including_serving_or_quantity' should include all available information about the specfic item (but not include information about sides since we create a new entry for those), including both explicitly stated and reasonably inferred details like quantity or approximate weight (e.g., '100g of full-fat salted butter'). Serving details must always be included and can be inferred from the picture. Be as descriptive as possible such that a weight can be inferred (e.g. 2 chicken vs 2 chicken breasts is wildly different). Hence the more details to estimate the weight the better. If weight is guessable include it ideally in grams or ml. If the amount of calories is known include that too (e.g. '100 calories of full-fat salted butter').

6. The sum of all items in the full_single_item_user_message_including_serving_or_quantity field should seperately add up to the total meal logged and should not overlap or have any duplicates.

7. If the images contain a barcode you can use the upc field to store the barcode number. Otherwise this field doesn't need to be included.

8. If nutritional information is available, include it in the nutritional_information field. DO NOT include fields you don't know the exact value of or are null.
8a. If a calculation is required you can use an equation string instead of a number. An equation string can only contain + - * / and numbers.
</instruction>

<output_format>
Your output should only be in JSON format. This format should consist only of the elements related to each food item's name and serving details, as mentioned in steps 3 and 4.
You must omit a field if it is null or unknown to save time and characters.
</output_format>

<example>
sample_user_photo: photo showing a snickers bar with the label saying 250 calories and 52.7g 
sample_user_text: "i had two of these"
sample_ouptput:
{
  "food_items": [
    {
      "full_single_food_database_search_name": "Snickers Bar Chocolate",
      "full_single_item_user_message_including_serving_or_quantity": "Two Snickers Single Bar Chocolate Candy (250 cals per bar and 52.7g per bar)",
      "branded": true,
      "brand": "Snickers",
      "nutritional_information": {
        "kcal": "250 * 2",
      }
    }
  ],
  "contains_valid_food_items": true
}
note: as you can see we only include optional fields when we can know or calculate their exact values
</example>

<json_output_format>
{
  "food_items": [
    {
      "full_single_food_database_search_name": "string",
      "full_single_item_user_message_including_serving_or_quantity": "string",
      "branded": "boolean",
      "brand": "string",
      "upc"?: "number",
      "nutritional_information"?: {
        "kcal"?: "number | string",
        "totalFatG"?: "number | string",
        "satFatG"?: "number | string",
        "transFatG"?: "number | string",
        "carbG"?: "number | string",
        "fiberG"?: "number | string",
        "sugarG"?: "number | string",
        "proteinG"?: "number | string",
        "waterMl"?: "number | string",
        "vitaminAMcg"?: "number | string",
        "vitaminCMg"?: "number | string",
        "vitaminDMcg"?: "number | string",
        "vitaminEMg"?: "number | string",
        "vitaminKMcg"?: "number | string",
        "vitaminB1Mg"?: "number | string",
        "vitaminB2Mg"?: "number | string",
        "vitaminB3Mg"?: "number | string",
        "vitaminB5Mg"?: "number | string",
        "vitaminB6Mg"?: "number | string",
        "vitaminB7Mcg"?: "number | string",
        "vitaminB9Mcg"?: "number | string",
        "vitaminB12Mcg"?: "number | string",
        "calciumMg"?: "number | string",
        "ironMg"?: "number | string",
        "magnesiumMg"?: "number | string",
        "phosphorusMg"?: "number | string",
        "potassiumMg"?: "number | string",
        "sodiumMg"?: "number | string",
        "cholesterolMg"?: "number | string",
        "caffeineMg"?: "number | string",
        "alcoholG"?: "number | string"
      }
    }
  ],
  "contains_valid_food_items": "boolean"
}
</json_output_format>
`

async function* processStreamedLoggedFoodItemsWithImages(
  user: Tables<"User">,
  options: ChatCompletionVisionStreamOptions
) {
  // Call ChatCompletionJsonStream to get the stream
  const stream = await OpenAiVisionChatStream(user, options)

  let buffer = "" // Buffer to accumulate chunks of data
  let lastProcessedIndex = -1 // Track the last processed index
  for await (const chunk of stream) {
    if (chunk === null || chunk === undefined) {
      return // Exit the generator when no more data is available
    }
    buffer += chunk // Append the new chunk to the buffer
    process.stdout.write(chunk)
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
  return await Promise.all(
    userImages.map(async (image) => {
      const { data, error } = await supabase.storage.from("userUploadedImages").createSignedUrl(image.imagePath, 3600)

      if (error) {
        console.error("Error generating signed URL:", error.message)
        return null // Handle this as appropriate for your application
      }

      return {
        ...image,
        signedImageUrl: data.signedUrl
      }
    })
  )
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
    .from("UserMessageImages")
    .select("imagePath, uploadedAt") // Specify the columns you want to retrieve
    .eq("messageId", messageId)

  if (error) {
    console.error(error)
    return null
  }

  return data
}

async function createMessagesWithRotatedImages(
  messages: OpenAI.Chat.ChatCompletionMessageParam[]
): Promise<OpenAI.Chat.ChatCompletionMessageParam[]> {
  const processedMessages: OpenAI.Chat.ChatCompletionMessageParam[] = await Promise.all(
    messages.map(async (message): Promise<OpenAI.Chat.ChatCompletionMessageParam> => {
      // Check if the message is from a user and contains content that can be processed
      if (message.role === "user" && Array.isArray(message.content)) {
        const processedContent = await Promise.all(
          message.content.map(
            async (contentPart): Promise<OpenAI.Chat.ChatCompletionContentPartImage | typeof contentPart> => {
              // Only process parts that are of type image_url
              if (contentPart.type === "image_url" && contentPart.image_url?.url) {
                const base64Image = await fetchRotateAndConvertToBase64(contentPart.image_url.url)
                if (base64Image) {
                  // Explicitly cast the modified part to the correct type
                  return {
                    type: "image_url",
                    image_url: {
                      url: `data:image/jpeg;base64,${base64Image}`,
                      detail: "high" as const // Explicitly set the detail level to 'low'
                    }
                  } as OpenAI.Chat.ChatCompletionContentPartImage // Explicit type casting
                }
              }
              return contentPart // Return unmodified if not an image_url type or if rotation/conversion fails
            }
          )
        )

        // Explicitly cast the entire message to ChatCompletionMessageParam
        return {
          ...message,
          content: processedContent
        } as OpenAI.Chat.ChatCompletionMessageParam
      }
      return message // Return unmodified if the message does not need processing
    })
  )

  return processedMessages
}

async function processOpenAiVisionChatStream(
  user_message: Tables<"Message">,
  messages: OpenAI.Chat.ChatCompletionMessageParam[],
  user: Tables<"User">,
  consumedOn: Date
): Promise<{ foodItemsToLog: FoodItemToLog[]; isBadFoodLogRequest: boolean }> {
  const foodItemsToLog: FoodItemToLog[] = []
  let isBadFoodLogRequest = false
  const loggingTasks: Promise<any>[] = []

  let model = "gpt-4o"
  const currentDateTime = new Date()

  const stream = processStreamedLoggedFoodItemsWithImages(user, {
    messages,
    temperature: 0.00,
    model: model,
    response_format: { type: "json_object" }
  })

  for await (const chunk of stream) {
    if (chunk.hasOwnProperty("full_single_food_database_search_name")) {
      const elapsedTime = new Date().getTime() - currentDateTime.getTime()
      const sanitizedFoodItem = sanitizeFoodItemNutritionFieldsJSON(chunk)
      // It's a single food item
      const foodItemToLog = {
        food_database_search_name: chunk.full_single_food_database_search_name,
        full_item_user_message_including_serving: chunk.full_single_item_user_message_including_serving_or_quantity,
        branded: sanitizedFoodItem.branded,
        brand: sanitizedFoodItem.brand || "",
        timeEaten: new Date(consumedOn.getTime() + elapsedTime).toISOString(),
        upc: sanitizedFoodItem.upc,
        nutritional_information: sanitizedFoodItem.nutritional_information
      } as FoodItemToLog
      foodItemsToLog.push(foodItemToLog)
      console.log("just logged: ", foodItemToLog)
      const loggingTask = AddLoggedFoodItemToQueue(user, user_message, foodItemToLog, foodItemsToLog.length - 1)
      loggingTasks.push(loggingTask)
    } else if (chunk.hasOwnProperty("contains_valid_food_items")) {
      console.log("valid items?", chunk.contains_valid_food_items)
      isBadFoodLogRequest = !chunk.contains_valid_food_items
    }
  }
  // Await for all tasks and get their return values
  const results = await Promise.all(loggingTasks)
  // Update each foodItemToLog with its corresponding database_id
  results.forEach(({ loggedFoodItemId, index }) => {
    foodItemsToLog[index].database_id = loggedFoodItemId
  })
  return { foodItemsToLog, isBadFoodLogRequest }
}

export async function logFoodItemStreamWithImages(
  user: Tables<"User">,
  user_message: Tables<"Message">,
  consumedOn: Date = new Date()
): Promise<{ foodItemsToLog: FoodItemToLog[]; isBadFoodLogRequest: boolean }> {
  const user_images = (await getUserImagesByMessageId(user_message.id)) as Tables<"UserMessageImages">[]
  const user_images_with_signed_urls = await generateSignedUrls(user_images)

  console.log("user_images_with_signed_urls", user_images_with_signed_urls)
  const barcodeDescriptions = await Promise.all(
    user_images_with_signed_urls.map(async (image, index) => {
      if (image && image.signedImageUrl) {
        const barcodeResults = await fetchAndDecodeBarcode(image.signedImageUrl)
        // barcodeResults will be an array, even if only one barcode is found

        if (barcodeResults.length > 0) {
          return barcodeResults
            .map(
              (result) =>
                `Image ${index + 1} contains the barcode ${result.barcode} (${result.type}) in ${result.quadrant}`
            )
            .join("\n") // Join multiple barcodes in the same image with a newline
        }
      }
      return ""
    })
  )

  const barcodeText = barcodeDescriptions.filter((text) => text).join(", ")
  const prompt =
    food_logging_prompt.replace("USER_INPUT_CONTENT", user_message.content) + (barcodeText ? `\n\n${barcodeText}` : "")

  const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
    {
      role: "system",
      content: image_system_prompt
    },
    {
      role: "user",
      content: [
        { type: "text", text: prompt },
        // Filter out any images that are null or do not have a signed URL
        ...((user_images_with_signed_urls ?? [])
          .filter((image) => image && image.signedImageUrl)
          .map((image) => ({
            type: "image_url",
            image_url: {
              url: image?.signedImageUrl,
              detail: "high" as const //
            }
          })) as OpenAI.Chat.ChatCompletionContentPartImage[])
      ]
    }
  ]

  let { foodItemsToLog, isBadFoodLogRequest } = await processOpenAiVisionChatStream(
    user_message,
    messages,
    user,
    consumedOn
  )
  console.log("foodItemsToLog", foodItemsToLog)

  if (isBadFoodLogRequest || foodItemsToLog.length === 0) {
    const rotatedMessages = await createMessagesWithRotatedImages(messages)

    ;({ foodItemsToLog, isBadFoodLogRequest } = await processOpenAiVisionChatStream(
      user_message,
      rotatedMessages,
      user,
      consumedOn
    ))
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
  const message = await getUserMessageById(12050)

  await logFoodItemStreamWithImages(user, message!)
}

// testVisionFoodLoggingStream().then(() => {
//   console.log("Test complete")
//   exit()
// })
