import axios from "axios"
import { recordQuery } from "@/utils/apiUsageLogging"
import { UsdaFoodItem } from "./usdaInterfaceHelper"
import { mapUsdaFoodItemToFoodItem, FoodItemWithServings } from "./usdaInterfaceHelper"
import { toTitleCase } from "../../utils/nlpHelper"

function extractFoodInfo(
  foodItem: any,
  foodAttributesToQuery: string[]
): UsdaFoodItem {
  const foodInfo: {
    [key: string]: { amount: number | null; unit: string | null }
  } = {}
  const portions: any[] = []

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

    Object.entries(foodItem.labelNutrients as LabelNutrients).forEach(
      ([name, nutrient]) => {
        foodInfo[name] = {
          amount: nutrient.value,
          unit: nutrientUnits[name] || "g"
        }
      }
    )
    if (
      foodItem.servingSizeUnit === "GRM" ||
      foodItem.servingSizeUnit === "g"
    ) {
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
        if (
          foodNutrient.nutrient.name !== "Energy" ||
          foodNutrient.nutrient.unitName === "kcal"
        ) {
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
    Object.entries(foodInfo).filter(
      ([_, value]) => value.amount !== null && value.unit !== null
    )
  )

  if (foodItem.foodPortions) {
    foodItem.foodPortions.forEach((foodPortion: any) => {
      const { amount, gramWeight, measureUnit, modifier } = foodPortion
      let name = measureUnit.name
      if (name === "undetermined") {
        name = `${amount} ${modifier}`
      }
      portions.push({
        name,
        abbreviation: measureUnit.abbreviation,
        amount,
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
      servingSize,
      servingSizeUnit,
      householdServingFullText
    })
  } else if (servingSize && servingSizeUnit) {
    portions.push({
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

export async function getUsdaFoodsInfo(
  params: UsdaFoodsParams
): Promise<FoodItemWithServings[] | null> {
  const API_URL = `https://api.nal.usda.gov/fdc/v1/foods`
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
  const requestParams = {
    fdcIds: params.fdcIds.join(","),
    format: params.format || "full", // default to 'full' if not specified
    nutrients: params.nutrients ? params.nutrients.join(",") : undefined,
    api_key: process.env.USDA_API_KEY
  }

  try {
    const response = await axios.get(API_URL, { params: requestParams })

    //console.log(JSON.stringify(response.data))

    // do not await this
    recordQuery("usda", API_URL)
    let foodItems: UsdaFoodItem[] = []
    if (response.data) {
      foodItems = response.data.map(
        (foodItem: any) => extractFoodInfo(foodItem, foodAttributesToQuery) // Use the params.foodAttributesToQuery here
      )
    }
    const foodItemsMapped = foodItems.map(mapUsdaFoodItemToFoodItem);

    return foodItemsMapped.length > 0 ? foodItemsMapped : null
  } catch (error) {
    if (error instanceof Error) {
      console.error(error.message)
    }
    throw new Error(
      `Error fetching multiple food details from USDA API while searching for ${params.fdcIds}: ${error}`
    )
  }
}

async function runTests() {
  const result = await getUsdaFoodsInfo({
    fdcIds: ["2628401"]
  })
  //const result = JSON.parse(`[{"discontinuedDate":"","foodComponents":[],"foodAttributes":[{"id":2319789,"value":9,"name":"Added Package Weight"}],"foodPortions":[],"fdcId":2112945,"description":"SLICED TURKEY BREAST","publicationDate":"10/28/2021","foodNutrients":[{"type":"FoodNutrient","nutrient":{"id":1253,"number":"601","name":"Cholesterol","rank":15700,"unitName":"mg"},"foodNutrientDerivation":{"id":70,"code":"LCCS","description":"Calculated from value per serving size measure"},"id":25246665,"amount":36},{"type":"FoodNutrient","nutrient":{"id":1257,"number":"605","name":"Fatty acids, total trans","rank":15400,"unitName":"g"},"foodNutrientDerivation":{"id":70,"code":"LCCS","description":"Calculated from value per serving size measure"},"id":25246666,"amount":0},{"type":"FoodNutrient","nutrient":{"id":1005,"number":"205","name":"Carbohydrate, by difference","rank":1110,"unitName":"g"},"foodNutrientDerivation":{"id":70,"code":"LCCS","description":"Calculated from value per serving size measure"},"id":25246656,"amount":7.14},{"type":"FoodNutrient","nutrient":{"id":1162,"number":"401","name":"Vitamin C, total ascorbic acid","rank":6300,"unitName":"mg"},"foodNutrientDerivation":{"id":75,"code":"LCCD","description":"Calculated from a daily value percentage per serving size measure"},"id":25246664,"amount":0},{"type":"FoodNutrient","nutrient":{"id":1258,"number":"606","name":"Fatty acids, total saturated","rank":9700,"unitName":"g"},"foodNutrientDerivation":{"id":75,"code":"LCCD","description":"Calculated from a daily value percentage per serving size measure"},"id":25246667,"amount":0},{"type":"FoodNutrient","nutrient":{"id":1079,"number":"291","name":"Fiber, total dietary","rank":1200,"unitName":"g"},"foodNutrientDerivation":{"id":75,"code":"LCCD","description":"Calculated from a daily value percentage per serving size measure"},"id":25246659,"amount":0},{"type":"FoodNutrient","nutrient":{"id":1004,"number":"204","name":"Total lipid (fat)","rank":800,"unitName":"g"},"foodNutrientDerivation":{"id":70,"code":"LCCS","description":"Calculated from value per serving size measure"},"id":25246655,"amount":1.79},{"type":"FoodNutrient","nutrient":{"id":1003,"number":"203","name":"Protein","rank":600,"unitName":"g"},"foodNutrientDerivation":{"id":70,"code":"LCCS","description":"Calculated from value per serving size measure"},"id":25246654,"amount":17.86},{"type":"FoodNutrient","nutrient":{"id":1093,"number":"307","name":"Sodium, Na","rank":5800,"unitName":"mg"},"foodNutrientDerivation":{"id":70,"code":"LCCS","description":"Calculated from value per serving size measure"},"id":25246662,"amount":1000},{"type":"FoodNutrient","nutrient":{"id":1104,"number":"318","name":"Vitamin A, IU","rank":7500,"unitName":"IU"},"foodNutrientDerivation":{"id":75,"code":"LCCD","description":"Calculated from a daily value percentage per serving size measure"},"id":25246663,"amount":0},{"type":"FoodNutrient","nutrient":{"id":1008,"number":"208","name":"Energy","rank":300,"unitName":"kcal"},"foodNutrientDerivation":{"id":70,"code":"LCCS","description":"Calculated from value per serving size measure"},"id":25246657,"amount":107},{"type":"FoodNutrient","nutrient":{"id":1087,"number":"301","name":"Calcium, Ca","rank":5300,"unitName":"mg"},"foodNutrientDerivation":{"id":75,"code":"LCCD","description":"Calculated from a daily value percentage per serving size measure"},"id":25246660,"amount":0},{"type":"FoodNutrient","nutrient":{"id":2000,"number":"269","name":"Sugars, total including NLEA","rank":1510,"unitName":"g"},"foodNutrientDerivation":{"id":70,"code":"LCCS","description":"Calculated from value per serving size measure"},"id":25246658,"amount":3.57},{"type":"FoodNutrient","nutrient":{"id":1089,"number":"303","name":"Iron, Fe","rank":5400,"unitName":"mg"},"foodNutrientDerivation":{"id":75,"code":"LCCD","description":"Calculated from a daily value percentage per serving size measure"},"id":25246661,"amount":1.29}],"dataType":"Branded","foodClass":"Branded","modifiedDate":"8/11/2017","availableDate":"8/11/2017","brandOwner":"Topco Associates, Inc.","brandName":"BUCKLEY FARMS","dataSource":"LI","brandedFoodCategory":"Pepperoni, Salami & Cold Cuts","gtinUpc":"036800463486","ingredients":"TURKEY BREAST, WATER, SALT, DEXTROSE, POTASSIUM LACTATE, MODIFIED CORN STARCH, SODIUM PHOSPHATE, CARAGEENAN, SODIUM DIACETATE, SODIUM ERYTHORBATE, SODIUM NITRITE.","marketCountry":"United States","servingSize":28,"servingSizeUnit":"g","packageWeight":"12 oz/340 g","foodUpdateLog":[{"discontinuedDate":"","foodAttributes":[],"fdcId":2112945,"description":"SLICED TURKEY BREAST","publicationDate":"10/28/2021","dataType":"Branded","foodClass":"Branded","modifiedDate":"8/11/2017","availableDate":"8/11/2017","brandOwner":"Topco Associates, Inc.","brandName":"BUCKLEY FARMS","dataSource":"LI","brandedFoodCategory":"Pepperoni, Salami & Cold Cuts","gtinUpc":"036800463486","ingredients":"TURKEY BREAST, WATER, SALT, DEXTROSE, POTASSIUM LACTATE, MODIFIED CORN STARCH, SODIUM PHOSPHATE, CARAGEENAN, SODIUM DIACETATE, SODIUM ERYTHORBATE, SODIUM NITRITE.","marketCountry":"United States","servingSize":28,"servingSizeUnit":"g","packageWeight":"12 oz/340 g"},{"discontinuedDate":"","foodAttributes":[],"fdcId":1638570,"description":"SLICED TURKEY BREAST","publicationDate":"3/19/2021","dataType":"Branded","foodClass":"Branded","modifiedDate":"8/11/2017","availableDate":"8/11/2017","brandOwner":"Topco Associates, Inc.","brandName":"BUCKLEY FARMS","dataSource":"LI","brandedFoodCategory":"Pepperoni, Salami & Cold Cuts","gtinUpc":"036800463486","ingredients":"TURKEY BREAST, WATER, SALT, DEXTROSE, POTASSIUM LACTATE, MODIFIED CORN STARCH, SODIUM PHOSPHATE, CARAGEENAN, SODIUM DIACETATE, SODIUM ERYTHORBATE, SODIUM NITRITE.","marketCountry":"United States","servingSize":28,"servingSizeUnit":"g"},{"discontinuedDate":"","foodAttributes":[],"fdcId":1346407,"description":"SLICED TURKEY BREAST","publicationDate":"2/26/2021","dataType":"Branded","foodClass":"Branded","modifiedDate":"8/11/2017","availableDate":"8/11/2017","brandOwner":"Topco Associates, Inc.","brandName":"BUCKLEY FARMS","subbrandName":"","dataSource":"LI","brandedFoodCategory":"Pepperoni, Salami & Cold Cuts","gtinUpc":"036800463486","ingredients":"TURKEY BREAST, WATER, SALT, DEXTROSE, POTASSIUM LACTATE, MODIFIED CORN STARCH, SODIUM PHOSPHATE, CARAGEENAN, SODIUM DIACETATE, SODIUM ERYTHORBATE, SODIUM NITRITE.","marketCountry":"United States","servingSize":28,"servingSizeUnit":"g","packageWeight":"","notaSignificantSourceOf":""},{"discontinuedDate":"","foodAttributes":[],"fdcId":1086895,"description":"SLICED TURKEY BREAST","publicationDate":"9/29/2020","dataType":"Branded","foodClass":"Branded","modifiedDate":"8/11/2017","availableDate":"8/11/2017","brandOwner":"Topco Associates, Inc.","dataSource":"LI","brandedFoodCategory":"Pepperoni, Salami & Cold Cuts","gtinUpc":"036800463486","householdServingFullText":"1 SLICE","ingredients":"TURKEY BREAST, WATER, SALT, DEXTROSE, POTASSIUM LACTATE, MODIFIED CORN STARCH, SODIUM PHOSPHATE, CARAGEENAN, SODIUM DIACETATE, SODIUM ERYTHORBATE, SODIUM NITRITE.","marketCountry":"United States","servingSize":28,"servingSizeUnit":"g"}],"labelNutrients":{"fat":{"value":0.501},"saturatedFat":{"value":0},"transFat":{"value":0},"cholesterol":{"value":10.1},"sodium":{"value":280},"carbohydrates":{"value":2},"fiber":{"value":0},"sugars":{"value":1},"protein":{"value":5},"calcium":{"value":0},"iron":{"value":0.361},"calories":{"value":30}}}]`)
  console.log(JSON.stringify(result))
  console.log("_____________________")
}

//runTests()
