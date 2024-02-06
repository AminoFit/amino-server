import { chatCompletion } from "../../languageModelProviders/openai/customFunctions/chatCompletion"
import OpenAI from "openai"
import { FoodItemWithNutrientsAndServing } from "../../app/dashboard/utils/FoodHelper"
import { checkCompliesWithSchema } from "../../languageModelProviders/openai/utils/openAiHelper"
import { Tables } from "types/supabase"
import { createAdminSupabase } from "@/utils/supabase/serverAdmin"

const servingInfoCompleteProperties = {
  type: "object",
  properties: {
    servings: {
      type: "array",
      items: {
        type: "object",
        properties: {
          serving_id: {
            type: "number"
          },
          servingWeightGram: {
            type: "number"
          },
          servingName: {
            type: "string"
          },
          servingAlternateAmount: {
            type: "number"
          },
          servingAlternateUnit: {
            type: "string"
          }
        },
        required: ["serving_id", "servingWeightGram", "servingName", "servingAlternateAmount", "servingAlternateUnit"]
      }
    }
  },
  required: ["servings"]
}

const updateServingInfo = (servings: Tables<"Serving">[], autocompleteResults: any[]): Tables<"Serving">[] => {
  return servings.map((serving) => {
    const newServing = autocompleteResults.find((result) => result.serving_id === serving.id)
    if (newServing) {
      if (serving.defaultServingAmount == null || serving.defaultServingAmount === 0) {
        serving.defaultServingAmount = newServing.defaultServingAmount
      }
      if (serving.servingWeightGram == null || serving.servingWeightGram === 0) {
        serving.servingWeightGram = newServing.servingWeightGram
      }
      if (serving.servingName == null || serving.servingName === "") {
        serving.servingName = newServing.servingName
      }
      if (serving.servingAlternateAmount == null || serving.servingAlternateAmount === 0) {
        serving.servingAlternateAmount = newServing.servingAlternateAmount
      }
      if (serving.servingAlternateUnit == null || serving.servingAlternateUnit === "") {
        serving.servingAlternateUnit = newServing.servingAlternateUnit
      }
    }
    return serving
  })
}

function assignUniqueIdsToServings(servings: Tables<"Serving">[]): Tables<"Serving">[] {
  const usedIds = new Set<number>()
  let nextId = 1

  for (const serving of servings) {
    if (serving.id === 0 || usedIds.has(serving.id)) {
      serving.id = nextId
      nextId++
    }

    usedIds.add(serving.id)
  }

  return servings
}

export async function foodItemCompleteMissingServingInfo(
  foodItem: FoodItemWithNutrientsAndServing,
  user: Tables<"User">
): Promise<FoodItemWithNutrientsAndServing> {
  const servings = assignUniqueIdsToServings(foodItem.Serving)
  const system =
    "You are a bot that autocompletes food item missing serving info. Call the autocomplete_missing_serving_info function to do so. You are a bot that autocompletes food item missing serving info. Call the autocomplete_missing_serving_info function to do so. servingWeightGram and servingName cannot be null or 0."

  const functions: any[] = [
    {
      name: "autocomplete_missing_serving_info",
      description: `
      Completes the missing serving information based on the servingName:
      - For format "x units", sets servingAlternateAmount to x and servingAlternateUnit to the singular form of the unit.
      - For a single word, assume servingAlternateAmount as 1 and servingAlternateUnit as the word itself.
      - For format "name (x units)", sets servingAlternateAmount to x and servingAlternateUnit as "unit of name".
      `,
      parameters: servingInfoCompleteProperties
    }
  ]

  let inquiry: string = ""
  if (foodItem.defaultServingWeightGram) {
    inquiry = `
      Food item: ${foodItem.name}${foodItem.brand ? "\nBrand: " + foodItem.brand : ""}
      Basic info: ${foodItem.defaultServingWeightGram.toFixed(2)}g serving, ${foodItem.kcalPerServing.toFixed(2)} calories, ${
      foodItem.carbPerServing.toFixed(2)}g carbs, ${foodItem.proteinPerServing.toFixed(2)}g protein, ${foodItem.totalFatPerServing.toFixed(2)}g fat
      ${generateServingString(servings)}
  `
  } else if (foodItem.defaultServingLiquidMl) {
    inquiry = `
    Food item: ${foodItem.name}${foodItem.brand ? "\nBrand: " + foodItem.brand : ""}
    Basic info: ${foodItem.defaultServingLiquidMl.toFixed(2)}ml serving, ${foodItem.kcalPerServing.toFixed(2)} calories, ${foodItem.carbPerServing.toFixed(2)}g carbs, ${foodItem.proteinPerServing.toFixed(2)}g protein, ${foodItem.totalFatPerServing.toFixed(2)}g fat
    ${generateServingString(servings)}
`
  }

  let result: any = null
  let messages: any[] = [
    { role: "system", content: system },
    { role: "user", content: inquiry }
  ]

  try {
    // console.log("Calling chatCompletion with messages:", messages)
    // console.log("Calling chatCompletion with functions:", JSON.stringify(functions))
    result = await chatCompletion(
      {
        messages,
        functions,
        model: "gpt-4-1106-preview",
        temperature: 0.05,
        max_tokens: 2048
      },
      user
    )

    console.log("Result:", result)
    const servingInfoCompletionResult = JSON.parse(result.function_call.arguments)

    const has_valid_schema = checkCompliesWithSchema(servingInfoCompleteProperties, servingInfoCompletionResult)

    if (!has_valid_schema) {
      throw new Error("Invalid serving info completion")
    }
    console.log("old servings:", servings)
    console.log("new servings:", servingInfoCompletionResult.servings)
    foodItem.Serving = updateServingInfo(servings, servingInfoCompletionResult.servings)
    return foodItem
  } catch (error) {
    throw error
  }
}

const generateServingString = (servings: Tables<"Serving">[]): string => {
  // Filter servings that have empty servingAlternateAmount and servingAlternateUnit
  const incompleteServings = servings

  const servingsData = incompleteServings
    .map(
      (serving: Tables<"Serving">) => `---
  servingId: ${serving.id}
  servingName: ${serving.servingName}
  servingAlternateAmount: ${serving.servingAlternateAmount}
  servingAlternateUnit: ${serving.servingAlternateUnit}
  servingWeightGram: ${serving.servingWeightGram}
  defaultServingAmount: ${serving.defaultServingAmount}`
    )
    .join("\n")

  return servingsData
}
async function getFoodItemWithServingAndNutrient(id: number) {
  try {
    const supabase = createAdminSupabase()
    const { data: foodItem } = await supabase
      .from("FoodItem")
      .select("*, Serving(*), Nutrient(*)")
      .eq("id", id)
      .single()

    if (!foodItem) {
      throw new Error(`FoodItem with ID ${id} not found.`)
    }

    return foodItem
  } catch (error) {
    console.error("Error fetching FoodItem:", error)
    throw error
  }
}

async function getUserById(userId: string) {
  const supabase = createAdminSupabase()
  try {
    const { data: user } = await supabase.from("User").select().eq("id", userId).single()

    if (!user) {
      throw new Error(`User with ID ${userId} not found.`)
    }

    return user
  } catch (error) {
    console.error("Error fetching User:", error)
    throw error
  }
}

async function testCompleteMissingServingInfo() {
  const gummies = (await getFoodItemWithServingAndNutrient(80)) as FoodItemWithNutrientsAndServing
  const user = await getUserById("clklnwf090000lzssqhgfm8kr")
  const result = await foodItemCompleteMissingServingInfo(gummies, user)
  console.dir(result, { depth: null })
}

//testCompleteMissingServingInfo()
