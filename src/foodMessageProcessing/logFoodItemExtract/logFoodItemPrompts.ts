export const foodExtractionPrompt = {
    systemPrompt: "You are a helpful assistant that only replies in english and valid JSON. Preserve every explicitly mentioned oil, dressing, butter, sauce and topping. Separate a chicken breast from its olive oil-and-vinegar dressing; keep that dressing as one item, and remove it from the chicken description. Each addition must appear exactly once. Never copy the base food's weight or a meal's calorie total onto a side. Do not omit an addition because its portion is uncertain. Decide whether each phrase describes one established product or separate database foods combined by the user. Coffee with Fairlife milk is TWO foods: unbranded coffee and Fairlife milk; Fairlife is the milk brand, not a coffee brand. Likewise split tea with Oatly milk, toast with Kerrygold butter, or oatmeal with a separately named branded topping. Keep a packaged/barcoded product or named cafe drink intact; do not decompose a Starbucks latte into invented ingredients. A component brand must attach only to that component. Do not invent a milk fat percentage or flavour when unspecified. Keep quantities with the component they describe, including postfix wording: coffee with Fairlife milk cup means coffee plus one cup of Fairlife milk; do not copy that cup onto the coffee. Conversely, a cup of coffee with a splash of milk keeps the cup on coffee and the splash on milk.",
    prompt: `<input_to_process>
INPUT_HERE
</input_to_process>

<instructions>
Your task is to analyze a sentence provided by a user (contained within the input_to_process tags), describing their meal for logging purposes. Follow these steps to ensure accurate identification and logging of each food item:

1. Identify Distinct Food Items: Examine the user's sentence and identify each distinct food item. Ensure that each entry corresponds to a unique item that can be found in our food database.

2. Fix any typos: Typos may exist due to fast typing or because the text is a result of voice recognition. If you notice any typos, correct them to the best of your ability. E.g. "one pair" should be corrected to "one pear" or "lin choclate" likely means "lindt chocolate".

3. Separate individual food items: Combine elements only when they naturally constitute a single item, such as in the case of a flavored yogurt, shake and other processed food. For examples ensure that distinct components like a pancake and its topping (e.g., whipped cream) are logged as separate entries. E.g. "yogurt with pineapple" should be 2 items "yogurt" and "pineapple" but "strawberry yogurt" would be one. However "nuts with salt" would be a single item.

4. Determine 'full_single_food_database_search_name': For each identified food item, determine its 'full_single_food_database_search_name'. This name should be specific enough to encompass various forms and preparations of the food (e.g., specify if oats are cooked, or if butter is salted or unsalted). It should contain EVERY single detail the user provided about the food.

5. Include Detailed Serving Information: The 'full_single_item_user_message_including_serving_or_quantity' should include all available information about the specfic item (but not include information about sides since we create a new entry for those), including both explicitly stated and reasonably inferred details like quantity or type (e.g., '100g of full-fat salted butter'). It is fine to assume serving details if not provided.

6. The sum of all items in the full_single_item_user_message_including_serving_or_quantity field should be distinct from all other items and should not overlap or have any duplicates (e.g. if user logged waffle with syrup we would have one entry we "single waffle" and the other "syrup 1 serving" and not "syrup with waffle" and another entry for "syrup".)

7. When in doubt include words in the message as the brand to help with matching e.g. "why lemon bar" would be item: "lemon bar" and brand:"why".

8. For prompts not in english, translate to english in order to get a valid output. You can keep the original name in parentheses.

9. If nutritional information is available, include it in the nutritional_information field. DO NOT include fields you don't know the exact value of or are null.
9a. If a calculation is required you can use an equation string instead of a number. An equation string can only contain + - * / and numbers.</instructions>
<examples>
  <example>
    <input>"Coffee with fairlife milk cup"</input>
    <output>
      {
        "food_items": [
          {
            "full_single_food_database_search_name": "coffee",
            "full_single_item_user_message_including_serving_or_quantity": "coffee, quantity unspecified",
            "branded": false,
            "brand": ""
          },
          {
            "full_single_food_database_search_name": "Fairlife milk",
            "full_single_item_user_message_including_serving_or_quantity": "one cup of Fairlife milk",
            "branded": true,
            "brand": "Fairlife"
          }
        ],
        "contains_valid_food_items": true
      }
    </output>
  </example>

  <example>
    <input>"I like dancing"</input>
    <output>
      {
        "food_items": [],
        "contains_valid_food_items": false
      }
    </output>
  </example>
  
  <example>
    <input>"2% Milk Latte from starbucks with a ripe green apple"</input>
    <output>
      {
        "food_items": [
          {
            "full_single_food_database_search_name": "2% milk latte",
            "full_single_item_user_message_including_serving_or_quantity": "2% milk latte",
            "branded": true,
            "brand": "Starbucks"
          },
          {
            "full_single_food_database_search_name": "ripe green apple",
            "full_single_item_user_message_including_serving_or_quantity": "one ripe green apple",
            "branded": false,
            "brand": ""
          }
        ],
        "contains_valid_food_items": true
      }
    </output>
  </example>
  
  <example>
    <input>"130 cals of chicken breast with olive oil"</input>
    <output>
      {
        "food_items": [
          {
            "full_single_food_database_search_name": "chicken breast",
            "full_single_item_user_message_including_serving_or_quantity": "chicken breast 130 calories",
            "branded": false,
            "brand": "",
            "nutritional_information": {
              "kcal": 130
            }
          },
          {
            "full_single_food_database_search_name": "olive oil",
            "full_single_item_user_message_including_serving_or_quantity": "olive oil (1 tbsp)",
            "branded": false,
            "brand": ""
          }
        ],
        "contains_valid_food_items": true
      }
    </output>
  </example>
  
  <example>
    <input>"200g of Annie Chun's Organic Pork & Vegetable Potstickers"</input>
    <output>
      {
        "food_items": [
          {
            "full_single_food_database_search_name": "Organic Pork & Vegetable Potstickers",
            "full_single_item_user_message_including_serving_or_quantity": "200g of Organic Pork & Vegetable Potstickers",
            "branded": true,
            "brand": "Annie Chun"
          }
        ],
        "contains_valid_food_items": true
      }
    </output>
  </example>
  
  <example>
    <input>"2 mission flour burritos (200 cals per burrito)"</input>
    <output>
      {
        "food_items": [
          {
            "full_single_food_database_search_name": "Mission Flour Burritos",
            "full_single_item_user_message_including_serving_or_quantity": "400 cals of Mission Flour Burritos",
            "branded": true,
            "brand": "Mission Flour",
            "nutritional_information": {
              "kcal": 400
            }
          }
        ],
        "contains_valid_food_items": true
      }
    </output>
  </example>
  
  <example>
    <input>"Ferrero Nutella & Go Hazelnut Spread with Breadsticks"</input>
    <output>
      {
        "food_items": [
          {
            "full_single_food_database_search_name": "Ferrero Nutella & Go Hazelnut Spread with Breadsticks",
            "full_single_item_user_message_including_serving_or_quantity": "1 pack of Nutella & Go Hazelnut Spread with Breadsticks",
            "branded": true,
            "brand": "Ferrero Nutella & Go"
          }
        ],
        "contains_valid_food_items": true
      }
    </output>
  </example>
  
  <example>
    <input>"Starbucks turkey bacon cheddar and egg white sandwich with a starbucks medium fat free latte"</input>
    <output>
      {
        "food_items": [
          {
            "full_single_food_database_search_name": "Turkey Bacon, Cheddar & Egg White Sandwich",
            "full_single_item_user_message_including_serving_or_quantity": "1 Starbucks Turkey Bacon, Cheddar & Egg White Sandwich",
            "branded": true,
            "brand": "Starbucks"
          },
          {
            "full_single_food_database_search_name": "Medium Fat-Free Latte",
            "full_single_item_user_message_including_serving_or_quantity": "1 medium Starbucks fat-free latte",
            "branded": true,
            "brand": "Starbucks"
          }
        ],
        "contains_valid_food_items": true
      }
    </output>
  </example>
  
  <example>
    <input>"deux pommes et une tranche de pain"</input>
    <output>
      {
        "food_items": [
          {
            "full_single_food_database_search_name": "apple (pomme)",
            "full_single_item_user_message_including_serving_or_quantity": "two apples (deux pommes)",
            "branded": false,
            "brand": ""
          },
          {
            "full_single_food_database_search_name": "bread (pain)",
            "full_single_item_user_message_including_serving_or_quantity": "slice of bread (une tranche de pain)",
            "branded": false,
            "brand": ""
          }
        ],
        "contains_valid_food_items": true
      }
    </output>
  </example>
</examples>

<output_instruction>
Your output should be in a JSON format. This format should consist only of the elements related to each food item's name and serving details, as mentioned in steps 3 and 4. Do not include anything else.
</output_instruction>

<json_output_format>
{
  "food_items": [
    {
      "full_single_food_database_search_name": "string",
      "full_single_item_user_message_including_serving_or_quantity": "string",
      "branded": "boolean",
      "brand": "string",
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

Beginning of JSON output:`,
response_schema: {
  name: "food_item_schema",
  description: "Schema for logging food items",
  schema: {
    "type": "object",
    "properties": {
      "food_items": {
        "type": "array",
        "items": {
          "type": "object",
          "properties": {
            "full_single_food_database_search_name": {
              "type": "string"
            },
            "full_single_item_user_message_including_serving_or_quantity": {
              "type": "string"
            },
            "branded": {
              "type": "boolean"
            },
            "brand": {
              "type": "string"
            },
            "nutritional_information": {
              "type": "object",
              "properties": {
                "kcal": {
                  "type": ["number", "string"]
                },
                "totalFatG": {
                  "type": ["number", "string"]
                },
                "satFatG": {
                  "type": ["number", "string"]
                },
                "transFatG": {
                  "type": ["number", "string"]
                },
                "carbG": {
                  "type": ["number", "string"]
                },
                "fiberG": {
                  "type": ["number", "string"]
                },
                "sugarG": {
                  "type": ["number", "string"]
                },
                "proteinG": {
                  "type": ["number", "string"]
                },
                "waterMl": {
                  "type": ["number", "string"]
                },
                "vitaminAMcg": {
                  "type": ["number", "string"]
                },
                "vitaminCMg": {
                  "type": ["number", "string"]
                },
                "vitaminDMcg": {
                  "type": ["number", "string"]
                },
                "vitaminEMg": {
                  "type": ["number", "string"]
                },
                "vitaminKMcg": {
                  "type": ["number", "string"]
                },
                "vitaminB1Mg": {
                  "type": ["number", "string"]
                },
                "vitaminB2Mg": {
                  "type": ["number", "string"]
                },
                "vitaminB3Mg": {
                  "type": ["number", "string"]
                },
                "vitaminB5Mg": {
                  "type": ["number", "string"]
                },
                "vitaminB6Mg": {
                  "type": ["number", "string"]
                },
                "vitaminB7Mcg": {
                  "type": ["number", "string"]
                },
                "vitaminB9Mcg": {
                  "type": ["number", "string"]
                },
                "vitaminB12Mcg": {
                  "type": ["number", "string"]
                },
                "calciumMg": {
                  "type": ["number", "string"]
                },
                "ironMg": {
                  "type": ["number", "string"]
                },
                "magnesiumMg": {
                  "type": ["number", "string"]
                },
                "phosphorusMg": {
                  "type": ["number", "string"]
                },
                "potassiumMg": {
                  "type": ["number", "string"]
                },
                "sodiumMg": {
                  "type": ["number", "string"]
                },
                "cholesterolMg": {
                  "type": ["number", "string"]
                },
                "caffeineMg": {
                  "type": ["number", "string"]
                },
                "alcoholG": {
                  "type": ["number", "string"]
                }
              },
              "additionalProperties": false
            }
          },
          "required": [
            "full_single_food_database_search_name",
            "full_single_item_user_message_including_serving_or_quantity",
            "branded",
            "brand"
          ],
          "additionalProperties": false
        }
      },
      "contains_valid_food_items": {
        "type": "boolean"
      }
    },
    "required": [
      "food_items",
      "contains_valid_food_items"
    ],
    "additionalProperties": false
  }
}


  }
