import axios from "axios"
import path from "path"
import dotenv from "dotenv"

const envPath = path.resolve(__dirname, "../../../.env.local")
dotenv.config({ path: envPath })

const USDA_API_KEY = process.env.USDA_API_KEY

type FoodItem = {
  itemName: string
  branded: boolean
  brandName: string | null
  foodInfo: { [key: string]: number | null }
  default_serving: { default_serving_amount: number, default_serving_unit: string }
  portions: any[] // define the structure as per your requirements
  upc?: string
}

function extractFoodInfo(
  foodItem: any,
  foodAttributesToQuery: string[]
): FoodItem {
  const foodInfo: { [key: string]: number | null } = {}
  const portions: any[] = []

  foodAttributesToQuery.forEach((name) => {
    foodInfo[name] = null
  })

  foodItem.foodNutrients.forEach((foodNutrient: any) => {
    if (foodAttributesToQuery.includes(foodNutrient.nutrient.name)) {
      foodInfo[foodNutrient.nutrient.name] = foodNutrient.amount
    }
  })

  // Filter out the attributes with null values
  const filteredfoodInfo = Object.fromEntries(
    Object.entries(foodInfo).filter(([_, value]) => value !== null)
  )

  if (foodItem.foodPortions) {
    foodItem.foodPortions.forEach((foodPortion: any) => {
      portions.push(foodPortion)
    })
  }
  // Extract portion information
  const servingSize = foodItem.servingSize
  const servingSizeUnit = foodItem.servingSizeUnit
  const householdServingFullText = foodItem.householdServingFullText

  if (servingSize && servingSizeUnit && householdServingFullText) {
    portions.push({
      servingSize,
      servingSizeUnit,
      householdServingFullText
    })
  }

  const itemName = foodItem.description
  const branded = foodItem.dataType === "Branded"
  const brandName = branded ? foodItem.brandName : null
  const upc = branded ? foodItem.gtinUpc : undefined
  const default_serving = { default_serving_amount: 100, default_serving_unit: "g" }

  return {
    itemName,
    branded,
    brandName,
    default_serving,
    foodInfo: filteredfoodInfo,
    portions,
    ...(upc ? { upc } : {})
  }
}

interface Nutrient {
  id: number
  number: string
  name: string
  rank: number
  unitName: string
}

interface FoodNutrientSource {
  id: number
  code: string
  description: string
}

interface FoodNutrientDerivation {
  id: number
  code: string
  description: string
  foodNutrientSource: FoodNutrientSource
}

interface NutrientAnalysisDetails {
  subSampleId: number
  amount: number
  nutrientId: number
  labMethodDescription: string
  labMethodOriginalDescription: string
  labMethodLink: string
  labMethodTechnique: string
  nutrientAcquisitionDetails: NutrientAcquisitionDetails[]
}

interface NutrientAcquisitionDetails {
  sampleUnitId: number
  purchaseDate: string
  storeCity: string
  storeState: string
}

interface FoodNutrient {
  id: number
  amount: number
  dataPoints: number
  min: number
  max: number
  median: number
  type: string
  nutrient: Nutrient
  foodNutrientDerivation: FoodNutrientDerivation
  nutrientAnalysisDetails: NutrientAnalysisDetails
}

interface FoodCategory {
  id: number
  code: string
  description: string
}

interface FoodComponent {
  id: number
  name: string
  dataPoints: number
  gramWeight: number
  isRefuse: boolean
  minYearAcquired: number
  percentWeight: number
}

interface MeasureUnit {
  id: number
  abbreviation: string
  name: string
}

interface FoodPortion {
  id: number
  amount: number
  dataPoints: number
  gramWeight: number
  minYearAcquired: number
  modifier: string
  portionDescription: string
  sequenceNumber: number
  measureUnit: MeasureUnit
}

interface SampleFoodItem {
  fdcId: number
  datatype: string
  description: string
  foodClass: string
  publicationDate: string
  foodAttributes: FoodCategory[]
}

interface InputFoodFoundation {
  id: number
  foodDescription: string
  inputFood: SampleFoodItem
}

interface NutrientConversionFactors {
  type: string
  value: number
}

interface FoundationFoodItem {
  fdcId: number
  dataType: string
  description: string
  foodClass: string
  footNote: string
  isHistoricalReference: boolean
  ndbNumber: string
  publicationDate: string
  scientificName: string
  foodCategory: FoodCategory
  foodComponents: FoodComponent[]
  foodNutrients: FoodNutrient[]
  foodPortions: FoodPortion[]
  inputFoods: InputFoodFoundation[]
  nutrientConversionFactors: NutrientConversionFactors[]
}

export interface UsdaFoodsParams {
  fdcIds: string[]
  format?: "abridged" | "full"
  nutrients?: number[]
}

export async function getUsdaFoodsInfo(
  params: UsdaFoodsParams
): Promise<FoundationFoodItem[]> {
  const API_URL = `https://api.nal.usda.gov/fdc/v1/foods`
  const requestParams = {
    fdcIds: params.fdcIds.join(","),
    format: params.format || "full", // default to 'full' if not specified
    nutrients: params.nutrients ? params.nutrients.join(",") : undefined,
    api_key: process.env.USDA_API_KEY
  }

  try {
    const response = await axios.get(API_URL, { params: requestParams })
    return response.data
  } catch (error) {
    if (error instanceof Error) {
      console.error(error.message)
    }
    throw new Error(
      `Error fetching multiple food details from USDA API: ${error}`
    )
  }
}

async function runTests() {
  const foodAttributesToQuery = [
    "Energy",
    "Protein",
    "Total lipid (fat)",
    "Carbohydrate, by difference",
    "Energy (Atwater General Factors)",
    "Sugars, Total",
    "Fiber, total dietary",
    "Carbohydrate, by summation",
    "Total fat (NLEA)",
    "Fatty acids, total saturated",
    "Fatty acids, total monounsaturated",
    "Fatty acids, total trans",
    "Sugars, added"
  ]
  const result = await getUsdaFoodsInfo({ fdcIds: ["2604937"] })
  // console.log(JSON.stringify(result))
  const foodInfo = extractFoodInfo(result[0], foodAttributesToQuery)
  console.log(JSON.stringify(foodInfo))
  console.log(foodInfo)
}

runTests()
