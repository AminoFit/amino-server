export const getFullFoodInformationOnlinePrompts = {
  "gpt-4": {
    systemPrompt: "You are a helpful assistant that only replies in valid JSON.",
    prompt: `<food_name>
FOOD_NAME
</food_name>

<instructions>
1. Using both common knowledge and provided nutritional information found in online_food_information (serving weight g/ml plus all calories, fat, etc. info) from food_name(FOOD_NAME), output in JSON all the nutritional values for the food.
1a. If the food_name does not contain a brand then assume the brand is empty.
1b. For international items include name in english and the native language if needed. Description should be in english too.

2. Since metric values are required you may express them as an equation. E.g. if you know an item is 3 oz you can output
serving_default_size_g: "3*28.3495" (3 oz in grams)
2a. If you are dealing with a liquid and you know the density of the liquid you can output this in the grams field e.g. for 200ml of whole milk with density of 1.035 g/mL we would output "200*1.035" in grams.

3. When you cannot estimate a value, output null but if it is 0, output 0 (e.g. for chicken we would set sugarPerServing to 0 since we know there is no sugar in chicken).

4. If provided info does not match food_name feel free to ignore it.

5. Use the reasoning field to explain why you are choosing certain values and how you are calculating them as well as to do a quick sanity check on the nutritional values to be sure they aren't too high or low and conform to expected calorie density.
5a. It is possible the food_name is not a valid item with nutritional value. In this case output "isValidFoodItem": false. Some items may not be considered food in the classic way but still have nutritional value so we can consider them as valid.

IMPORTANT:
Output ONLY info for food_name and not any other food. online_food_information may not always contain relevant info and should be used only if the info is useful.
Also remember that:
- fat is about 9 cals/gram
- carbs are about 4 cals/gram
- protein is about 4 cals/gram
- alcohol is about 7 cals/gram
So you can use that to make sure values are correct.
Also in general most foods calorific density are at most 9 cals/gram so you can use that to make sure values are correct.
</instructions>

<online_food_information>
ONLINE_FOOD_INFORMATION
</online_food_information>

<json_output_template>
{
"reasoning":"string",
"isValidFoodItem": "boolean",
"name": "string",
"brand": "string",
"description": "string",
"serving_default_size_g": "number | string",
"is_liquid": "bool",
"serving_default_size_ml": "number | string | null",
"kcalPerServing": "number",
"totalFatPerServing": "number",
"satFatPerServing": "number | null",
"transFatPerServing": "number | null",
"carbPerServing": "number",
"sugarPerServing": "number | null",
"addedSugarPerServing": "number | null",
"proteinPerServing": "number",
"UPC": "number | null",
"fiberPerServing": "number | null",
"Serving": [
    {
    "serving_size_g": "number",
    "serving_name": "string",
    "servingAlternateAmount": "number | null",
    "servingAlternateUnit": "string | null"
    }
]
}
</json_output_template>`
  }
}
