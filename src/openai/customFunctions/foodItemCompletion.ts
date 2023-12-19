import { chatCompletion } from "./chatCompletion"
import OpenAI from "openai"
import { FoodInfo } from "./foodItemInterface"
import { checkCompliesWithSchema } from "../utils/openAiHelper"
import { mapOpenAiFoodInfoToFoodItem } from "src/openai/customFunctions/foodItemInterface"
import { Tables } from "types/supabase"

const SPECIAL_CASES = ["water", "diet", "tea"]

function isSpecialCase(name: string): boolean {
  const lowerCaseName = name.toLowerCase()
  return SPECIAL_CASES.some((caseItem) => lowerCaseName.includes(caseItem))
}

function checkFoodHasNonZeroValues(food: FoodInfo): boolean {
  // Check if all values are zero
  if (
    food.default_serving_weight_g === 0 &&
    food.kcal_per_serving === 0 &&
    food.total_fat_per_serving === 0 &&
    food.carb_per_serving === 0 &&
    food.protein_per_serving === 0
  ) {
    console.log("Invalid food entry due to all zero values:", food.name)
    return false
  }

  // If there are macros but no calories (or vice versa)
  if (
    (food.total_fat_per_serving > 0 || food.carb_per_serving > 0 || food.protein_per_serving > 0) &&
    food.kcal_per_serving === 0
  ) {
    console.log("Invalid food entry due to non-zero macros but zero calories:", food.name)
    return false
  }

  // If there are calories but no macros
  if (
    food.kcal_per_serving > 0 &&
    food.total_fat_per_serving === 0 &&
    food.carb_per_serving === 0 &&
    food.protein_per_serving === 0
  ) {
    console.log("Invalid food entry due to calories but zero macros:", food.name)
    return false
  }

  // If the food has grams but all its macros and calories are 0 (and it's not a special case)
  if (
    food.default_serving_weight_g! > 0 &&
    !isSpecialCase(food.name) &&
    food.kcal_per_serving === 0 &&
    food.total_fat_per_serving === 0 &&
    food.carb_per_serving === 0 &&
    food.protein_per_serving === 0
  ) {
    console.log("Invalid food entry due to 0 macros & calories with grams:", food.name)
    return false
  }

  return true
}
function addDefaultValues(foodItemInfo: any) {
  foodItemInfo.total_fat_per_serving = foodItemInfo.total_fat_per_serving || 0
  foodItemInfo.sat_fat_per_serving = foodItemInfo.sat_fat_per_serving || 0
  foodItemInfo.trans_fat_per_serving = foodItemInfo.trans_fat_per_serving || 0
  foodItemInfo.carb_per_serving = foodItemInfo.carb_per_serving || 0
  foodItemInfo.sugar_per_serving = foodItemInfo.sugar_per_serving || 0
  foodItemInfo.added_sugar_per_serving = foodItemInfo.added_sugar_per_serving || 0
  foodItemInfo.protein_per_serving = foodItemInfo.protein_per_serving || 0

  return foodItemInfo
}

export async function foodItemCompletion(inquiry: string, user: Tables<"User">): Promise<any> {
  if (!inquiry) {
    throw new Error("Bad prompt")
  }

  const system =
    "You are a helpful bot that responds with nutritional information about food items. This is done by calling the get_food_information function. You respond normalising everything to 100 grams (e.g. calories per 100g), unless not possible. You will include the standard servings in the appropriate array. Kcal, Carb, Fat, Protein and Gram values cannot be 0 unless it is a calorie free item"

  const functions: OpenAI.Chat.ChatCompletionCreateParams.Function[] = [
    {
      name: "get_food_info",
      description: "Food info, use 100g if no standard serving size.",
      parameters: {
        type: "object",
        properties: {
          name: {
            type: "string",
            description: "Food item name. Use the single version of the food item (e.g. apple instead of apples)"
          },
          brand: {
            type: "string",
            nullable: true,
            description: "Brand name, if applicable. Leave empty if unknown"
          },
          known_as: {
            type: "array",
            items: { type: "string" },
            description: "Other names for the food, array of strings"
          },
          food_description: {
            type: "string",
            nullable: true,
            description: "Food description"
          },
          default_serving_weight_g: {
            type: "integer",
            description: "Weight of standard in g, 100g otherwise"
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
          fiber_per_serving: {
            type: "number",
            description: "Fiber (g)/serving"
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
                  description: "Nutrient name (e.g. Sodium, Potassium, Vitamin C)"
                },
                nutrient_unit: {
                  type: "string",
                  description: "Nutrient unit (mg, mcg, IU, etc.)"
                },
                nutrient_amount_per_serving: {
                  type: "number",
                  description: "Nutrient amount/serving of food"
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
                  description: "Serving description e.g. large, scoop, plate"
                },
                serving_alternate_amount: {
                  type: "number",
                  description: "Amount of the serving. Eg 2 oz, 28 almonds, 1 cup"
                }
              }
            },
            description: "Serving sizes & descriptions"
          }
        },
        required: [
          "name",
          "default_serving_weight_g",
          "kcal_per_serving",
          "protein_per_serving",
          "carb_per_serving",
          "total_fat_per_serving",
          "servings"
        ]
      }
    }
  ]

  let result: any = {}

  let messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
    { role: "system", content: system },
    { role: "user", content: inquiry }
  ]
  let model = "gpt-4-0613" //"gpt-3.5-turbo-0613"
  let max_tokens = 2048
  let temperature = 0.05

  try {
    result = await chatCompletion(
      {
        messages,
        functions,
        model,
        temperature,
        max_tokens
      },
      user
    )

    // Log the OpenAI usage with the LogOpenAiUsage function
    //console.log("result", JSON.stringify(result))
    // console.log("Schema", functions[0].parameters)
    //console.log("Result Args", JSON.parse(result.function_call.arguments))
    let foodItemInfo = JSON.parse(result.function_call.arguments)
    foodItemInfo = addDefaultValues(foodItemInfo)

    let has_valid_schema = checkCompliesWithSchema(functions[0].parameters!, foodItemInfo)
    let has_valid_data = checkFoodHasNonZeroValues(foodItemInfo)

    if (!has_valid_data || !has_valid_schema) {
      console.log("Invalid food item, retrying with different parameters")
      temperature = 0.1 // Update temperature
      model = "gpt-4-0613" // Update model
      max_tokens = 4096 // Update max tokens

      // add extra text to prompt
      const new_inquiry =
        inquiry +
        "\nOld result may have contained invalid structure such as missing fields or missing nutritional values. Double check yourself."
      messages = [
        { role: "system", content: system },
        { role: "user", content: new_inquiry }
      ]

      // Retry chatCompletion with updated temperature
      result = await chatCompletion(
        {
          messages,
          functions,
          model,
          temperature,
          max_tokens
        },
        user
      )
      console.log("Second retry", result.function_call.arguments)
    }
    foodItemInfo = JSON.parse(result.function_call.arguments)
    foodItemInfo = addDefaultValues(foodItemInfo)

    // check again for schema and data
    has_valid_data = checkFoodHasNonZeroValues(foodItemInfo)
    has_valid_schema = checkCompliesWithSchema(functions[0].parameters!, foodItemInfo)
    if (!has_valid_data || !has_valid_schema) {
      throw console.error("Could not find food item")
    }
    return {
      foodItemInfo: foodItemInfo,
      model: model
    }
  } catch (error) {
    throw error
  }
}

async function testRun() {
  const user: Tables<"User"> = {
    id: "clklnwf090000lzssqhgfm8kr",
    fullName: "John",
    email: "john.doe@example.com",
    phone: "123-456-7890",
    dateOfBirth: new Date("1990-01-01T00:00:00").toISOString(),
    weightKg: 70.5,
    heightCm: 180,
    calorieGoal: 2000,
    proteinGoal: 100,
    carbsGoal: 200,
    fatGoal: 50,
    fitnessGoal: "Maintain",
    unitPreference: "IMPERIAL",
    setupCompleted: false,
    sentContact: false,
    sendCheckins: false,
    tzIdentifier: "America/New_York",
    avatarUrl: null,
    emailVerified: null,
    activityLevel: null,
  }
  const result = await foodItemCompletion("cooked apple pie", user)
  console.log(mapOpenAiFoodInfoToFoodItem(result.foodItemInfo, result.model))
}

//testRun()
