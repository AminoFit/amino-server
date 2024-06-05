import axios from "axios"
import { recordQuery } from "@/utils/apiUsageLogging"
import { UsdaFoodItem } from "./usdaInterfaceHelper"
import { mapUsdaFoodItemToFoodItem, FoodItemWithServings } from "./usdaInterfaceHelper"
import { toTitleCase } from "../../utils/nlpHelper"
import { UsdaPortion } from "./usdaInterfaceHelper"

interface FoodAttribute {
  id: number
  name: string
  usdaUnit: string
  targetUnit: string
  conversionFactor: number
  targetName: string
}

export const foodAttributesToQuery: FoodAttribute[] = [
  { id: 2048, name: "Energy", usdaUnit: "kcal", targetUnit: "kcal", conversionFactor: 1, targetName: "calories" },
  { id: 1004, name: "Total lipid (fat)", usdaUnit: "g", targetUnit: "g", conversionFactor: 1, targetName: "fat" },
  { id: 1258, name: "Fatty acids, total saturated", usdaUnit: "g", targetUnit: "g", conversionFactor: 1, targetName: "saturatedFat" },
  { id: 1257, name: "Fatty acids, total trans", usdaUnit: "g", targetUnit: "g", conversionFactor: 1, targetName: "transFat" },
  { id: 1268, name: "Fatty acids, total monounsaturated", usdaUnit: "g", targetUnit: "g", conversionFactor: 1, targetName: "monounsaturatedFat" },
  { id: 1293, name: "Fatty acids, total polyunsaturated", usdaUnit: "g", targetUnit: "g", conversionFactor: 1, targetName: "polyunsaturatedFat" },
  { id: 1005, name: "Carbohydrate, by difference", usdaUnit: "g", targetUnit: "g", conversionFactor: 1, targetName: "carbohydrates" },
  { id: 1080, name: "Fiber, total dietary", usdaUnit: "g", targetUnit: "g", conversionFactor: 1, targetName: "fiber" },
  { id: 2000, name: "Sugars, total including NLEA", usdaUnit: "g", targetUnit: "g", conversionFactor: 1, targetName: "sugars" },
  { id: 1235, name: "Sugars, added", usdaUnit: "g", targetUnit: "g", conversionFactor: 1, targetName: "addedSugar" },
  { id: 1003, name: "Protein", usdaUnit: "g", targetUnit: "g", conversionFactor: 1, targetName: "protein" },
  { id: 1051, name: "Water", usdaUnit: "g", targetUnit: "ml", conversionFactor: 1, targetName: "water" },
  { id: 1104, name: "Vitamin A, IU", usdaUnit: "IU", targetUnit: "mcg", conversionFactor: 0.3, targetName: "vitaminA" },
  { id: 1162, name: "Vitamin C, total ascorbic acid", usdaUnit: "mg", targetUnit: "mg", conversionFactor: 1, targetName: "vitaminC" },
  { id: 1110,name: "Vitamin D (D2 + D3), International Units",usdaUnit: "IU",targetUnit: "mcg",conversionFactor: 0.025,targetName: "vitaminD"},
  { id: 1124, name: "Vitamin E, IU", usdaUnit: "IU", targetUnit: "mg", conversionFactor: 0.67, targetName: "vitaminE" },
  { id: 1185, name: "Vitamin K (phylloquinone)", usdaUnit: "mcg", targetUnit: "mcg", conversionFactor: 1, targetName: "vitaminK" },
  { id: 1165, name: "Thiamin", usdaUnit: "mg", targetUnit: "mg", conversionFactor: 1, targetName: "thiamin" },
  { id: 1166, name: "Riboflavin", usdaUnit: "mg", targetUnit: "mg", conversionFactor: 1, targetName: "riboflavin" },
  { id: 1167, name: "Niacin", usdaUnit: "mg", targetUnit: "mg", conversionFactor: 1, targetName: "niacin" },
  { id: 1170, name: "Pantothenic acid", usdaUnit: "mg", targetUnit: "mg", conversionFactor: 1, targetName: "pantothenicAcid" },
  { id: 1175, name: "Vitamin B-6", usdaUnit: "mg", targetUnit: "mg", conversionFactor: 1, targetName: "vitaminB6" },
  { id: 1176, name: "Biotin", usdaUnit: "mcg", targetUnit: "mcg", conversionFactor: 1, targetName: "biotin" },
  { id: 1190, name: "Folate, DFE", usdaUnit: "mcg", targetUnit: "mcg", conversionFactor: 1, targetName: "folate" },
  { id: 1178, name: "Vitamin B-12", usdaUnit: "mcg", targetUnit: "mcg", conversionFactor: 1, targetName: "vitaminB12" },
  { id: 1087, name: "Calcium, Ca", usdaUnit: "mg", targetUnit: "mg", conversionFactor: 1, targetName: "calcium" },
  { id: 1089, name: "Iron, Fe", usdaUnit: "mg", targetUnit: "mg", conversionFactor: 1, targetName: "iron" },
  { id: 1090, name: "Magnesium, Mg", usdaUnit: "mg", targetUnit: "mg", conversionFactor: 1, targetName: "magnesium" },
  { id: 1091, name: "Phosphorus, P", usdaUnit: "mg", targetUnit: "mg", conversionFactor: 1, targetName: "phosphorus" },
  { id: 1092, name: "Potassium, K", usdaUnit: "mg", targetUnit: "mg", conversionFactor: 1, targetName: "potassium" },
  { id: 1093, name: "Sodium, Na", usdaUnit: "mg", targetUnit: "mg", conversionFactor: 1, targetName: "sodium" },
  { id: 1095, name: "Zinc, Zn", usdaUnit: "mg", targetUnit: "mg", conversionFactor: 1, targetName: "zinc" },
  { id: 1098, name: "Copper, Cu", usdaUnit: "mg", targetUnit: "mg", conversionFactor: 1, targetName: "copper" },
  { id: 1101, name: "Manganese, Mn", usdaUnit: "mg", targetUnit: "mg", conversionFactor: 1, targetName: "manganese" },
  { id: 1103, name: "Selenium, Se", usdaUnit: "mcg", targetUnit: "mcg", conversionFactor: 1, targetName: "selenium" },
  { id: 1100, name: "Iodine, I", usdaUnit: "mcg", targetUnit: "mcg", conversionFactor: 1, targetName: "iodine" },
  { id: 1253, name: "Cholesterol", usdaUnit: "mg", targetUnit: "mg", conversionFactor: 1, targetName: "cholesterol" },
  { id: 1057, name: "Caffeine", usdaUnit: "mg", targetUnit: "mg", conversionFactor: 1, targetName: "caffeine" },
  { id: 1018, name: "Alcohol, ethyl", usdaUnit: "g", targetUnit: "g", conversionFactor: 1, targetName: "alcohol" }
]

export function extractFoodInfo(foodItem: any, foodAttributesToQuery: FoodAttribute[]): UsdaFoodItem {
  const foodInfo: {
    [key: string]: { amount: number | null; unit: string | null }
  } = {}
  const portions: UsdaPortion[] = []

  // Extract names from foodAttributesToQuery
  const attributeNames = foodAttributesToQuery.map((attr) => attr.targetName)

  attributeNames.forEach((name) => {
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
      fat: "g",
      saturatedFat: "g",
      transFat: "g",
      cholesterol: "mg",
      sodium: "mg",
      potassium: "mg",
      calcium: "mg",
      iron: "mg",
      vitaminD: "mcg",
      calories: "kcal",
      carbohydrates: "g",
      fiber: "g",
      sugars: "g",
      protein: "g",
      vitaminA: "IU",
      vitaminC: "mg",
      vitaminB6: "mg",
      vitaminB12: "mcg",
      thiamin: "mg",
      riboflavin: "mg",
      niacin: "mg",
      phosphorus: "mg",
      magnesium: "mg",
      polyunsaturatedFat: "g"
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
  }

  // if foodNutrients exists, use it to calculate the nutrients
  if (foodItem.foodNutrients) {
    foodItem.foodNutrients.forEach((foodNutrient: any) => {
      const attribute = foodAttributesToQuery.find(attr => attr.name === foodNutrient.nutrient.name)
      if (attribute && !foodInfo[attribute.targetName].amount) {
        if (foodNutrient.nutrient.name !== "Energy" || foodNutrient.nutrient.unitName === "kcal") {
          const normalizedAmount = foodNutrient.amount * (default_serving.default_serving_amount / 100) * attribute.conversionFactor;
          const roundedAmount = Number(normalizedAmount.toPrecision(2));
          
          foodInfo[attribute.targetName] = {
            amount: roundedAmount,
            unit: attribute.targetUnit
          };
        }
      }
    });
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
  // console.dir(await getUsdaFoodsInfo({ fdcIds: ["2663962"] }), { depth: null })
  console.dir(await getUsdaFoodsInfo({ fdcIds: ["1093433"] }), { depth: null })
}
// runTests()
