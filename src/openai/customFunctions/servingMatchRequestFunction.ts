import { prisma } from "../../database/prisma"
import { chatCompletion, correctAndParseResponse } from "./chatCompletion"
import { User } from "@prisma/client"
import { FoodItemWithNutrientsAndServing } from "@/app/dashboard/utils/FoodHelper"
import { FoodItemToLog, LoggedFoodServing } from "src/utils/loggedFoodItemInterface"
import * as math from "mathjs"
import { extractServingAmount } from "@/utils/openaiFunctionSchemas"

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
    if (serving.serving_alternate_amount && serving.serving_alternate_amount !== 1) {
      normalizedWeight = serving.serving_weight_grams / serving.serving_alternate_amount!
    }

    normalizedWeight = parseFloat(normalizedWeight.toFixed(3))

    if (hasDefaultServing(normalizedWeight)) {
      hasDefault = true
    }

    const key = `${normalizedWeight}_${serving.serving_alternate_unit || "g"}`
    if (!(key in uniqueServings)) {
      uniqueServings[key] = {
        ...serving,
        serving_weight_grams: normalizedWeight,
        serving_amount: 1,
        serving_unit: serving.serving_alternate_unit
      }
      delete uniqueServings[key].name
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

export async function findBestServingMatchFunction(
  food_item_to_log: FoodItemToLog,
  food_item: FoodItemWithNutrientsAndServing,
  user: User
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
      servings: food_item.Servings.map((serving) => {
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

  const inquiry = `user_message:"${food_item_to_log.full_item_user_message_including_serving}"
Food item: ${customStringify(match_request_obj)}
  `
  const system = `
Extract quantity and unit/serving type from user_message.
Units:
- Find weight/volume units: g, oz, lbs, tbsp, cup etc.
- Convert to grams or milliliters using an equation and appropriate conversion factors.

Serving Types:
- If no unit in user_message, treat as item count and use Food_Item for serving size to calculate the total weight
- Match the unit with Food Item serving types or default to serving_id 0.

Output:
- user_serving_total_weight_equation_g_or_ml: Only use numbers and numerical operators. It should multiply the amount provided in the user_message by the respective weight/volume of the serving unit from the Food Item. This equation will later be evaluated in JavaScript.`

  const functions: any[] = [
    {
      name: "match_or_estimate_serving_amount",
      description: `Extracts serving information from user_message.`,
      parameters: extractServingAmount
    }
  ]

  let result: any = null
  let messages: any[] = [
    { role: "system", content: system },
    { role: "user", content: inquiry }
  ]

  try {
    const result = await chatCompletion(
      {
        messages,
        functions,
        model: "gpt-3.5-turbo-0613",
        temperature: 0,
        max_tokens: 1024
      },
      user
    )

    let response
    if (result.function_call) {
      response = correctAndParseResponse(result.function_call.arguments)
    } else {
      throw new Error("No function call found in result")
    }

    console.log("response", response.user_serving_total_weight_equation_g_or_ml)
    // Evaluate the equation safely
    let totalWeight =
      response.user_serving_total_weight_equation_g_or_ml || response.user_serving_total_weight_estimate_g_or_ml

    let lastServingIsDefault =
      match_request_obj.servings[match_request_obj.servings.length - 1].serving_type === "default"

    // Map chatCompletion output to the actual serving ID
    let actualServingId = null
    if (response.serving_id_match_to_user_message !== null && response.serving_id_match_to_user_message !== 0) {
      if (!lastServingIsDefault || response.serving_id_match_to_user_message !== match_request_obj.servings.length) {
        if (food_item.Servings[response.serving_id_match_to_user_message - 1]) {
          actualServingId = food_item.Servings[response.serving_id_match_to_user_message - 1].id
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
  } catch (error) {
    console.error(error)
    return food_item_to_log
  }
}

async function testServingMatchRequest() {
  const messageId = 116
  const food_item: FoodItemWithNutrientsAndServing = {
    id: 33,
    name: "English Muffin",
    brand: "Thomas'",
    knownAs: [], // Assuming knownAs should be an array, given the empty "{}" provided
    description: null,
    defaultServingWeightGram: 57,
    defaultServingLiquidMl: null,
    isLiquid: false,
    weightUnknown: false,
    kcalPerServing: 100,
    totalFatPerServing: 1,
    satFatPerServing: 0,
    transFatPerServing: 0,
    carbPerServing: 26,
    fiberPerServing: 8,
    sugarPerServing: 0.5,
    addedSugarPerServing: 0,
    proteinPerServing: 4,
    lastUpdated: new Date("2023-10-10 15:12:38.482"),
    verified: true,
    externalId: "65097fd7b67c11000af38692",
    UPC: null,
    userId: null,
    messageId: 28,
    foodInfoSource: "NUTRITIONIX",
    Servings: [
      {
        id: 111,
        servingWeightGram: 57,
        servingName: "1 muffin",
        foodItemId: 33,
        servingAlternateAmount: 1,
        servingAlternateUnit: "muffin"
      },
      {
        id: 112,
        servingWeightGram: 75,
        servingName: "1 large muffin",
        foodItemId: 33,
        servingAlternateAmount: 1,
        servingAlternateUnit: "large muffin"
      }
    ],
    Nutrients: [] // No nutrient data provided in the example so initializing an empty array
  }
  const user: User = {
    id: "clklnwf090000lzssqhgfm8kr",
    firstName: "Sebastian",
    lastName: "",
    email: "seb.grubb@gmail.com",
    emailVerified: new Date("2023-10-09 22:45:35.771"),
    phone: "+16503079963",
    dateOfBirth: new Date("1992-05-06 04:00:00"),
    weightKg: 75,
    heightCm: 175,
    calorieGoal: 2440,
    proteinGoal: 200,
    carbsGoal: 230,
    fatGoal: 80,
    fitnessGoal: "Lose weight",
    unitPreference: "METRIC",
    setupCompleted: false,
    sentContact: true,
    sendCheckins: false,
    tzIdentifier: "America/New_York"
  }
  const food_item_to_log: FoodItemToLog = {
    timeEaten: "2023-10-16T12:00:00Z",
    full_item_user_message_including_serving: "1 thomas English Muffin",
    food_database_search_name: "English Muffin",
    branded: true,
    brand: "Thomas'"
    // serving information is omitted since it's not provided yet
  }

  const orangeJuice: FoodItemWithNutrientsAndServing = {
    id: 34,
    name: "Orange Juice",
    brand: "Tropicana",
    knownAs: [],
    description: null,
    defaultServingWeightGram: null,
    defaultServingLiquidMl: 240, // 240 ml is roughly 8 fl oz
    isLiquid: true,
    weightUnknown: false,
    kcalPerServing: 110,
    totalFatPerServing: 0,
    satFatPerServing: 0,
    transFatPerServing: 0,
    carbPerServing: 26,
    fiberPerServing: 0.5,
    sugarPerServing: 22,
    addedSugarPerServing: 0,
    proteinPerServing: 2,
    lastUpdated: new Date("2023-10-10 15:15:38.482"),
    verified: true,
    externalId: "65097fd7b67c11000af38693",
    UPC: null,
    userId: null,
    messageId: 29,
    foodInfoSource: "NUTRITIONIX",
    Servings: [
      {
        id: 113,
        servingWeightGram: null,
        servingName: "1 cup",
        foodItemId: 34,
        servingAlternateAmount: 240,
        servingAlternateUnit: "ml"
      },
      {
        id: 114,
        servingWeightGram: null,
        servingName: "1 glass",
        foodItemId: 34,
        servingAlternateAmount: 355, // roughly 12 fl oz
        servingAlternateUnit: "ml"
      }
    ],
    Nutrients: []
  }

  const orangeJuiceLog: FoodItemToLog = {
    timeEaten: "2023-10-16T12:10:00Z",
    full_item_user_message_including_serving: "2 cups of Tropicana Orange Juice",
    food_database_search_name: "Orange Juice",
    branded: true,
    brand: "Tropicana"
  }

  const gummiesLog = {
    brand: "Metamucil",
    branded: true,
    food_database_search_name: "Metamucil Fiber Gummies",
    full_item_user_message_including_serving: "9 Metamucil Fiber Gummies"
  }
  const gummiesFood = (await prisma.foodItem.findUnique({
    where: { id: 80 },
    include: {
      Nutrients: true,
      Servings: true
    }
  })) as FoodItemWithNutrientsAndServing
  // Testing Orange Juice
  // const oj_result = await findBestServingMatchInstruct(orangeJuiceLog, orangeJuice, user);
  // console.log(oj_result);
  const gummies_result = await findBestServingMatchFunction(gummiesLog, gummiesFood, user)
  console.log(gummies_result)

  //const result = await findBestServingMatchInstruct(food_item_to_log, food_item, user)
  //console.log(result)
}

//testServingMatchRequest()
