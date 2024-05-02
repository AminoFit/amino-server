export const missingFoodInfoPromptsByModel = {
  "gpt-4": {
    systemPrompt:
      "You are a useful food assistant that knows all about food item nutritional info. You output in perfect JSON.",
    prompt: `<current_food_info>
FOOD_INFO_HERE
</current_food_info>

<instructions>
The item current_food_info is missing some information that is marked as null. Using reasonable guesses and the available info, output in perfect JSON format all info about.

Rules:
1. Use the reasoning field to reason on the best strategy.
2. Identify all the empty/null fields we need to guess info about.
3. For each missing field we can either guess the best value or use extra info provided to have an equation to calculate the field value. Take time to correctly think about this to effectively fill the null fields. Make sure to correctly normalize/adjust for what the serving size is.

E.g. if we know something has 15 servings per pack and weights 4oz we know that each serving is 4 * 28.34 / 15. We then look at the default serving size (e.g. 8) and can estimate the weight (4 * 28.34 / 15 * 8 in this case). Be aware that for eg one pack may have multiple servings so we need to think about this.
4. Once we figured out a good strategy for what seems reasonable output a value or equation for fields that need filling out.
4a. fields with number | string must either be a number or a string with an evaluable expression.
EXTREMELY IMPORTANT:

Equation fields can ONLY contain ( ) + - * / and numbers and cannot contain any variables or functions.
</instructions>

<extra_info>
EXTRA_ONLINE_INFO
</extra_info>

<output_instruction>
description: a one sentence description of the food item with a focus on the main ingredients and nutritional content.
serving_alternate_unit: unit of the serving in the serving_alternate_amount (e.g. in oz instead of g) - leave blank if not applicable
serving_alternate_amount: the amount of the serving in the serving_alternate_unit (e.g. in oz instead of g) - leave blank if not applicable
default_serving_amount_ml" can be null if the item is not liquid. otherwise string (equation) or number
default_serving_amount_grams: the weight of the default serving in grams and can be a simple expression, if the item is liquid we can try to estimate the weight based on the density of the liquid. 
</output_instruction>

<json_output_format>
{
    reasoning: string | null
    default_serving_amount_grams: number | string,
    default_serving_amount_ml: number | string | null,
    description: string,
    serving: {
        serving_id: number,
        serving_name: string,
        serving_weight_grams: number | string,
        serving_default_serving_amount: number,
        serving_alternate_amount: number,
        serving_alternate_unit: string,
    }[]
}
</json_output_format>
    `
  },
  "llama3-70b": {
    systemPrompt: "You are a useful food assistant that knows all about food item nutritional info. You reply in JSON only with no comments or other text.",
    prompt: `<current_food_info>
FOOD_INFO_HERE
</current_food_info>

<instructions>
The item current_food_info is missing some information that is marked as null. Using reasonable guesses and the available info, output in perfect JSON format all info about.

Rules:
1. Use the reasoning field to reason on the best strategy.
2. Identify all the empty/null fields we need to guess info about.
3. For each missing field we can either guess the best value or use extra info provided to have an equation to calculate the field value. Take time to correctly think about this to effectively fill the null fields. Make sure to correctly normalize/adjust for what the serving size is.

E.g. if we know something has 15 servings per pack and weights 4oz we know that each serving is 4 * 28.34 / 15. We then look at the default serving size (e.g. 8) and can estimate the weight (4 * 28.34 / 15 * 8 in this case). Be aware that for eg one pack may have multiple servings so we need to think about this.
4. Once we figured out a good strategy for what seems reasonable output a value or equation for fields that need filling out.
4a. fields with number | string must either be a number or a string with an evaluable expression.
EXTREMELY IMPORTANT:

Equation fields can ONLY contain ( ) + - * / and numbers and cannot contain any variables or functions.
</instructions>

<extra_info>
EXTRA_ONLINE_INFO
</extra_info>

<output_instruction>
description: a one sentence description of the food item with a focus on the main ingredients and nutritional content.
serving_alternate_unit: unit of the serving in the serving_alternate_amount (e.g. in oz instead of g) - leave blank if not applicable
serving_alternate_amount: the amount of the serving in the serving_alternate_unit (e.g. in oz instead of g) - leave blank if not applicable
default_serving_amount_ml" can be null if the item is not liquid. otherwise string (equation) or number
default_serving_amount_grams: the weight of the default serving in grams and can be a simple expression, if the item is liquid we can try to estimate the weight based on the density of the liquid. 
</output_instruction>

<json_output_format>
{
    reasoning: string | null
    default_serving_amount_grams: number | string,
    default_serving_amount_ml: number | string | null,
    description: string,
    serving: {
        serving_id: number,
        serving_name: string,
        serving_weight_grams: number | string,
        serving_default_serving_amount: number,
        serving_alternate_amount: number,
        serving_alternate_unit: string,
    }[]
}
</json_output_format>
`}
}
