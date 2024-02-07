import { callAnyscaleApi } from "./models/anyscale"
import callDeepInfraAPI from "./models/deep_infra"
import { callFireworksAPI } from "./models/fireworks"
import { callMistralApi } from "./models/mistral"
import callOpenRouterAPI from "./models/open_router"

const test_prompt = `
Your task is to analyze a sentence provided by a user, describing their meal for logging purposes. Follow these steps to ensure accurate identification and logging of each food item:

1. Identify Distinct Food Items: Examine the user's sentence and identify each distinct food item. Ensure that each entry corresponds to a unique item that can be found in our food database.

2. Seperate elements: Combine elements only when they naturally constitute a single item, such as in the case of a flavored yogurt. For examples ensure that distinct components like a pancake and its topping (e.g., whipped cream) are logged as separate entries.

3. Determine 'full_food_database_search_name': For each identified food item, determine its 'full_food_database_search_name'. This name should be specific enough to encompass various forms and preparations of the food (e.g., specify if oats are cooked, or if butter is salted or unsalted).

4. Include Detailed Serving Information: The 'full_item_user_message_including_serving' should include all available information about the item, including both explicitly stated and reasonably inferred details like quantity or type (e.g., '100g of full-fat salted butter'). It is fine to assume serving details if not provided.

Output Format: Your output should be in a JSON format. This format should consist only of the elements related to each food item's name and serving details, as mentioned in steps 3 and 4. Avoid including any additional information or commentary outside of this JSON structure.

INPUT_TO_PROCESS:
"two avocado tuna rolls with two salmon avocado rolls and a side of miso soup and a starbucks latte"

Expected JSON Output:
{"food_items":
{
"full_food_database_search_name": string,
"full_item_user_message_including_serving": string,
"branded": boolean,
"brand": string
}[]}
Beginning of JSON output: 
`
async function mistralTest() {
  const stream = callMistralApi(test_prompt, 'mistral-small');

  let lastDelta;
  let lastUsage;
  let startTime = Date.now();

  for await (const chunk of stream) {
    // Process the chunk as needed
    // console.log(chunk.delta);
    if (chunk.usage) {
      lastUsage = chunk.usage;
    }
    lastDelta = chunk.choices[0].delta.content;
    process.stdout.write(chunk.choices[0].delta.content);
    // console.log(lastDelta);
  }

  console.log(lastDelta);
  console.log(lastUsage);

  const endTime = Date.now();
  const elapsedTimeInSeconds = (endTime - startTime) / 1000;
  const tokensPerSecond = lastUsage.completion_tokens / elapsedTimeInSeconds;

  console.log('Tokens per second:', tokensPerSecond);
}

async function anyscaleTest() {
  const stream = callAnyscaleApi(test_prompt, "mistralai/Mixtral-8x7B-Instruct-v0.1");

  for await (const chunk of stream) {
    if (chunk.choices && chunk.choices[0] && chunk.choices[0].delta && chunk.choices[0].delta.content) {
      // Only process and output the chunk if the content property exists
      process.stdout.write(chunk.choices[0].delta.content);
    }
  }
}

function deepInfraTest() {
  const stream = callDeepInfraAPI(test_prompt, true, "mistralai/Mixtral-8x7B-Instruct-v0.1");

  stream.then((result) => {
    console.log(result)
  })
}

async function testFireworks() {
  const stream = callFireworksAPI(test_prompt);

  for await (const chunk of stream) {
    if (chunk.choices && chunk.choices[0] && chunk.choices[0].delta && chunk.choices[0].delta.content) {
      process.stdout.write(chunk.choices[0].delta.content);
    }
  }
}

// mistralTest()
// anyscaleTest()
// deepInfraTest()
testFireworks()
