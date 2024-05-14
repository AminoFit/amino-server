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

IMPORTANT:
Output ONLY info for food_name and not any other food. online_food_information may not always contain relevant info and should be used only if the info is useful.
</instructions>

<online_food_information>
ONLINE_FOOD_INFORMATION
</online_food_information>

<json_output_template>
{
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
