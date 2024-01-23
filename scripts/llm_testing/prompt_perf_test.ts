import { callAnyscaleApi } from "./models/anyscale"
import callDeepInfraAPI from "./models/deep_infra"
import { callMistralApi } from "./models/mistral"
import callOpenRouterAPI from "./models/open_router"

const test_prompt = `
Your task is to analyze a sentence provided by a user, describing their meal for logging purposes. Follow these steps to ensure accurate identification and logging of each food item:

1. Identify Distinct Food Items: Examine the user's sentence and identify each distinct food item. Ensure that each entry corresponds to a unique item that can be found in our food database.

2. Seperate elements: Combine elements only when they naturally constitute a single item, such as in the case of a flavored yogurt. For examples ensure that distinct components like a pancake and its topping (e.g., whipped cream) are logged as separate entries.

3. Determine 'full_food_database_search_name': For each identified food item, determine its 'full_food_database_search_name'. This name should be specific enough to encompass various forms and preparations of the food (e.g., specify if oats are cooked, or if butter is salted or unsalted).

4. Include Detailed Serving Information: The 'full_item_user_message_including_serving' should include all available information about the item, including both explicitly stated and reasonably inferred details like quantity or type (e.g., '100g of full-fat salted butter').

Output Format: Your output should be in a JSON format. This format should consist only of the elements related to each food item's name and serving details, as mentioned in steps 3 and 4. Avoid including any additional information or commentary outside of this JSON structure.

INPUT_TO_PROCESS:
"Five apples with a starbucks latter with 2% milk and a waffle with maple syrup"

Expected JSON Output:
{"food_items":
{
"full_food_database_search_name": string,
"full_item_user_message_including_serving": string,
"branded": boolean,
"brand": string,
"total_eaten_item_macros_estimate":{
"calories": number,
}
}[]}
Beginning of JSON output: 
`
async function test() {
  const result = await callMistralApi("say test")
  console.log(result.choices[0].message)
}

test()
