import { chatCompletion } from "./chatCompletion"
import OpenAI from "openai"
import { FoodItemWithNutrientsAndServing } from "../../app/dashboard/utils/FoodHelper"
import { checkCompliesWithSchema } from "../utils/openAiHelper"
import { Tables } from "types/supabase"

const foodItemMissingFieldCompleteProperties = {
  type: "object",
  properties: {
    liquid_density_if_liquid: { type: "number" },
    default_serving_weight_g: {
      type: "number",
      description: "Know or inferred weight. Cannot be 0 or null. Must be greater than sum(carbs,fat,protein)"
    },
    servings: {
      type: "array",
      items: {
        type: "object",
        properties: {
          serving_id: { type: "number" },
          serving_weight_gram: {
            type: "number",
            description: "Know or inferred weight. Cannot be 0 or null."
          }
        },
        required: ["serving_id", "serving_weight_gram"]
      },
      required: ["servings"]
    }
  },
  required: ["default_serving_weight_g", "servings"]
}

interface AutocompleteServing {
  serving_id: number
  serving_weight_gram: number // Known or inferred weight. Cannot be 0 or null.
}

interface AutocompleteFoodItem {
  liquid_density_if_liquid?: number // Optional because it's not in the "required" field of JSON Schema
  default_serving_weight_g: number // Known or inferred weight. Cannot be 0 or null. Must be greater than sum(carbs,fat,protein)
  alternate_name: string // other names for the item
  servings: AutocompleteServing[] // Array of "Serving" interface
}

const generateServingString = (foodItem: FoodItemWithNutrientsAndServing) => {
  const filteredServings = foodItem.Serving.filter((serving: any) => serving.servingWeightGram === null).slice(0, 3)

  let inquiry = filteredServings
    .map(
      (serving: any) => `---
servingId: ${serving.id}
servingName: ${serving.servingName}
servingAlternateAmount: ${serving.servingAlternateAmount}
servingAlternateUnit: ${serving.servingAlternateUnit}`
    )
    .join("\n")

  return inquiry
}

const updateFoodItem = (
  foodItem: FoodItemWithNutrientsAndServing,
  autocompleteResults: AutocompleteFoodItem
): FoodItemWithNutrientsAndServing => {
  // Update default_serving_weight_g
  if (autocompleteResults.default_serving_weight_g !== null) {
    foodItem.defaultServingWeightGram = autocompleteResults.default_serving_weight_g
    foodItem.weightUnknown = false
  }

  if (foodItem.isLiquid && foodItem.defaultServingLiquidMl && autocompleteResults.liquid_density_if_liquid) {
    if (autocompleteResults.liquid_density_if_liquid > 0.5 && autocompleteResults.liquid_density_if_liquid < 1.5) {
      foodItem.defaultServingWeightGram = foodItem.defaultServingLiquidMl * autocompleteResults.liquid_density_if_liquid
    }
  }

  // Update servings
  foodItem.Serving = foodItem.Serving.map((serving: any) => {
    const newServing = autocompleteResults.servings.find((r) => r.serving_id === serving.id)
    if (newServing) {
      serving.servingWeightGram = newServing.serving_weight_gram
    }
    return serving
  })

  return foodItem
}

export async function foodItemMissingFieldComplete(
  foodItem: FoodItemWithNutrientsAndServing,
  user: Tables<"User">
): Promise<FoodItemWithNutrientsAndServing> {
  console.log("Food Item is missing some field, asking LLM: ", foodItem.name)
  const system =
    "You are a bot that autocompletes food item missing elements. Call the autocomplete_missing_fields function to do so."

  const functions: OpenAI.Chat.ChatCompletionCreateParams.Function[] = [
    {
      name: "autocomplete_missing_fields",
      description: "Completes the missing fields of a food item. Guesstimate if values are not known.",
      parameters: foodItemMissingFieldCompleteProperties
    }
  ]

  const inquiry =
    `
Food item: ${foodItem.name}${foodItem.brand ? "\nBrand: " + foodItem.brand : ""}
Kcal: ${foodItem.kcalPerServing}
Carbs: ${foodItem.carbPerServing}
Fat: ${foodItem.totalFatPerServing}
Protein: ${foodItem.proteinPerServing}
DefaultServingGrams: ${!foodItem.weightUnknown ? null : foodItem.defaultServingWeightGram}
isLiquid: ${foodItem.isLiquid}
DefaultServingMl: ${foodItem.defaultServingLiquidMl}\n` + generateServingString(foodItem)

  let result: any = null
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

    let foodItemCompletionResult: AutocompleteFoodItem = JSON.parse(result.function_call.arguments)

    let has_valid_schema = checkCompliesWithSchema(foodItemMissingFieldCompleteProperties, foodItemCompletionResult)

    if (!has_valid_schema) {
      console.log("Invalid food completion, retrying with different parameters")
      console.log("First try was", foodItemCompletionResult)
      temperature = 0.1 // Update temperature
      model = "gpt-4-0613" // Update model
      max_tokens = 4096 // Update max tokens

      messages = [
        { role: "system", content: system },
        { role: "user", content: inquiry }
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
    foodItemCompletionResult = JSON.parse(result.function_call.arguments)
    // check again for schema and data
    has_valid_schema = checkCompliesWithSchema(foodItemMissingFieldCompleteProperties, foodItemCompletionResult)
    if (!has_valid_schema) {
      throw console.error("Could not find food item")
    }
    return updateFoodItem(foodItem, foodItemCompletionResult)
  } catch (error) {
    throw error
  }
}

// async function testRun() {
//   const stringifyFoodItem = (foodItem: FoodItemWithNutrientsAndServing): string => {
//     let output = `ItemName: ${foodItem.name}\nBranded: ${Boolean(foodItem.brand)}\n`

//     if (foodItem.brand) {
//       output += `BrandName: ${foodItem.brand}\n`
//     }

//     output += `DefaultServingGrams: ${
//       foodItem.defaultServingWeightGram ? Number(foodItem.defaultServingWeightGram.toPrecision(4)) : "N/A"
//     }\n`
//     output += `isLiquid: ${foodItem.isLiquid}\n`

//     if (foodItem.isLiquid) {
//       output += `DefaultServingMl: ${
//         foodItem.defaultServingLiquidMl ? Number(foodItem.defaultServingLiquidMl.toPrecision(4)) : "N/A"
//       }\n`
//     }

//     output += `Calories: ${Number(foodItem.kcalPerServing.toPrecision(4))}\nCarbs: ${foodItem.carbPerServing}\n`
//     output += `TotalFat: ${Number(foodItem.totalFatPerServing.toPrecision(4))}\nProtein: ${
//       foodItem.proteinPerServing
//     }\n`

//     // Conditional appending
//     if (foodItem.satFatPerServing != null) output += `SatFat: ${Number(foodItem.satFatPerServing.toPrecision(4))}\n`
//     if (foodItem.transFatPerServing != null)
//       output += `TransFat: ${Number(foodItem.transFatPerServing.toPrecision(4))}\n`
//     if (foodItem.fiberPerServing != null) output += `Fiber: ${Number(foodItem.fiberPerServing.toPrecision(4))}\n`
//     if (foodItem.addedSugarPerServing != null)
//       output += `AddedSugar: ${Number(foodItem.addedSugarPerServing.toPrecision(4))}\n`

//     // Iterate through Servings and Nutrients
//     output += "Servings: [\n"
//     for (const serving of foodItem.Serving) {
//       output += `  { servingWeightGrams: ${
//         serving.servingWeightGram ? Number(serving.servingWeightGram.toPrecision(4)) : "N/A"
//       }, servingName: "${serving.servingName}" },\n`
//     }
//     output += "]\n"

//     output += "Nutrients: [\n"
//     for (const nutrient of foodItem.Nutrient) {
//       output += `  { nutrientAmount: ${nutrient.nutrientAmountPerDefaultServing}, nutrientUnit: "${nutrient.nutrientUnit}", nutrientName: "${nutrient.nutrientName}" },\n`
//     }
//     output += "]"

//     return output
//   }

//   const user: Tables<"User"> = {
//     id: "clklnwf090000lzssqhgfm8kr",
//     fullName: "John",
//     email: "john.doe@example.com",
//     phone: "123-456-7890",
//     dateOfBirth: new Date("1990-01-01T00:00:00").toISOString(),
//     weightKg: 70.5,
//     heightCm: 180,
//     calorieGoal: 2000,
//     proteinGoal: 100,
//     carbsGoal: 200,
//     fatGoal: 50,
//     fitnessGoal: "Maintain",
//     unitPreference: "IMPERIAL",
//     setupCompleted: false,
//     sentContact: false,
//     sendCheckins: false,
//     tzIdentifier: "America/New_York",
//     avatarUrl: null,
//     emailVerified: null
//   }
//   // const serving = {
//   //   id: 329,
//   //   servingWeightGram: null,
//   //   servingName: "1 bottle",
//   //   foodItemId: 128,
//   //   servingAlternateAmount: 1,
//   //   servingAlternateUnit: "bottle"
//   // }
//   // const serving2 = {
//   //   id: 452,
//   //   servingWeightGram: null,
//   //   servingName: "1 cup",
//   //   foodItemId: 128,
//   //   servingAlternateAmount: 1,
//   //   servingAlternateUnit: "cup"
//   // }
//   // const foodItem: FoodItemWithNutrientsAndServing = {
//   //   id: 128,
//   //   name: "Milk, 2%",
//   //   brand: "Fairlife",
//   //   knownAs: [],
//   //   description: null,
//   //   defaultServingLiquidMl: 240,
//   //   defaultServingWeightGram: null,
//   //   kcalPerServing: 120,
//   //   totalFatPerServing: 4.5,
//   //   satFatPerServing: 3,
//   //   transFatPerServing: 0,
//   //   carbPerServing: 6,
//   //   sugarPerServing: 6,
//   //   addedSugarPerServing: null,
//   //   proteinPerServing: 13,
//   //   lastUpdated: new Date("2023-09-18 20:00:38.115").toISOString(),
//   //   verified: true,
//   //   userId: null,
//   //   messageId: 489,
//   //   foodInfoSource: "NUTRITIONIX",
//   //   UPC: null,
//   //   externalId: "5d0b35e53aba6bbd692c5f52",
//   //   fiberPerServing: 0,
//   //   isLiquid: true,
//   //   weightUnknown: false,
//   //   Serving: [serving, serving2],
//   //   Nutrient: []
//   // }

//   // const fairlifeMilk: FoodItemWithNutrientsAndServing = {
//   //   id: 2342,
//   //   UPC: null,
//   //   externalId: "5ffefe660027528b35b714bc",
//   //   name: "2% Reduced Ultra-Filtered Milk",
//   //   brand: "Fairlife",
//   //   knownAs: [],
//   //   description: null,
//   //   weightUnknown: false,
//   //   defaultServingWeightGram: null,
//   //   defaultServingLiquidMl: 240.01,
//   //   isLiquid: true,
//   //   kcalPerServing: 120.0005,
//   //   totalFatPerServing: 4.5,
//   //   satFatPerServing: 3,
//   //   transFatPerServing: 0,
//   //   carbPerServing: 6,
//   //   fiberPerServing: 0,
//   //   sugarPerServing: 6,
//   //   addedSugarPerServing: 0,
//   //   proteinPerServing: 13,
//   //   lastUpdated: new Date("2023-09-20T17:07:06.802Z").toISOString(),
//   //   verified: true,
//   //   userId: null,
//   //   foodInfoSource: "NUTRITIONIX",
//   //   messageId: null,
//   //   Serving: [serving2],
//   //   Nutrient: []
//   // }

//   const mcflurryFood: FoodItemWithNutrientsAndServing = {
//     id: 1234124,
//     externalId: "56568",
//     UPC: null,
//     knownAs: [],
//     description: null,
//     lastUpdated: new Date("2023-10-12T16:08:10.626Z").toISOString(),
//     verified: true,
//     userId: null,
//     foodInfoSource: "FATSECRET",
//     messageId: null,
//     name: "McFlurry with Oreo Cookies",
//     brand: "McDonald's",
//     defaultServingWeightGram: NaN,
//     defaultServingLiquidMl: null,
//     isLiquid: false,
//     weightUnknown: true,
//     kcalPerServing: 510,
//     totalFatPerServing: 16,
//     carbPerServing: 80,
//     proteinPerServing: 12,
//     satFatPerServing: 8,
//     fiberPerServing: 1,
//     sugarPerServing: 60,
//     transFatPerServing: 0.5,
//     addedSugarPerServing: 48,
//     Serving: [
//       {
//         id: 12412,
//         foodItemId: 1234124,
//         servingWeightGram: null,
//         servingAlternateAmount: null,
//         servingAlternateUnit: null,
//         servingName: "1 serving"
//       }
//     ],
//     Nutrient: [
//       {
//         id: 0,
//         foodItemId: 0,
//         nutrientName: "Cholesterol",
//         nutrientAmountPerDefaultServing: 40,
//         nutrientUnit: "mg"
//       },
//       {
//         id: 0,
//         foodItemId: 0,
//         nutrientName: "Potassium",
//         nutrientAmountPerDefaultServing: 540,
//         nutrientUnit: "mg"
//       }
//     ]
//   }
//   console.dir(await foodItemMissingFieldComplete(mcflurryFood, user), {
//     depth: null
//   })

//   //console.log(stringifyFoodItem(mcflurryFood))
// }

//testRun()
