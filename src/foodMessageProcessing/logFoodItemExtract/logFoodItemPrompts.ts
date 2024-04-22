export const foodItemPrompts = {
    "llama3-70b":{
        systemPrompt: "You are a helpful food logging assistant that only replies in valid JSON.",
        prompt: `Your task is to analyze a sentence provided by a user, describing their meal for logging purposes. Follow these steps to ensure accurate identification and logging of each food item:
        
        1. Identify Distinct Food Items: Examine the user's sentence and identify each distinct food item. Ensure that each entry corresponds to a unique item that can be found in our food database.
        
        2. Fix any typos: Typos may exist due to fast typing or because the text is a result of voice recognition. If you notice any typos, correct them to the best of your ability. E.g. "one pair" should be corrected to "one pear" or "lin choclate" likely means "lindt chocolate".
        
        3. Seperate elements: Combine elements only when they naturally constitute a single item, such as in the case of a flavored yogurt. For examples ensure that distinct components like a pancake and its topping (e.g., whipped cream) are logged as separate entries.
        
        4. Determine 'full_single_food_database_search_name': For each identified food item, determine its 'full_single_food_database_search_name'. This name should be specific enough to encompass various forms and preparations of the food (e.g., specify if oats are cooked, or if butter is salted or unsalted).
        
        5. Include Detailed Serving Information: The 'full_single_item_user_message_including_serving_or_quantity' should include all available information about the specfic item (but not include information about sides since we create a new entry for those), including both explicitly stated and reasonably inferred details like quantity or type (e.g., '100g of full-fat salted butter'). It is fine to assume serving details if not provided.
        
        6. The sum of all items in the full_single_item_user_message_including_serving_or_quantity field should seperately add up to the total meal logged and should not overlap or have any duplicates.
        
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
    },
    "gpt-3.5-turbo-0125":{
        systemPrompt: "You are a helpful assistant that only replies in valid JSON.",
        prompt: `Your task is to analyze a sentence provided by a user, describing their meal for logging purposes. Follow these steps to ensure accurate identification and logging of each food item:
        
        1. Identify Distinct Food Items: Examine the user's sentence and identify each distinct food item. Ensure that each entry corresponds to a unique item that can be found in our food database.
        
        2. Fix any typos: Typos may exist due to fast typing or because the text is a result of voice recognition. If you notice any typos, correct them to the best of your ability. E.g. "one pair" should be corrected to "one pear" or "lin choclate" likely means "lindt chocolate".
        
        3. Seperate elements: Combine elements only when they naturally constitute a single item, such as in the case of a flavored yogurt. For examples ensure that distinct components like a pancake and its topping (e.g., whipped cream) are logged as separate entries.
        
        4. Determine 'full_single_food_database_search_name': For each identified food item, determine its 'full_single_food_database_search_name'. This name should be specific enough to encompass various forms and preparations of the food (e.g., specify if oats are cooked, or if butter is salted or unsalted).
        
        5. Include Detailed Serving Information: The 'full_single_item_user_message_including_serving_or_quantity' should include all available information about the specfic item (but not include information about sides since we create a new entry for those), including both explicitly stated and reasonably inferred details like quantity or type (e.g., '100g of full-fat salted butter'). It is fine to assume serving details if not provided.
        
        6. The sum of all items in the full_single_item_user_message_including_serving_or_quantity field should seperately add up to the total meal logged and should not overlap or have any duplicates.
        
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
    }
}