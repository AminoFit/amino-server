import { error } from "console"
import { chatCompletion } from "./chatCompletion"
import { ChatCompletionRequestMessage, ChatCompletionFunctions } from "openai"
import { FoodInfo } from "./foodItemInterface"

function checkType(actual: any, expected: any) {
  if (expected === "array") return Array.isArray(actual)
  else if (expected === "object")
    return actual !== null && typeof actual === "object"
  else if (expected === "integer")
    return Number.isInteger(actual) || Number.isInteger(parseFloat(actual))
  else return typeof actual === expected
}

export function checkCompliesWithSchema(
  schema: { [key: string]: any },
  obj: any
) {
  if (!schema || typeof obj !== "object" || obj === null) {
    console.error(`The input object is either null or not an object.`)
    return false
  }

  // Check if required fields are in the object and they have the correct types
  for (const field of schema.required || []) {
    if (!(field in obj)) {
      console.error(`The required field ${field} is missing from the object.`)
      return false
    }

    if (!checkType(obj[field], schema.properties[field].type)) {
      console.error(
        `The field ${field} is of incorrect type (${typeof obj[
          field
        ]}). Expected ${schema.properties[field].type}.`
      )
      return false
    }

    // If it's an object or an array, do a recursive check
    if (schema.properties[field].type === "object") {
      // Make sure to check the properties of the object
      if (
        !checkCompliesWithSchema(
          schema.properties[field].properties,
          obj[field]
        )
      ) {
        console.error(`The object ${field} does not comply with its schema.`)
        return false
      }
    } else if (schema.properties[field].type === "array") {
      // Check each object in the array
      for (const item of obj[field]) {
        if (!checkCompliesWithSchema(schema.properties[field].items, item)) {
          console.error(
            `An item in the array ${field} does not comply with its schema.`
          )
          return false
        }
      }
    }
  }

  return true
}

export async function foodItemCompletion(inquiry: string): Promise<any> {
  if (!inquiry) {
    throw new Error("Bad prompt")
  }

  const system =
    "You are a helpful bot that responds with nutritional information about food items. This is done by calling the get_food_information function. You respond using grams as default unit, unless not possible."

  const functions: ChatCompletionFunctions[] = [
    {
      name: "get_food_info",
      description: "Get food info, normalized to 100g if possible.",
      parameters: {
        type: "object",
        properties: {
          food_info: {
            type: "array",
            items: {
              type: "object",
              properties: {
                name: {
                  type: "string",
                  description: "Food item name"
                },
                brand: {
                  type: "string",
                  nullable: true,
                  description: "Brand name, if applicable"
                },
                known_as: {
                  type: "array",
                  items: { type: "string" },
                  description: "Other names for the food"
                },
                food_description: {
                  type: "string",
                  nullable: true,
                  description: "Food description"
                },
                default_serving_size: {
                  type: "integer",
                  description: "Default serving size (100g recommended)"
                },
                default_serving_unit: {
                  type: "string",
                  description: "Default serving unit (g recommended)"
                },
                default_serving_weight_g: {
                  type: "integer",
                  nullable: true,
                  description: "Serving weight in g if not in g"
                },
                kcal_per_serving: {
                  type: "number",
                  description: "Calories (g)/serving"
                },
                total_fat_per_serving: {
                  type: "number",
                  description: "Total fat (g)/serving"
                },
                sat_fat_per_serving: {
                  type: "number",
                  nullable: true,
                  description: "Saturated fat (g)/serving"
                },
                trans_fat_per_serving: {
                  type: "number",
                  nullable: true,
                  description: "Trans fat (g)/serving"
                },
                carb_per_serving: {
                  type: "number",
                  description: "Carb (g)/serving"
                },
                sugar_per_serving: {
                  type: "number",
                  nullable: true,
                  description: "Sugar (g)/serving"
                },
                added_sugar_per_serving: {
                  type: "number",
                  nullable: true,
                  description: "Added sugar (g)/serving"
                },
                protein_per_serving: {
                  type: "number",
                  description: "Protein (g)/serving"
                },
                nutrients: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      nutrient_name: {
                        type: "string",
                        description:
                          "Nutrient name (e.g. Sodium, Potassium, Vitamin C)"
                      },
                      nutrient_unit: {
                        type: "string",
                        description: "Nutrient unit (mg, mcg, IU, etc.)"
                      },
                      nutrient_amount_per_g: {
                        type: "number",
                        description: "Nutrient amount/g of food"
                      }
                    }
                  },
                  description: "Nutrient information"
                },
                servings: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      serving_weight_g: {
                        type: "number",
                        description: "Serving weight in grams"
                      },
                      serving_name: {
                        type: "string",
                        description: "Serving description e.g. 1 large banana"
                      }
                    }
                  },
                  description: "Serving sizes & descriptions"
                }
              },
              required: [
                "name",
                "default_serving_size",
                "default_serving_unit",
                "kcal_per_serving",
                "protein_per_serving",
                "carb_per_serving",
                "total_fat_per_serving"
              ]
            }
          }
        },
        required: ["food_info"]
      }
    }
  ]

  let result: any = {}

  let messages: ChatCompletionRequestMessage[] = [
    { role: "system", content: system },
    { role: "user", content: inquiry }
  ]
  let model = "gpt-3.5-turbo-0613"
  let max_tokens = 2048
  let temperature = 0.0

  try {
    result = await chatCompletion({
      messages,
      functions,
      model,
      temperature,
      max_tokens
    })
    // console.log("Schema", functions[0].parameters)
    //console.log("Result Args", JSON.parse(result.function_call.arguments))

    if (
      !checkCompliesWithSchema(
        functions[0].parameters!,
        JSON.parse(result.function_call.arguments)
      )
    ) {
      temperature = 1.0 // Update temperature
      model = "gpt-4-0613" // Update model
      max_tokens = 4096 // Update max tokens
      // Retry chatCompletion with updated temperature
      result = await chatCompletion({
        messages,
        functions,
        model,
        temperature,
        max_tokens
      })
    }
    if (
      !checkCompliesWithSchema(
        functions[0].parameters!,
        JSON.parse(result.function_call.arguments)
      )
    ) {
      throw error("Could not find food item")
    }
    return JSON.parse(result.function_call.arguments)
  } catch (error) {
    throw error
  }
}
