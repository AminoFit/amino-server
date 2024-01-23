import { Tables } from "types/supabase-generated.types"
import { LogOpenAiUsage } from "@/languageModelProviders/openai/utils/openAiHelper"
import { createAdminSupabase } from "@/utils/supabase/serverAdmin"
import test from "node:test"

export interface FireworksAPIOptions {
  model?: string
  prompt: string
  systemPrompt?: string
  stop?: string
  temperature?: number
  max_tokens?: number
  prompt_truncate_len?: number
  [key: string]: any
}

export async function* fireworksChatCompletionStream(
  {
    model = "accounts/fireworks/models/mixtral-8x7b-instruct",
    systemPrompt = "You are a helpful assistant.",
    prompt,
    stop = "",
    temperature = 0.1,
    max_tokens = 2048,
    prompt_truncate_len = 2048,
    ...apiOptions
  }: FireworksAPIOptions,
  user: Tables<"User">
): AsyncIterable<string> {
  const apiKey = process.env.FIREWORKS_AI_API_KEY
  const startTime = performance.now() // Record the start time

  const options = {
    method: "POST",
    headers: {
      accept: "text/event-stream",
      "content-type": "application/json",
      authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      messages: [
        {
          role: "system",
          content: systemPrompt
        },
        { role: "user", content: prompt }
      ],
      temperature: 0,
      top_p: 1,
      n: 1,
      frequency_penalty: 0,
      presence_penalty: 0,
      stream: true,
      max_tokens: max_tokens,
      stop: null,
      prompt_truncate_len: prompt_truncate_len,
      model: model,
      ...apiOptions
    })
  }

  const response = await fetch("https://api.fireworks.ai/inference/v1/chat/completions", options)

  if (response.body) {
    const reader = response.body.getReader()
    let partialData = ""

    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      const chunk = new TextDecoder("utf-8").decode(value)
      partialData += chunk

      if (partialData.endsWith("\n\n")) {
        const messages = partialData.split("\n\n")
        for (const message of messages) {
          if (message.startsWith("data: ")) {
            const dataString = message.substring(6)
            if (dataString === "[DONE]") {
              return
            }
            try {
              const data = JSON.parse(dataString)
              if (data.usage) {
                const endTime = performance.now()
                const timeTakenMs = endTime - startTime
                LogOpenAiUsage(user, data.usage, model, "Fireworks", timeTakenMs)
                return
              }
              // console.log(data.choices[0].delta)
              if (data.choices && data.choices[0] && data.choices[0].delta && data.choices[0].delta.content) {
                yield data.choices[0].delta.content
              }
            } catch (error) {
              console.error("Error parsing JSON:", error)
            }
          }
        }
        partialData = ""
      }
    }
  }
}

async function getUserByEmail(email: string) {
  const supabase = createAdminSupabase()
  const { data, error } = await supabase
      .from('User')
      .select('*')
      .eq('email', email);

  if (error) {
      console.error(error);
      return null;
  }

  return data;
}

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
  "contains_valid_food_items": "boolean",
  "food_items": [
    {
      "full_unique_food_database_search_name": "string",
      "full_unique_item_user_message_including_serving_or_quantity": "string",
      "branded": "boolean",
      "brand": "string"
    }
  ]
}

Beginning of JSON output: 
`

async function testFireworks() {
  const user = (await getUserByEmail("seb.grubb@gmail.com"))![0]
  const stream = fireworksChatCompletionStream({ prompt: test_prompt, systemPrompt: "You are a helpful assistant that only replies with valid JSON." }, user)

  for await (const chunk of stream) {
    process.stdout.write(chunk.toString())
    // if (chunk.choices && chunk.choices[0] && chunk.choices[0].delta && chunk.choices[0].delta.content) {
    //   process.stdout.write(chunk.choices[0].delta.content);
    // }
  }
}

testFireworks()
