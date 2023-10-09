import axios from "axios"
import { recordQuery } from "@/utils/apiUsageLogging"
import { UsdaFoodItem } from "./usdaInterfaceHelper"
import { mapUsdaFoodItemToFoodItem, FoodItemWithServings } from "./usdaInterfaceHelper"
import { toTitleCase } from "../../utils/nlpHelper"

function extractFoodInfo(foodItem: any, foodAttributesToQuery: string[]): UsdaFoodItem {
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
      .filter(
        (portion: any) =>
          portion.portionDescription !== "Quantity not specified"
      )
      .forEach((foodPortion: any) => {
        const { gramWeight, measureUnit, portionDescription } = foodPortion
        let name = measureUnit.name
        if (name === "undetermined") {
          name = portionDescription;
        }
        portions.push({
          name,
          abbreviation: measureUnit.abbreviation === "undetermined" ? "" : measureUnit.abbreviation,
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
    const foodItemsMapped = foodItems.map(mapUsdaFoodItemToFoodItem)

    return foodItemsMapped.length > 0 ? foodItemsMapped : null
  } catch (error) {
    if (error instanceof Error) {
      console.error(error.message)
    }
    throw new Error(`Error fetching multiple food details from USDA API while searching for ${params.fdcIds}: ${error}`)
  }
}

async function runTests() {
  /*const result = await getUsdaFoodsInfo({
    fdcIds: ["2341386"]
  })*/
  //const result = await getUsdaFoodsInfo({ fdcIds: ["2341386"] })
  //const result = JSON.parse(`[{"discontinuedDate":"","foodComponents":[],"foodAttributes":[{"id":2319789,"value":9,"name":"Added Package Weight"}],"foodPortions":[],"fdcId":2112945,"description":"SLICED TURKEY BREAST","publicationDate":"10/28/2021","foodNutrients":[{"type":"FoodNutrient","nutrient":{"id":1253,"number":"601","name":"Cholesterol","rank":15700,"unitName":"mg"},"foodNutrientDerivation":{"id":70,"code":"LCCS","description":"Calculated from value per serving size measure"},"id":25246665,"amount":36},{"type":"FoodNutrient","nutrient":{"id":1257,"number":"605","name":"Fatty acids, total trans","rank":15400,"unitName":"g"},"foodNutrientDerivation":{"id":70,"code":"LCCS","description":"Calculated from value per serving size measure"},"id":25246666,"amount":0},{"type":"FoodNutrient","nutrient":{"id":1005,"number":"205","name":"Carbohydrate, by difference","rank":1110,"unitName":"g"},"foodNutrientDerivation":{"id":70,"code":"LCCS","description":"Calculated from value per serving size measure"},"id":25246656,"amount":7.14},{"type":"FoodNutrient","nutrient":{"id":1162,"number":"401","name":"Vitamin C, total ascorbic acid","rank":6300,"unitName":"mg"},"foodNutrientDerivation":{"id":75,"code":"LCCD","description":"Calculated from a daily value percentage per serving size measure"},"id":25246664,"amount":0},{"type":"FoodNutrient","nutrient":{"id":1258,"number":"606","name":"Fatty acids, total saturated","rank":9700,"unitName":"g"},"foodNutrientDerivation":{"id":75,"code":"LCCD","description":"Calculated from a daily value percentage per serving size measure"},"id":25246667,"amount":0},{"type":"FoodNutrient","nutrient":{"id":1079,"number":"291","name":"Fiber, total dietary","rank":1200,"unitName":"g"},"foodNutrientDerivation":{"id":75,"code":"LCCD","description":"Calculated from a daily value percentage per serving size measure"},"id":25246659,"amount":0},{"type":"FoodNutrient","nutrient":{"id":1004,"number":"204","name":"Total lipid (fat)","rank":800,"unitName":"g"},"foodNutrientDerivation":{"id":70,"code":"LCCS","description":"Calculated from value per serving size measure"},"id":25246655,"amount":1.79},{"type":"FoodNutrient","nutrient":{"id":1003,"number":"203","name":"Protein","rank":600,"unitName":"g"},"foodNutrientDerivation":{"id":70,"code":"LCCS","description":"Calculated from value per serving size measure"},"id":25246654,"amount":17.86},{"type":"FoodNutrient","nutrient":{"id":1093,"number":"307","name":"Sodium, Na","rank":5800,"unitName":"mg"},"foodNutrientDerivation":{"id":70,"code":"LCCS","description":"Calculated from value per serving size measure"},"id":25246662,"amount":1000},{"type":"FoodNutrient","nutrient":{"id":1104,"number":"318","name":"Vitamin A, IU","rank":7500,"unitName":"IU"},"foodNutrientDerivation":{"id":75,"code":"LCCD","description":"Calculated from a daily value percentage per serving size measure"},"id":25246663,"amount":0},{"type":"FoodNutrient","nutrient":{"id":1008,"number":"208","name":"Energy","rank":300,"unitName":"kcal"},"foodNutrientDerivation":{"id":70,"code":"LCCS","description":"Calculated from value per serving size measure"},"id":25246657,"amount":107},{"type":"FoodNutrient","nutrient":{"id":1087,"number":"301","name":"Calcium, Ca","rank":5300,"unitName":"mg"},"foodNutrientDerivation":{"id":75,"code":"LCCD","description":"Calculated from a daily value percentage per serving size measure"},"id":25246660,"amount":0},{"type":"FoodNutrient","nutrient":{"id":2000,"number":"269","name":"Sugars, total including NLEA","rank":1510,"unitName":"g"},"foodNutrientDerivation":{"id":70,"code":"LCCS","description":"Calculated from value per serving size measure"},"id":25246658,"amount":3.57},{"type":"FoodNutrient","nutrient":{"id":1089,"number":"303","name":"Iron, Fe","rank":5400,"unitName":"mg"},"foodNutrientDerivation":{"id":75,"code":"LCCD","description":"Calculated from a daily value percentage per serving size measure"},"id":25246661,"amount":1.29}],"dataType":"Branded","foodClass":"Branded","modifiedDate":"8/11/2017","availableDate":"8/11/2017","brandOwner":"Topco Associates, Inc.","brandName":"BUCKLEY FARMS","dataSource":"LI","brandedFoodCategory":"Pepperoni, Salami & Cold Cuts","gtinUpc":"036800463486","ingredients":"TURKEY BREAST, WATER, SALT, DEXTROSE, POTASSIUM LACTATE, MODIFIED CORN STARCH, SODIUM PHOSPHATE, CARAGEENAN, SODIUM DIACETATE, SODIUM ERYTHORBATE, SODIUM NITRITE.","marketCountry":"United States","servingSize":28,"servingSizeUnit":"g","packageWeight":"12 oz/340 g","foodUpdateLog":[{"discontinuedDate":"","foodAttributes":[],"fdcId":2112945,"description":"SLICED TURKEY BREAST","publicationDate":"10/28/2021","dataType":"Branded","foodClass":"Branded","modifiedDate":"8/11/2017","availableDate":"8/11/2017","brandOwner":"Topco Associates, Inc.","brandName":"BUCKLEY FARMS","dataSource":"LI","brandedFoodCategory":"Pepperoni, Salami & Cold Cuts","gtinUpc":"036800463486","ingredients":"TURKEY BREAST, WATER, SALT, DEXTROSE, POTASSIUM LACTATE, MODIFIED CORN STARCH, SODIUM PHOSPHATE, CARAGEENAN, SODIUM DIACETATE, SODIUM ERYTHORBATE, SODIUM NITRITE.","marketCountry":"United States","servingSize":28,"servingSizeUnit":"g","packageWeight":"12 oz/340 g"},{"discontinuedDate":"","foodAttributes":[],"fdcId":1638570,"description":"SLICED TURKEY BREAST","publicationDate":"3/19/2021","dataType":"Branded","foodClass":"Branded","modifiedDate":"8/11/2017","availableDate":"8/11/2017","brandOwner":"Topco Associates, Inc.","brandName":"BUCKLEY FARMS","dataSource":"LI","brandedFoodCategory":"Pepperoni, Salami & Cold Cuts","gtinUpc":"036800463486","ingredients":"TURKEY BREAST, WATER, SALT, DEXTROSE, POTASSIUM LACTATE, MODIFIED CORN STARCH, SODIUM PHOSPHATE, CARAGEENAN, SODIUM DIACETATE, SODIUM ERYTHORBATE, SODIUM NITRITE.","marketCountry":"United States","servingSize":28,"servingSizeUnit":"g"},{"discontinuedDate":"","foodAttributes":[],"fdcId":1346407,"description":"SLICED TURKEY BREAST","publicationDate":"2/26/2021","dataType":"Branded","foodClass":"Branded","modifiedDate":"8/11/2017","availableDate":"8/11/2017","brandOwner":"Topco Associates, Inc.","brandName":"BUCKLEY FARMS","subbrandName":"","dataSource":"LI","brandedFoodCategory":"Pepperoni, Salami & Cold Cuts","gtinUpc":"036800463486","ingredients":"TURKEY BREAST, WATER, SALT, DEXTROSE, POTASSIUM LACTATE, MODIFIED CORN STARCH, SODIUM PHOSPHATE, CARAGEENAN, SODIUM DIACETATE, SODIUM ERYTHORBATE, SODIUM NITRITE.","marketCountry":"United States","servingSize":28,"servingSizeUnit":"g","packageWeight":"","notaSignificantSourceOf":""},{"discontinuedDate":"","foodAttributes":[],"fdcId":1086895,"description":"SLICED TURKEY BREAST","publicationDate":"9/29/2020","dataType":"Branded","foodClass":"Branded","modifiedDate":"8/11/2017","availableDate":"8/11/2017","brandOwner":"Topco Associates, Inc.","dataSource":"LI","brandedFoodCategory":"Pepperoni, Salami & Cold Cuts","gtinUpc":"036800463486","householdServingFullText":"1 SLICE","ingredients":"TURKEY BREAST, WATER, SALT, DEXTROSE, POTASSIUM LACTATE, MODIFIED CORN STARCH, SODIUM PHOSPHATE, CARAGEENAN, SODIUM DIACETATE, SODIUM ERYTHORBATE, SODIUM NITRITE.","marketCountry":"United States","servingSize":28,"servingSizeUnit":"g"}],"labelNutrients":{"fat":{"value":0.501},"saturatedFat":{"value":0},"transFat":{"value":0},"cholesterol":{"value":10.1},"sodium":{"value":280},"carbohydrates":{"value":2},"fiber":{"value":0},"sugars":{"value":1},"protein":{"value":5},"calcium":{"value":0},"iron":{"value":0.361},"calories":{"value":30}}}]`)
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
  const chicken_breast = JSON.parse(`[{"foodClass":"Survey","description":"Chicken breast, baked, coated, skin / coating eaten","foodNutrients":[{"type":"FoodNutrient","id":28581214,"nutrient":{"id":1003,"number":"203","name":"Protein","rank":600,"unitName":"g"},"amount":23.8},{"type":"FoodNutrient","id":28581215,"nutrient":{"id":1004,"number":"204","name":"Total lipid (fat)","rank":800,"unitName":"g"},"amount":9.9},{"type":"FoodNutrient","id":28581216,"nutrient":{"id":1005,"number":"205","name":"Carbohydrate, by difference","rank":1110,"unitName":"g"},"amount":4.01},{"type":"FoodNutrient","id":28581217,"nutrient":{"id":1008,"number":"208","name":"Energy","rank":300,"unitName":"kcal"},"amount":207},{"type":"FoodNutrient","id":28581218,"nutrient":{"id":1018,"number":"221","name":"Alcohol, ethyl","rank":18200,"unitName":"g"},"amount":0},{"type":"FoodNutrient","id":28581219,"nutrient":{"id":1051,"number":"255","name":"Water","rank":100,"unitName":"g"},"amount":60.6},{"type":"FoodNutrient","id":28581220,"nutrient":{"id":1057,"number":"262","name":"Caffeine","rank":18300,"unitName":"mg"},"amount":0},{"type":"FoodNutrient","id":28581221,"nutrient":{"id":1058,"number":"263","name":"Theobromine","rank":18400,"unitName":"mg"},"amount":0},{"type":"FoodNutrient","id":28581222,"nutrient":{"id":2000,"number":"269","name":"Sugars, total including NLEA","rank":1510,"unitName":"g"},"amount":0.07},{"type":"FoodNutrient","id":28581223,"nutrient":{"id":1079,"number":"291","name":"Fiber, total dietary","rank":1200,"unitName":"g"},"amount":0.2},{"type":"FoodNutrient","id":28581224,"nutrient":{"id":1087,"number":"301","name":"Calcium, Ca","rank":5300,"unitName":"mg"},"amount":11},{"type":"FoodNutrient","id":28581225,"nutrient":{"id":1089,"number":"303","name":"Iron, Fe","rank":5400,"unitName":"mg"},"amount":0.77},{"type":"FoodNutrient","id":28581226,"nutrient":{"id":1090,"number":"304","name":"Magnesium, Mg","rank":5500,"unitName":"mg"},"amount":23},{"type":"FoodNutrient","id":28581227,"nutrient":{"id":1091,"number":"305","name":"Phosphorus, P","rank":5600,"unitName":"mg"},"amount":179},{"type":"FoodNutrient","id":28581228,"nutrient":{"id":1092,"number":"306","name":"Potassium, K","rank":5700,"unitName":"mg"},"amount":270},{"type":"FoodNutrient","id":28581229,"nutrient":{"id":1093,"number":"307","name":"Sodium, Na","rank":5800,"unitName":"mg"},"amount":320},{"type":"FoodNutrient","id":28581230,"nutrient":{"id":1095,"number":"309","name":"Zinc, Zn","rank":5900,"unitName":"mg"},"amount":0.84},{"type":"FoodNutrient","id":28581231,"nutrient":{"id":1098,"number":"312","name":"Copper, Cu","rank":6000,"unitName":"mg"},"amount":0.048},{"type":"FoodNutrient","id":28581232,"nutrient":{"id":1103,"number":"317","name":"Selenium, Se","rank":6200,"unitName":"µg"},"amount":24.3},{"type":"FoodNutrient","id":28581233,"nutrient":{"id":1105,"number":"319","name":"Retinol","rank":7430,"unitName":"µg"},"amount":17},{"type":"FoodNutrient","id":28581234,"nutrient":{"id":1106,"number":"320","name":"Vitamin A, RAE","rank":7420,"unitName":"µg"},"amount":17},{"type":"FoodNutrient","id":28581235,"nutrient":{"id":1107,"number":"321","name":"Carotene, beta","rank":7440,"unitName":"µg"},"amount":1},{"type":"FoodNutrient","id":28581236,"nutrient":{"id":1108,"number":"322","name":"Carotene, alpha","rank":7450,"unitName":"µg"},"amount":0},{"type":"FoodNutrient","id":28581237,"nutrient":{"id":1109,"number":"323","name":"Vitamin E (alpha-tocopherol)","rank":7905,"unitName":"mg"},"amount":0.85},{"type":"FoodNutrient","id":28581238,"nutrient":{"id":1114,"number":"328","name":"Vitamin D (D2 + D3)","rank":8700,"unitName":"µg"},"amount":0.1},{"type":"FoodNutrient","id":28581239,"nutrient":{"id":1120,"number":"334","name":"Cryptoxanthin, beta","rank":7460,"unitName":"µg"},"amount":0},{"type":"FoodNutrient","id":28581240,"nutrient":{"id":1122,"number":"337","name":"Lycopene","rank":7530,"unitName":"µg"},"amount":0},{"type":"FoodNutrient","id":28581241,"nutrient":{"id":1123,"number":"338","name":"Lutein + zeaxanthin","rank":7560,"unitName":"µg"},"amount":3},{"type":"FoodNutrient","id":28581242,"nutrient":{"id":1162,"number":"401","name":"Vitamin C, total ascorbic acid","rank":6300,"unitName":"mg"},"amount":0},{"type":"FoodNutrient","id":28581243,"nutrient":{"id":1165,"number":"404","name":"Thiamin","rank":6400,"unitName":"mg"},"amount":0.115},{"type":"FoodNutrient","id":28581244,"nutrient":{"id":1166,"number":"405","name":"Riboflavin","rank":6500,"unitName":"mg"},"amount":0.183},{"type":"FoodNutrient","id":28581245,"nutrient":{"id":1167,"number":"406","name":"Niacin","rank":6600,"unitName":"mg"},"amount":8.01},{"type":"FoodNutrient","id":28581246,"nutrient":{"id":1175,"number":"415","name":"Vitamin B-6","rank":6800,"unitName":"mg"},"amount":0.619},{"type":"FoodNutrient","id":28581247,"nutrient":{"id":1177,"number":"417","name":"Folate, total","rank":6900,"unitName":"µg"},"amount":14},{"type":"FoodNutrient","id":28581248,"nutrient":{"id":1178,"number":"418","name":"Vitamin B-12","rank":7300,"unitName":"µg"},"amount":0.16},{"type":"FoodNutrient","id":28581249,"nutrient":{"id":1180,"number":"421","name":"Choline, total","rank":7220,"unitName":"mg"},"amount":59.1},{"type":"FoodNutrient","id":28581250,"nutrient":{"id":1185,"number":"430","name":"Vitamin K (phylloquinone)","rank":8800,"unitName":"µg"},"amount":2.7},{"type":"FoodNutrient","id":28581251,"nutrient":{"id":1186,"number":"431","name":"Folic acid","rank":7000,"unitName":"µg"},"amount":7},{"type":"FoodNutrient","id":28581252,"nutrient":{"id":1187,"number":"432","name":"Folate, food","rank":7100,"unitName":"µg"},"amount":7},{"type":"FoodNutrient","id":28581253,"nutrient":{"id":1190,"number":"435","name":"Folate, DFE","rank":7200,"unitName":"µg"},"amount":18},{"type":"FoodNutrient","id":28581254,"nutrient":{"id":1242,"number":"573","name":"Vitamin E, added","rank":7920,"unitName":"mg"},"amount":0},{"type":"FoodNutrient","id":28581255,"nutrient":{"id":1246,"number":"578","name":"Vitamin B-12, added","rank":7340,"unitName":"µg"},"amount":0},{"type":"FoodNutrient","id":28581256,"nutrient":{"id":1253,"number":"601","name":"Cholesterol","rank":15700,"unitName":"mg"},"amount":88},{"type":"FoodNutrient","id":28581257,"nutrient":{"id":1258,"number":"606","name":"Fatty acids, total saturated","rank":9700,"unitName":"g"},"amount":2.32},{"type":"FoodNutrient","id":28581258,"nutrient":{"id":1259,"number":"607","name":"SFA 4:0","rank":9800,"unitName":"g"},"amount":0},{"type":"FoodNutrient","id":28581259,"nutrient":{"id":1260,"number":"608","name":"SFA 6:0","rank":9900,"unitName":"g"},"amount":0},{"type":"FoodNutrient","id":28581260,"nutrient":{"id":1261,"number":"609","name":"SFA 8:0","rank":10000,"unitName":"g"},"amount":0},{"type":"FoodNutrient","id":28581261,"nutrient":{"id":1262,"number":"610","name":"SFA 10:0","rank":10100,"unitName":"g"},"amount":0.016},{"type":"FoodNutrient","id":28581262,"nutrient":{"id":1263,"number":"611","name":"SFA 12:0","rank":10300,"unitName":"g"},"amount":0.009},{"type":"FoodNutrient","id":28581263,"nutrient":{"id":1264,"number":"612","name":"SFA 14:0","rank":10500,"unitName":"g"},"amount":0.056},{"type":"FoodNutrient","id":28581264,"nutrient":{"id":1265,"number":"613","name":"SFA 16:0","rank":10700,"unitName":"g"},"amount":1.73},{"type":"FoodNutrient","id":28581265,"nutrient":{"id":1266,"number":"614","name":"SFA 18:0","rank":10900,"unitName":"g"},"amount":0.449},{"type":"FoodNutrient","id":28581266,"nutrient":{"id":1268,"number":"617","name":"MUFA 18:1","rank":12100,"unitName":"g"},"amount":3.18},{"type":"FoodNutrient","id":28581267,"nutrient":{"id":1269,"number":"618","name":"PUFA 18:2","rank":13100,"unitName":"g"},"amount":2.07},{"type":"FoodNutrient","id":28581268,"nutrient":{"id":1270,"number":"619","name":"PUFA 18:3","rank":13900,"unitName":"g"},"amount":0.151},{"type":"FoodNutrient","id":28581269,"nutrient":{"id":1271,"number":"620","name":"PUFA 20:4","rank":14700,"unitName":"g"},"amount":0.059},{"type":"FoodNutrient","id":28581270,"nutrient":{"id":1272,"number":"621","name":"PUFA 22:6 n-3 (DHA)","rank":15300,"unitName":"g"},"amount":0.009},{"type":"FoodNutrient","id":28581271,"nutrient":{"id":1275,"number":"626","name":"MUFA 16:1","rank":11700,"unitName":"g"},"amount":0.399},{"type":"FoodNutrient","id":28581272,"nutrient":{"id":1276,"number":"627","name":"PUFA 18:4","rank":14250,"unitName":"g"},"amount":0},{"type":"FoodNutrient","id":28581273,"nutrient":{"id":1277,"number":"628","name":"MUFA 20:1","rank":12400,"unitName":"g"},"amount":0.092},{"type":"FoodNutrient","id":28581274,"nutrient":{"id":1278,"number":"629","name":"PUFA 20:5 n-3 (EPA)","rank":15000,"unitName":"g"},"amount":0.006},{"type":"FoodNutrient","id":28581275,"nutrient":{"id":1279,"number":"630","name":"MUFA 22:1","rank":12500,"unitName":"g"},"amount":0},{"type":"FoodNutrient","id":28581276,"nutrient":{"id":1280,"number":"631","name":"PUFA 22:5 n-3 (DPA)","rank":15200,"unitName":"g"},"amount":0.007},{"type":"FoodNutrient","id":28581277,"nutrient":{"id":1292,"number":"645","name":"Fatty acids, total monounsaturated","rank":11400,"unitName":"g"},"amount":3.7},{"type":"FoodNutrient","id":28581278,"nutrient":{"id":1293,"number":"646","name":"Fatty acids, total polyunsaturated","rank":12900,"unitName":"g"},"amount":2.36}],"foodAttributes":[{"id":2653640,"value":"NS as to prepared with skin","foodAttributeType":{"id":1001,"name":"Additional Description","description":"Additional descriptions for the food."},"rank":2},{"id":2653641,"value":"NS as to coated or uncoated","foodAttributeType":{"id":1001,"name":"Additional Description","description":"Additional descriptions for the food."},"rank":3},{"id":2653639,"value":"broiled or roasted with coating","foodAttributeType":{"id":1001,"name":"Additional Description","description":"Additional descriptions for the food."},"rank":1},{"id":2653642,"value":"any source","foodAttributeType":{"id":1001,"name":"Additional Description","description":"Additional descriptions for the food."},"rank":4},{"id":2653643,"value":"prepared skinless","foodAttributeType":{"id":1001,"name":"Additional Description","description":"Additional descriptions for the food."},"rank":5},{"id":2642443,"name":"WWEIA Category description","value":"Chicken, whole pieces","foodAttributeType":{"id":999,"name":"Attribute","description":"Generic attributes"}},{"id":2642442,"name":"WWEIA Category number","value":"2202","foodAttributeType":{"id":999,"name":"Attribute","description":"Generic attributes"}},{"id":2663111,"value":"Moisture change: 0%","foodAttributeType":{"id":1002,"name":"Adjustments","description":"Adjustments made to foods, including moisture changes"}}],"foodCode":"24127500","startDate":"1/1/2019","endDate":"12/31/2020","wweiaFoodCategory":{"wweiaFoodCategoryCode":2642443,"wweiaFoodCategoryDescription":"Chicken, whole pieces"},"fdcId":2341386,"dataType":"Survey (FNDDS)","foodPortions":[{"id":270398,"measureUnit":{"id":9999,"name":"undetermined","abbreviation":"undetermined"},"modifier":"64698","gramWeight":150,"sequenceNumber":2,"portionDescription":"1 small breast"},{"id":270402,"measureUnit":{"id":9999,"name":"undetermined","abbreviation":"undetermined"},"modifier":"62138","gramWeight":30,"sequenceNumber":6,"portionDescription":"1 small or thin slice"},{"id":270405,"measureUnit":{"id":9999,"name":"undetermined","abbreviation":"undetermined"},"modifier":"40040","gramWeight":28.35,"sequenceNumber":9,"portionDescription":"1 oz, cooked"},{"id":270406,"measureUnit":{"id":9999,"name":"undetermined","abbreviation":"undetermined"},"modifier":"60453","gramWeight":155,"sequenceNumber":10,"portionDescription":"1 breast quarter (yield after cooking, bone removed)"},{"id":270401,"measureUnit":{"id":9999,"name":"undetermined","abbreviation":"undetermined"},"modifier":"64697","gramWeight":175,"sequenceNumber":5,"portionDescription":"1 breast, NS as to size"},{"id":270407,"measureUnit":{"id":9999,"name":"undetermined","abbreviation":"undetermined"},"modifier":"90000","gramWeight":175,"sequenceNumber":11,"portionDescription":"Quantity not specified"},{"id":270400,"measureUnit":{"id":9999,"name":"undetermined","abbreviation":"undetermined"},"modifier":"64700","gramWeight":195,"sequenceNumber":4,"portionDescription":"1 large breast"},{"id":270404,"measureUnit":{"id":9999,"name":"undetermined","abbreviation":"undetermined"},"modifier":"61039","gramWeight":85,"sequenceNumber":8,"portionDescription":"1 large or thick slice"},{"id":270403,"measureUnit":{"id":9999,"name":"undetermined","abbreviation":"undetermined"},"modifier":"61398","gramWeight":60,"sequenceNumber":7,"portionDescription":"1 medium slice"},{"id":270397,"measureUnit":{"id":9999,"name":"undetermined","abbreviation":"undetermined"},"modifier":"10049","gramWeight":135,"sequenceNumber":1,"portionDescription":"1 cup, cooked, diced"},{"id":270399,"measureUnit":{"id":9999,"name":"undetermined","abbreviation":"undetermined"},"modifier":"64699","gramWeight":175,"sequenceNumber":3,"portionDescription":"1 medium breast"}],"publicationDate":"10/28/2022","inputFoods":[{"id":105466,"unit":"GM","portionDescription":"NONE","portionCode":"0","foodDescription":"Breading or batter as ingredient in food","sequenceNumber":3,"ingredientWeight":10,"ingredientCode":99995000,"ingredientDescription":"Breading or batter as ingredient in food","amount":10},{"id":105465,"unit":"GM","portionDescription":"NONE","portionCode":"0","foodDescription":"Vegetable oil, NFS","sequenceNumber":2,"ingredientWeight":2,"ingredientCode":82101000,"ingredientDescription":"Vegetable oil, NFS","amount":2},{"id":105464,"unit":"GM","portionDescription":"NONE","portionCode":"0","foodDescription":"Chicken breast, baked, broiled, or roasted, skin eaten, from raw","sequenceNumber":1,"ingredientWeight":88,"ingredientCode":24122130,"ingredientDescription":"Chicken breast, baked, broiled, or roasted, skin eaten, from raw","amount":88}]},{"foodClass":"Survey","description":"Chicken breast, baked, coated, skin / coating eaten","foodNutrients":[{"type":"FoodNutrient","id":28581214,"nutrient":{"id":1003,"number":"203","name":"Protein","rank":600,"unitName":"g"},"amount":23.8},{"type":"FoodNutrient","id":28581215,"nutrient":{"id":1004,"number":"204","name":"Total lipid (fat)","rank":800,"unitName":"g"},"amount":9.9},{"type":"FoodNutrient","id":28581216,"nutrient":{"id":1005,"number":"205","name":"Carbohydrate, by difference","rank":1110,"unitName":"g"},"amount":4.01},{"type":"FoodNutrient","id":28581217,"nutrient":{"id":1008,"number":"208","name":"Energy","rank":300,"unitName":"kcal"},"amount":207},{"type":"FoodNutrient","id":28581218,"nutrient":{"id":1018,"number":"221","name":"Alcohol, ethyl","rank":18200,"unitName":"g"},"amount":0},{"type":"FoodNutrient","id":28581219,"nutrient":{"id":1051,"number":"255","name":"Water","rank":100,"unitName":"g"},"amount":60.6},{"type":"FoodNutrient","id":28581220,"nutrient":{"id":1057,"number":"262","name":"Caffeine","rank":18300,"unitName":"mg"},"amount":0},{"type":"FoodNutrient","id":28581221,"nutrient":{"id":1058,"number":"263","name":"Theobromine","rank":18400,"unitName":"mg"},"amount":0},{"type":"FoodNutrient","id":28581222,"nutrient":{"id":2000,"number":"269","name":"Sugars, total including NLEA","rank":1510,"unitName":"g"},"amount":0.07},{"type":"FoodNutrient","id":28581223,"nutrient":{"id":1079,"number":"291","name":"Fiber, total dietary","rank":1200,"unitName":"g"},"amount":0.2},{"type":"FoodNutrient","id":28581224,"nutrient":{"id":1087,"number":"301","name":"Calcium, Ca","rank":5300,"unitName":"mg"},"amount":11},{"type":"FoodNutrient","id":28581225,"nutrient":{"id":1089,"number":"303","name":"Iron, Fe","rank":5400,"unitName":"mg"},"amount":0.77},{"type":"FoodNutrient","id":28581226,"nutrient":{"id":1090,"number":"304","name":"Magnesium, Mg","rank":5500,"unitName":"mg"},"amount":23},{"type":"FoodNutrient","id":28581227,"nutrient":{"id":1091,"number":"305","name":"Phosphorus, P","rank":5600,"unitName":"mg"},"amount":179},{"type":"FoodNutrient","id":28581228,"nutrient":{"id":1092,"number":"306","name":"Potassium, K","rank":5700,"unitName":"mg"},"amount":270},{"type":"FoodNutrient","id":28581229,"nutrient":{"id":1093,"number":"307","name":"Sodium, Na","rank":5800,"unitName":"mg"},"amount":320},{"type":"FoodNutrient","id":28581230,"nutrient":{"id":1095,"number":"309","name":"Zinc, Zn","rank":5900,"unitName":"mg"},"amount":0.84},{"type":"FoodNutrient","id":28581231,"nutrient":{"id":1098,"number":"312","name":"Copper, Cu","rank":6000,"unitName":"mg"},"amount":0.048},{"type":"FoodNutrient","id":28581232,"nutrient":{"id":1103,"number":"317","name":"Selenium, Se","rank":6200,"unitName":"µg"},"amount":24.3},{"type":"FoodNutrient","id":28581233,"nutrient":{"id":1105,"number":"319","name":"Retinol","rank":7430,"unitName":"µg"},"amount":17},{"type":"FoodNutrient","id":28581234,"nutrient":{"id":1106,"number":"320","name":"Vitamin A, RAE","rank":7420,"unitName":"µg"},"amount":17},{"type":"FoodNutrient","id":28581235,"nutrient":{"id":1107,"number":"321","name":"Carotene, beta","rank":7440,"unitName":"µg"},"amount":1},{"type":"FoodNutrient","id":28581236,"nutrient":{"id":1108,"number":"322","name":"Carotene, alpha","rank":7450,"unitName":"µg"},"amount":0},{"type":"FoodNutrient","id":28581237,"nutrient":{"id":1109,"number":"323","name":"Vitamin E (alpha-tocopherol)","rank":7905,"unitName":"mg"},"amount":0.85},{"type":"FoodNutrient","id":28581238,"nutrient":{"id":1114,"number":"328","name":"Vitamin D (D2 + D3)","rank":8700,"unitName":"µg"},"amount":0.1},{"type":"FoodNutrient","id":28581239,"nutrient":{"id":1120,"number":"334","name":"Cryptoxanthin, beta","rank":7460,"unitName":"µg"},"amount":0},{"type":"FoodNutrient","id":28581240,"nutrient":{"id":1122,"number":"337","name":"Lycopene","rank":7530,"unitName":"µg"},"amount":0},{"type":"FoodNutrient","id":28581241,"nutrient":{"id":1123,"number":"338","name":"Lutein + zeaxanthin","rank":7560,"unitName":"µg"},"amount":3},{"type":"FoodNutrient","id":28581242,"nutrient":{"id":1162,"number":"401","name":"Vitamin C, total ascorbic acid","rank":6300,"unitName":"mg"},"amount":0},{"type":"FoodNutrient","id":28581243,"nutrient":{"id":1165,"number":"404","name":"Thiamin","rank":6400,"unitName":"mg"},"amount":0.115},{"type":"FoodNutrient","id":28581244,"nutrient":{"id":1166,"number":"405","name":"Riboflavin","rank":6500,"unitName":"mg"},"amount":0.183},{"type":"FoodNutrient","id":28581245,"nutrient":{"id":1167,"number":"406","name":"Niacin","rank":6600,"unitName":"mg"},"amount":8.01},{"type":"FoodNutrient","id":28581246,"nutrient":{"id":1175,"number":"415","name":"Vitamin B-6","rank":6800,"unitName":"mg"},"amount":0.619},{"type":"FoodNutrient","id":28581247,"nutrient":{"id":1177,"number":"417","name":"Folate, total","rank":6900,"unitName":"µg"},"amount":14},{"type":"FoodNutrient","id":28581248,"nutrient":{"id":1178,"number":"418","name":"Vitamin B-12","rank":7300,"unitName":"µg"},"amount":0.16},{"type":"FoodNutrient","id":28581249,"nutrient":{"id":1180,"number":"421","name":"Choline, total","rank":7220,"unitName":"mg"},"amount":59.1},{"type":"FoodNutrient","id":28581250,"nutrient":{"id":1185,"number":"430","name":"Vitamin K (phylloquinone)","rank":8800,"unitName":"µg"},"amount":2.7},{"type":"FoodNutrient","id":28581251,"nutrient":{"id":1186,"number":"431","name":"Folic acid","rank":7000,"unitName":"µg"},"amount":7},{"type":"FoodNutrient","id":28581252,"nutrient":{"id":1187,"number":"432","name":"Folate, food","rank":7100,"unitName":"µg"},"amount":7},{"type":"FoodNutrient","id":28581253,"nutrient":{"id":1190,"number":"435","name":"Folate, DFE","rank":7200,"unitName":"µg"},"amount":18},{"type":"FoodNutrient","id":28581254,"nutrient":{"id":1242,"number":"573","name":"Vitamin E, added","rank":7920,"unitName":"mg"},"amount":0},{"type":"FoodNutrient","id":28581255,"nutrient":{"id":1246,"number":"578","name":"Vitamin B-12, added","rank":7340,"unitName":"µg"},"amount":0},{"type":"FoodNutrient","id":28581256,"nutrient":{"id":1253,"number":"601","name":"Cholesterol","rank":15700,"unitName":"mg"},"amount":88},{"type":"FoodNutrient","id":28581257,"nutrient":{"id":1258,"number":"606","name":"Fatty acids, total saturated","rank":9700,"unitName":"g"},"amount":2.32},{"type":"FoodNutrient","id":28581258,"nutrient":{"id":1259,"number":"607","name":"SFA 4:0","rank":9800,"unitName":"g"},"amount":0},{"type":"FoodNutrient","id":28581259,"nutrient":{"id":1260,"number":"608","name":"SFA 6:0","rank":9900,"unitName":"g"},"amount":0},{"type":"FoodNutrient","id":28581260,"nutrient":{"id":1261,"number":"609","name":"SFA 8:0","rank":10000,"unitName":"g"},"amount":0},{"type":"FoodNutrient","id":28581261,"nutrient":{"id":1262,"number":"610","name":"SFA 10:0","rank":10100,"unitName":"g"},"amount":0.016},{"type":"FoodNutrient","id":28581262,"nutrient":{"id":1263,"number":"611","name":"SFA 12:0","rank":10300,"unitName":"g"},"amount":0.009},{"type":"FoodNutrient","id":28581263,"nutrient":{"id":1264,"number":"612","name":"SFA 14:0","rank":10500,"unitName":"g"},"amount":0.056},{"type":"FoodNutrient","id":28581264,"nutrient":{"id":1265,"number":"613","name":"SFA 16:0","rank":10700,"unitName":"g"},"amount":1.73},{"type":"FoodNutrient","id":28581265,"nutrient":{"id":1266,"number":"614","name":"SFA 18:0","rank":10900,"unitName":"g"},"amount":0.449},{"type":"FoodNutrient","id":28581266,"nutrient":{"id":1268,"number":"617","name":"MUFA 18:1","rank":12100,"unitName":"g"},"amount":3.18},{"type":"FoodNutrient","id":28581267,"nutrient":{"id":1269,"number":"618","name":"PUFA 18:2","rank":13100,"unitName":"g"},"amount":2.07},{"type":"FoodNutrient","id":28581268,"nutrient":{"id":1270,"number":"619","name":"PUFA 18:3","rank":13900,"unitName":"g"},"amount":0.151},{"type":"FoodNutrient","id":28581269,"nutrient":{"id":1271,"number":"620","name":"PUFA 20:4","rank":14700,"unitName":"g"},"amount":0.059},{"type":"FoodNutrient","id":28581270,"nutrient":{"id":1272,"number":"621","name":"PUFA 22:6 n-3 (DHA)","rank":15300,"unitName":"g"},"amount":0.009},{"type":"FoodNutrient","id":28581271,"nutrient":{"id":1275,"number":"626","name":"MUFA 16:1","rank":11700,"unitName":"g"},"amount":0.399},{"type":"FoodNutrient","id":28581272,"nutrient":{"id":1276,"number":"627","name":"PUFA 18:4","rank":14250,"unitName":"g"},"amount":0},{"type":"FoodNutrient","id":28581273,"nutrient":{"id":1277,"number":"628","name":"MUFA 20:1","rank":12400,"unitName":"g"},"amount":0.092},{"type":"FoodNutrient","id":28581274,"nutrient":{"id":1278,"number":"629","name":"PUFA 20:5 n-3 (EPA)","rank":15000,"unitName":"g"},"amount":0.006},{"type":"FoodNutrient","id":28581275,"nutrient":{"id":1279,"number":"630","name":"MUFA 22:1","rank":12500,"unitName":"g"},"amount":0},{"type":"FoodNutrient","id":28581276,"nutrient":{"id":1280,"number":"631","name":"PUFA 22:5 n-3 (DPA)","rank":15200,"unitName":"g"},"amount":0.007},{"type":"FoodNutrient","id":28581277,"nutrient":{"id":1292,"number":"645","name":"Fatty acids, total monounsaturated","rank":11400,"unitName":"g"},"amount":3.7},{"type":"FoodNutrient","id":28581278,"nutrient":{"id":1293,"number":"646","name":"Fatty acids, total polyunsaturated","rank":12900,"unitName":"g"},"amount":2.36}],"foodAttributes":[{"id":2653640,"value":"NS as to prepared with skin","foodAttributeType":{"id":1001,"name":"Additional Description","description":"Additional descriptions for the food."},"rank":2},{"id":2653641,"value":"NS as to coated or uncoated","foodAttributeType":{"id":1001,"name":"Additional Description","description":"Additional descriptions for the food."},"rank":3},{"id":2653639,"value":"broiled or roasted with coating","foodAttributeType":{"id":1001,"name":"Additional Description","description":"Additional descriptions for the food."},"rank":1},{"id":2653642,"value":"any source","foodAttributeType":{"id":1001,"name":"Additional Description","description":"Additional descriptions for the food."},"rank":4},{"id":2653643,"value":"prepared skinless","foodAttributeType":{"id":1001,"name":"Additional Description","description":"Additional descriptions for the food."},"rank":5},{"id":2642443,"name":"WWEIA Category description","value":"Chicken, whole pieces","foodAttributeType":{"id":999,"name":"Attribute","description":"Generic attributes"}},{"id":2642442,"name":"WWEIA Category number","value":"2202","foodAttributeType":{"id":999,"name":"Attribute","description":"Generic attributes"}},{"id":2663111,"value":"Moisture change: 0%","foodAttributeType":{"id":1002,"name":"Adjustments","description":"Adjustments made to foods, including moisture changes"}}],"foodCode":"24127500","startDate":"1/1/2019","endDate":"12/31/2020","wweiaFoodCategory":{"wweiaFoodCategoryCode":2642443,"wweiaFoodCategoryDescription":"Chicken, whole pieces"},"fdcId":2341386,"dataType":"Survey (FNDDS)","foodPortions":[{"id":270398,"measureUnit":{"id":9999,"name":"undetermined","abbreviation":"undetermined"},"modifier":"64698","gramWeight":150,"sequenceNumber":2,"portionDescription":"1 small breast"},{"id":270402,"measureUnit":{"id":9999,"name":"undetermined","abbreviation":"undetermined"},"modifier":"62138","gramWeight":30,"sequenceNumber":6,"portionDescription":"1 small or thin slice"},{"id":270405,"measureUnit":{"id":9999,"name":"undetermined","abbreviation":"undetermined"},"modifier":"40040","gramWeight":28.35,"sequenceNumber":9,"portionDescription":"1 oz, cooked"},{"id":270406,"measureUnit":{"id":9999,"name":"undetermined","abbreviation":"undetermined"},"modifier":"60453","gramWeight":155,"sequenceNumber":10,"portionDescription":"1 breast quarter (yield after cooking, bone removed)"},{"id":270401,"measureUnit":{"id":9999,"name":"undetermined","abbreviation":"undetermined"},"modifier":"64697","gramWeight":175,"sequenceNumber":5,"portionDescription":"1 breast, NS as to size"},{"id":270407,"measureUnit":{"id":9999,"name":"undetermined","abbreviation":"undetermined"},"modifier":"90000","gramWeight":175,"sequenceNumber":11,"portionDescription":"Quantity not specified"},{"id":270400,"measureUnit":{"id":9999,"name":"undetermined","abbreviation":"undetermined"},"modifier":"64700","gramWeight":195,"sequenceNumber":4,"portionDescription":"1 large breast"},{"id":270404,"measureUnit":{"id":9999,"name":"undetermined","abbreviation":"undetermined"},"modifier":"61039","gramWeight":85,"sequenceNumber":8,"portionDescription":"1 large or thick slice"},{"id":270403,"measureUnit":{"id":9999,"name":"undetermined","abbreviation":"undetermined"},"modifier":"61398","gramWeight":60,"sequenceNumber":7,"portionDescription":"1 medium slice"},{"id":270397,"measureUnit":{"id":9999,"name":"undetermined","abbreviation":"undetermined"},"modifier":"10049","gramWeight":135,"sequenceNumber":1,"portionDescription":"1 cup, cooked, diced"},{"id":270399,"measureUnit":{"id":9999,"name":"undetermined","abbreviation":"undetermined"},"modifier":"64699","gramWeight":175,"sequenceNumber":3,"portionDescription":"1 medium breast"}],"publicationDate":"10/28/2022","inputFoods":[{"id":105466,"unit":"GM","portionDescription":"NONE","portionCode":"0","foodDescription":"Breading or batter as ingredient in food","sequenceNumber":3,"ingredientWeight":10,"ingredientCode":99995000,"ingredientDescription":"Breading or batter as ingredient in food","amount":10},{"id":105465,"unit":"GM","portionDescription":"NONE","portionCode":"0","foodDescription":"Vegetable oil, NFS","sequenceNumber":2,"ingredientWeight":2,"ingredientCode":82101000,"ingredientDescription":"Vegetable oil, NFS","amount":2},{"id":105464,"unit":"GM","portionDescription":"NONE","portionCode":"0","foodDescription":"Chicken breast, baked, broiled, or roasted, skin eaten, from raw","sequenceNumber":1,"ingredientWeight":88,"ingredientCode":24122130,"ingredientDescription":"Chicken breast, baked, broiled, or roasted, skin eaten, from raw","amount":88}]}]`)
  //console.log(chicken_breast[0])
  const extracted_info = extractFoodInfo(chicken_breast[0], foodAttributesToQuery )
  console.log("extracted_info", extracted_info)
  console.log("mapped to FoodItem", mapUsdaFoodItemToFoodItem(extracted_info))
  //console.log(JSON.stringify(result))
  /*console.log(
    JSON.stringify(
      result,
      (_, value) => (typeof value === "bigint" ? value.toString() : value) // convert bigint to string
    )
  )*/
  console.log("_____________________")
}

//runTests()
