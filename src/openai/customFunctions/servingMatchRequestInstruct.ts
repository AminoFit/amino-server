import { chatCompletionInstruct, correctAndParseResponse } from "./chatCompletion"
import { FoodItemWithNutrientsAndServing } from "@/app/dashboard/utils/FoodHelper"
import { FoodItemToLog, LoggedFoodServing } from "src/utils/loggedFoodItemInterface"
import * as math from "mathjs"
import { Tables } from "types/supabase"

interface ServingMatchRequest {
  item_name: string
  item_brand: string | null
  item_properties: {
    name: string
    brand: string | null
    default_serving_size_grams: number | null
    default_serving_size_ml: number | null
    default_serving_calories: number
    servings: {
      serving_id: number
      name: string
      serving_weight_grams: number | null
      serving_alternate_unit: string | null
      serving_alternate_amount: number | null
    }[]
  }
}

type ServingToMatch = {
  serving_id: number
  type?: string
  serving_type?: string
  serving_unit?: string
  serving_amount?: number
  serving_weight_grams?: number
  serving_liquid_ml?: number
}

function mapToCorrectUnit(unit: string): "g" | "ml" {
  const lowercaseUnit = unit.toLowerCase()

  if (["g", "gram", "grams"].includes(lowercaseUnit)) {
    return "g"
  } else if (["ml", "milliliter", "millilitre", "milliliters", "millilitres"].includes(lowercaseUnit)) {
    return "ml"
  } else {
    throw new Error(`Unexpected unit encountered: ${unit}`)
  }
}

function mapServingMatchRequest(request: ServingMatchRequest) {
  const epsilon = 0.03 // Tolerance for weight comparison

  // Add "no options" option
  let servings: ServingToMatch[] = [
    {
      serving_id: 0,
      type: "no serving match"
    }
  ]

  const defaultServingWeight = parseFloat(request.item_properties.default_serving_size_grams!.toFixed(2))

  // Function to check if the default serving already exists
  const hasDefaultServing = (weight: number): boolean => {
    return Math.abs(weight - defaultServingWeight) < epsilon
  }

  let hasDefault = false

  for (let serving of request.item_properties.servings) {
    if (hasDefaultServing(serving.serving_weight_grams!)) {
      hasDefault = true
      break
    }
  }

  // Dedupe servings based on normalized weight and unit
  const uniqueServings: Record<string, any> = {}

  for (let serving of request.item_properties.servings) {
    if (!serving.serving_weight_grams) continue

    let normalizedWeight = serving.serving_weight_grams
    let shouldNormalize = serving.serving_alternate_amount && serving.serving_alternate_amount !== 1

    // Check if the serving's alternate amount is equal to its weight in grams, indicating the unit is grams
    if (serving.serving_weight_grams === serving.serving_alternate_amount) {
      shouldNormalize = false
    }

    if (shouldNormalize) {
      normalizedWeight = serving.serving_weight_grams / serving.serving_alternate_amount!
    }

    normalizedWeight = parseFloat(normalizedWeight.toFixed(3))

    if (hasDefaultServing(normalizedWeight)) {
      hasDefault = true
    }

    const key = shouldNormalize
      ? `${normalizedWeight}_${serving.serving_alternate_unit || "g"}`
      : `${serving.serving_weight_grams}_${serving.serving_alternate_unit || "g"}`

    if (!(key in uniqueServings)) {
      uniqueServings[key] = {
        ...serving,
        serving_weight_grams: normalizedWeight,
        serving_amount: shouldNormalize ? 1 : serving.serving_alternate_amount, // Retain original serving amount if not normalized
        serving_unit: serving.serving_alternate_unit
      }
      console.log("Seb, check this:", uniqueServings)
      if (uniqueServings[key].name) delete uniqueServings[key].name
      delete uniqueServings[key].serving_alternate_amount
      delete uniqueServings[key].serving_alternate_unit
    }
  }

  servings.push(...Object.values(uniqueServings))

  const defaultServingLiquidMl = request.item_properties.default_serving_size_ml

  let defaultServing: any = {
    serving_id: servings.length,
    serving_type: "default",
    serving_weight_grams: defaultServingWeight
  }

  if (defaultServingLiquidMl) {
    defaultServing.serving_liquid_ml = defaultServingLiquidMl
  }

  if (!hasDefault) {
    servings.push(defaultServing)
  }

  // Reassign serving IDs in sequential order
  servings.forEach((s, index) => (s.serving_id = index))

  // Construct the final response
  let result = {
    name: request.item_name,
    brand: request.item_brand,
    servings: servings
  }

  return result
}

function customStringify(obj: any) {
  let jsonString = JSON.stringify(obj, null, 2) // prettify with indentation of 2
  jsonString = jsonString.replace(/"([^"]+)":/g, "$1:")
  return jsonString
}

export async function findBestServingMatchInstruct(
  food_item_to_log: FoodItemToLog,
  food_item: FoodItemWithNutrientsAndServing,
  user: Tables<"User">
): Promise<FoodItemToLog> {
  const matchRequest: ServingMatchRequest = {
    item_name: food_item.name,
    item_brand: food_item.brand || null, // Optional: handle cases where brand might be null
    item_properties: {
      name: food_item.name,
      brand: food_item.brand,
      default_serving_size_grams: food_item.defaultServingWeightGram,
      default_serving_size_ml: food_item.defaultServingLiquidMl,
      default_serving_calories: food_item.kcalPerServing,
      servings: food_item.Serving.map((serving: any) => {
        let servingSize = {
          serving_weight_grams: serving.servingWeightGram
        }
        return {
          serving_id: serving.id,
          name: serving.servingName,
          serving_alternate_unit: serving.servingAlternateUnit,
          serving_alternate_amount: serving.servingAlternateAmount,
          ...servingSize
        }
      })
    }
  }

  const match_request_obj = mapServingMatchRequest(matchRequest)

  const model = "gpt-3.5-turbo-instruct-0914"
  const max_tokens = 500
  const temperature = 0

  const prompt = `Determine the serving size from user_message and Food Item details:

Extract quantity and unit/serving type from user_message.
Units:

Find weight/volume units: g, oz, lbs, tbsp, cup.
Convert to grams or milliliters using user_equation_total_weight_g_or_ml. If direct, use user_specified_total_weight_g_or_ml.
Serving Types:

If no unit in user_message, treat as item count and use Food Item for serving size.
Match the unit with Food Item serving types or default to serving_id 0.
Output:

Assemble the output, ensuring consistency.
Equation: Only use numbers and operations. No letters. Evaluable in Python and JS.

user_message:"${food_item_to_log.full_item_user_message_including_serving}"
Food Item:
${customStringify(match_request_obj)}

Output Structure:
{serving_unit_in_user_message: string,
serving_amount_in_user_message: number,
user_equation_total_weight_g_or_ml: equation,
user_estimated_total_weight_g_or_ml: number? (rounded, null if not),
unit_g_or_ml: "g" | "ml",
serving_id_match_to_user_message: int?
}

Output:
{`

  const result = await chatCompletionInstruct(
    {
      prompt: prompt.trim(),
      model: model,
      temperature: temperature,
      max_tokens: max_tokens,
      stop: "}"
    },
    user
  )

  const response = correctAndParseResponse("{" + result.text!.trim() + "}")

  // Evaluate the equation safely
  let totalWeight = response.user_equation_total_weight_g_or_ml || response.user_estimated_total_weight_g_or_ml

  let lastServingIsDefault =
    match_request_obj.servings[match_request_obj.servings.length - 1].serving_type === "default"

  // Map chatCompletion output to the actual serving ID
  let actualServingId = null
  if (response.serving_id_match_to_user_message !== null && response.serving_id_match_to_user_message !== 0) {
    if (!lastServingIsDefault || response.serving_id_match_to_user_message !== match_request_obj.servings.length) {
      if (food_item.Serving[response.serving_id_match_to_user_message - 1]) {
        actualServingId = food_item.Serving[response.serving_id_match_to_user_message - 1].id
      }
    }
  }

  // Check if casting to Number fails
  if (isNaN(Number(totalWeight))) {
    throw new Error("Failed to cast totalWeight to a number, totalWeight: " + totalWeight)
  }

  // Update the serving details in food_item_to_log
  food_item_to_log.serving = {
    serving_amount: response.serving_amount_in_user_message,
    serving_name: response.serving_unit_in_user_message || "",
    serving_g_or_ml: mapToCorrectUnit(response.unit_g_or_ml),
    total_serving_g_or_ml: Number(totalWeight),
    serving_id: actualServingId || 0,
    full_serving_string: `${response.serving_amount_in_user_message} ${response.serving_unit_in_user_message}`
  }

  return food_item_to_log
}

// async function testServingMatchRequest() {
//   const user: User = {
//     id: "clklnwf090000lzssqhgfm8kr",
//     firstName: "Sebastian",
//     lastName: "",
//     email: "seb.grubb@gmail.com",
//     emailVerified: new Date("2023-10-09 22:45:35.771"),
//     phone: "+16503079963",
//     dateOfBirth: new Date("1992-05-06 04:00:00"),
//     weightKg: 75,
//     heightCm: 175,
//     calorieGoal: 2440,
//     proteinGoal: 200,
//     carbsGoal: 230,
//     fatGoal: 80,
//     fitnessGoal: "Lose weight",
//     unitPreference: "METRIC",
//     setupCompleted: false,
//     sentContact: true,
//     sendCheckins: false,
//     tzIdentifier: "America/New_York"
//   }

//   const oikos_serving = {
//     brand: "Oikos",
//     branded: true,
//     food_database_search_name: "Peach Yogurt",
//     full_item_user_message_including_serving: "1 Oikos Peach Yogurt"
//   }
//   const oikos_food = (await pris.foodItem.findUnique({
//     where: { id: 94 },
//     include: {
//       Nutrients: true,
//       Servings: true
//     }
//   })) as FoodItemWithNutrientsAndServing
//   console.dir(oikos_food, { depth: null })

//   const oikos_result = await findBestServingMatchInstruct(oikos_serving, oikos_food, user)
//   console.log(oikos_result)
// }

//testServingMatchRequest()
