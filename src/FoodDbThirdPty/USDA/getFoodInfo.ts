import axios from "axios"
import { recordQuery } from "@/utils/apiUsageLogging"
import { UsdaFoodItem } from "./usdaInterfaceHelper"
import { mapUsdaFoodItemToFoodItem, FoodItemWithServings } from "./usdaInterfaceHelper"
import { toTitleCase } from "../../utils/nlpHelper"
import { UsdaPortion } from "./usdaInterfaceHelper"

const foodAttributesToQuery = [
  "Energy",
  "Protein",
  "Total lipid (fat)",
  "Carbohydrate, by difference",
  "Energy (Atwater General Factors)",
  "Sugars, total including NLEA",
  "Sugars, Total",
  "Fiber, total dietary",
  "Carbohydrate, by summation",
  "Total fat (NLEA)",
  "Fatty acids, total saturated",
  "Fatty acids, total monounsaturated",
  "Fatty acids, total trans",
  "Sugars, added",
  "Cholesterol",
  "Potassium, K",
  "Sodium, Na",
  "Calcium, Ca"
]

function extractFoodInfo(foodItem: any, foodAttributesToQuery: string[]): UsdaFoodItem {
  const foodInfo: {
    [key: string]: { amount: number | null; unit: string | null }
  } = {}
  const portions: UsdaPortion[] = []

  foodAttributesToQuery.forEach((name) => {
    foodInfo[name] = { amount: null, unit: null }
  })

  let default_serving = {
    default_serving_amount: 100,
    default_serving_unit: "g"
  }

  // Use labelNutrients if available
  if (foodItem.labelNutrients) {
    // Mapping of nutrients to their units
    const nutrientUnits: { [key: string]: string } = {
      cholesterol: "mg",
      sodium: "mg",
      potassium: "mg",
      calcium: "mg",
      iron: "mg",
      vitaminD: "mcg",
      calories: "kcal"
      // Add other nutrients and their units here
    }

    Object.entries(foodItem.labelNutrients as LabelNutrients).forEach(([name, nutrient]) => {
      foodInfo[name] = {
        amount: nutrient.value,
        unit: nutrientUnits[name] || "g"
      }
    })
    if (foodItem.servingSizeUnit === "GRM" || foodItem.servingSizeUnit === "g") {
      default_serving = {
        default_serving_amount: foodItem.servingSize,
        default_serving_unit: "g"
      }
    } else {
      if (["ml", "MLT", "IU"].includes(foodItem.servingSizeUnit)) {
        default_serving = {
          default_serving_amount: foodItem.servingSize,
          default_serving_unit: "ml"
        }
      }
    }
  } else {
    foodItem.foodNutrients.forEach((foodNutrient: any) => {
      if (foodAttributesToQuery.includes(foodNutrient.nutrient.name)) {
        // Only include the nutrient if it's not "Energy" or if it's "Energy" with unit "kcal"
        if (foodNutrient.nutrient.name !== "Energy" || foodNutrient.nutrient.unitName === "kcal") {
          foodInfo[foodNutrient.nutrient.name] = {
            amount: foodNutrient.amount,
            unit: foodNutrient.nutrient.unitName
          }
        }
      }
    })
  }

  // Filter out the attributes with null values
  const filteredfoodInfo = Object.fromEntries(
    Object.entries(foodInfo).filter(([_, value]) => value.amount !== null && value.unit !== null)
  )
  if (foodItem.foodPortions) {
    foodItem.foodPortions
      .filter((portion: any) => portion.portionDescription !== "Quantity not specified")
      .forEach((foodPortion: any) => {
        const { gramWeight, measureUnit, portionDescription, modifier } = foodPortion
        let name = measureUnit.name
        if (name === "undetermined" || !name) {
          if (portionDescription) {
            name = portionDescription
          } else if (modifier && modifier !== "") {
            name = modifier
          } else {
            name = `${gramWeight} g`
          }
        }

        portions.push({
          name,
          householdServingFullText: name,
          servingSize: 1,
          servingSizeUnit: measureUnit.abbreviation === "undetermined" ? "" : measureUnit.abbreviation,
          gramWeight
        })
      })
  }
  // Extract portion information
  const servingSize = foodItem.servingSize
  let servingSizeUnit = foodItem.servingSizeUnit

  if (foodItem.servingSizeUnit === "GRM") {
    servingSizeUnit = "g"
  }
  const householdServingFullText = foodItem.householdServingFullText

  if (servingSize && servingSizeUnit && householdServingFullText) {
    portions.push({
      name: `${servingSize} ${servingSizeUnit}`,
      servingSize,
      servingSizeUnit,
      householdServingFullText
    })
  } else if (servingSize && servingSizeUnit) {
    portions.push({
      householdServingFullText: `${servingSize} ${servingSizeUnit}`,
      servingSize,
      servingSizeUnit
    })
  }

  const itemName = toTitleCase(foodItem.description)
  const branded = foodItem.dataType === "Branded"
  const brandName = branded ? toTitleCase(foodItem.brandName) : null
  const upc = branded ? foodItem.gtinUpc : undefined
  const fdcId = foodItem.fdcId

  return {
    itemName,
    fdcId,
    branded,
    brandName,
    default_serving,
    foodInfo: filteredfoodInfo,
    portions,
    ...(upc ? { upc } : {})
  }
}

interface LabelNutrients {
  fat: { value: number }
  saturatedFat: { value: number }
  transFat: { value: number }
  cholesterol: { value: number }
  sodium: { value: number }
  carbohydrates: { value: number }
  fiber: { value: number }
  sugars: { value: number }
  protein: { value: number }
  vitaminD: { value: number }
  calcium: { value: number }
  iron: { value: number }
  potassium: { value: number }
  addedSugar: { value: number }
  calories: { value: number }
}

export interface UsdaFoodsParams {
  fdcIds: string[]
  format?: "abridged" | "full"
  nutrients?: number[]
}

export async function getUsdaFoodsInfo(params: UsdaFoodsParams): Promise<FoodItemWithServings[] | null> {
  const API_URL = `https://api.nal.usda.gov/fdc/v1/foods`
  const requestParams = {
    fdcIds: params.fdcIds.join(","),
    format: params.format || "full", // default to 'full' if not specified
    nutrients: params.nutrients ? params.nutrients.join(",") : undefined,
    api_key: process.env.USDA_API_KEY
  }

  try {
    const response = await axios.get(API_URL, { params: requestParams })

    console.log(JSON.stringify(response.data))

    // do not await this
    recordQuery("usda", API_URL)
    let foodItems: UsdaFoodItem[] = []
    if (response.data) {
      foodItems = response.data.map(
        (foodItem: any) => extractFoodInfo(foodItem, foodAttributesToQuery) // Use the params.foodAttributesToQuery here
      )
    }
    const foodItemsMapped = foodItems.map(mapUsdaFoodItemToFoodItem)

    return foodItemsMapped.length > 0 ? foodItemsMapped : null
  } catch (error) {
    if (error instanceof Error) {
      console.error(error.message)
    }
    throw new Error(`Error fetching multiple food details from USDA API while searching for ${params.fdcIds}: ${error}`)
  }
}

function dummyTest() {
  const foodAttributesToQuery = [
    "Energy",
    "Protein",
    "Total lipid (fat)",
    "Carbohydrate, by difference",
    "Energy (Atwater General Factors)",
    "Sugars, total including NLEA",
    "Sugars, Total",
    "Fiber, total dietary",
    "Carbohydrate, by summation",
    "Total fat (NLEA)",
    "Fatty acids, total saturated",
    "Fatty acids, total monounsaturated",
    "Fatty acids, total trans",
    "Sugars, added",
    "Cholesterol",
    "Potassium, K",
    "Sodium, Na",
    "Calcium, Ca"
  ]
}

//runTests()

// food for 172963, 168460, 2175192
async function runTests() {
  console.dir(await getUsdaFoodsInfo({ fdcIds: ["2531832"] }), { depth: null })
}
// runTests()
