import { Tables } from "types/supabase"

interface FoodNutrient extends Omit<Tables<"Nutrient">, "id" | "foodItemId"> {}

interface AminoServing extends Omit<Tables<"Serving">, "id" | "foodItemId"> {}

export interface FoodItemWithServings extends Omit<Tables<"FoodItem">, "Serving" | "Nutrient"> {
  Serving: AminoServing[]
  Nutrient: FoodNutrient[]
}

export interface FsServing {
  serving_id: string
  serving_description: string
  serving_url: string
  metric_serving_amount: number
  metric_serving_unit?: "g" | "ml" | "oz"
  number_of_units?: number
  measurement_description?: string
  calories?: number
  carbohydrate?: number
  protein?: number
  fat?: number
  saturated_fat?: number
  polyunsaturated_fat?: number
  monounsaturated_fat?: number
  trans_fat?: number
  cholesterol?: number
  sodium?: number
  potassium?: number
  fiber?: number
  sugar?: number
  added_sugars?: number
  vitamin_a?: number
  vitamin_c?: number
  vitamin_d?: number
  calcium?: number
  iron?: number
}

export interface FsFoodInfo {
  food_id: string
  food_name: string
  food_type: string
  food_url: string
  brand_name: string | null
  servings: {
    serving: FsServing[]
  }
}
function deduplicateServings(servings: FsServing[]): FsServing[] {
  const servingMap = new Map<number, FsServing>()

  for (const serving of servings) {
    const weight = serving.metric_serving_amount
    const existingServing = servingMap.get(weight)

    if (!existingServing) {
      servingMap.set(weight, serving)
    } else {
      if (serving.serving_description.length < existingServing.serving_description.length) {
        servingMap.set(weight, serving)
      }
    }
  }

  return Array.from(servingMap.values())
}

function mapNutrients(serving: FsServing, unitConversionFactor: number): FoodNutrient[] {
  const formatNutrientName = (name: string): string => {
    return name
      .split("_")
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(" ")
  }

  const nutrientsToMap = [
    { name: "cholesterol", unit: "mg" },
    { name: "potassium", unit: "mg" },
    { name: "vitamin_a", unit: "µg" },
    { name: "vitamin_c", unit: "mg" },
    { name: "vitamin_d", unit: "µg" }
  ]

  return nutrientsToMap
    .filter(({ name }) => serving[name as keyof FsServing] !== undefined)
    .map(({ name, unit }) => {
      return {
        nutrientName: formatNutrientName(name),
        nutrientAmountPerDefaultServing: parseFloat(Number(serving[name as keyof FsServing]).toFixed(3)),
        nutrientUnit: unit
      }
    })
}

export function convertFsToFoodItem(fsFoodItem: FsFoodInfo): FoodItemWithServings {
  const deduplicatedServings = deduplicateServings(fsFoodItem.servings.serving)

  let serving = deduplicatedServings.find(
    (serving) => Number(serving.metric_serving_amount) === 100 && serving.metric_serving_unit === "g"
  )

  if (!serving) {
    // If there's no 100g serving, select the first serving
    // console.log("No 100g serving found for", fsFoodItem.food_name)
    serving = fsFoodItem.servings.serving[0]
  }

  // Convert units if necessary
  let unitConversionFactor = 1
  if (serving.metric_serving_unit === "oz") {
    // console.log("Converting oz to g for", fsFoodItem.food_name)
    unitConversionFactor = 28.3495
    serving.metric_serving_unit = "g"
  }

  serving.metric_serving_amount *= unitConversionFactor

  let weightUnknown = false
  if (Number.isNaN(serving.metric_serving_amount)) {
    console.log("Weight unknown for", fsFoodItem.food_name)
    weightUnknown = true
    //serving.metric_serving_amount = 10
    serving.metric_serving_unit = "g"
  }

  // get nutrients
  const nutrients = mapNutrients(serving, unitConversionFactor)

  // Map fsFoodItem to FoodItem
  const foodItem: FoodItemWithServings = {
    id: 0,
    createdAtDateTime: new Date().toISOString(),
    externalId: fsFoodItem.food_id,
    UPC: null,
    knownAs: [],
    description: null,
    lastUpdated: new Date().toISOString(),
    verified: true,
    userId: null,
    foodInfoSource: "FATSECRET",
    messageId: null,
    name: fsFoodItem.food_name,
    brand: fsFoodItem.brand_name,
    defaultServingWeightGram: serving.metric_serving_unit === "g" ? Number(serving.metric_serving_amount) : null,
    defaultServingLiquidMl: serving.metric_serving_unit === "ml" ? serving.metric_serving_amount : null,
    isLiquid: serving.metric_serving_unit === "ml",
    weightUnknown: weightUnknown,
    // For fields that are Float (non-nullable) in your schema:
    kcalPerServing: Number(serving.calories) || 0,
    totalFatPerServing: Number(serving.fat) || 0,
    carbPerServing: Number(serving.carbohydrate) || 0,
    proteinPerServing: Number(serving.protein) || 0,

    // For fields that are Float? (nullable) in your schema:
    satFatPerServing: serving.saturated_fat ? Number(serving.saturated_fat) : null,
    fiberPerServing: serving.fiber ? Number(serving.fiber) : null,
    sugarPerServing: serving.sugar ? Number(serving.sugar) : null,
    transFatPerServing: serving.trans_fat ? Number(serving.trans_fat) : null,
    addedSugarPerServing: serving.added_sugars ? Number(serving.added_sugars) : null,
    Serving: deduplicatedServings
      .filter(
        (serving) => !(Number(serving.metric_serving_amount) === 100 && serving.metric_serving_unit === "g") &&
          !(Number(serving.metric_serving_amount) === 28.35 && serving.measurement_description === "oz")
      )
      .map((serving) => ({
        servingWeightGram: serving.metric_serving_unit === "g" ? Number(serving.metric_serving_amount) : null,
        servingAlternateAmount: serving.metric_serving_unit !== "g" && serving.number_of_units ? Number(serving.number_of_units) : null,
        servingAlternateUnit: serving.metric_serving_unit !== "g" && serving.measurement_description
          ? serving.measurement_description
          : null,
        servingName: serving.serving_description
      })),
    Nutrient: nutrients,
    adaEmbedding: null,
    bgeBaseEmbedding: null
  }

  return foodItem
}
/*
function runTest() {
  const fsFoodItem: FsFoodInfo = JSON.parse(
    `{"food_id":"36421","food_name":"Mushrooms","food_type":"Generic","food_url":"https://www.fatsecret.com/calories-nutrition/usda/mushrooms","servings":{"serving":[{"calcium":"2","calories":"15","carbohydrate":"2.30","cholesterol":"0","fat":"0.24","fiber":"0.7","iron":"0.35","measurement_description":"cup, pieces or slices","metric_serving_amount":"70.000","metric_serving_unit":"g","monounsaturated_fat":"0","number_of_units":"1.000","polyunsaturated_fat":"0.112","potassium":"223","protein":"2.16","saturated_fat":"0.035","serving_description":"1 cup pieces or slices","serving_id":"34244","serving_url":"https://www.fatsecret.com/calories-nutrition/usda/mushrooms?portionid=34244&portionamount=1.000","sodium":"4","sugar":"1.16","vitamin_a":"0","vitamin_c":"1.5","vitamin_d":"1"},{"calcium":"3","calories":"21","carbohydrate":"3.15","cholesterol":"0","fat":"0.33","fiber":"1.0","iron":"0.48","measurement_description":"cup, whole","metric_serving_amount":"96.000","metric_serving_unit":"g","monounsaturated_fat":"0","number_of_units":"1.000","polyunsaturated_fat":"0.154","potassium":"305","protein":"2.97","saturated_fat":"0.048","serving_description":"1 cup whole","serving_id":"34245","serving_url":"https://www.fatsecret.com/calories-nutrition/usda/mushrooms?portionid=34245&portionamount=1.000","sodium":"5","sugar":"1.58","vitamin_a":"0","vitamin_c":"2.0","vitamin_d":"2"},{"calcium":"1","calories":"5","carbohydrate":"0.75","cholesterol":"0","fat":"0.08","fiber":"0.2","iron":"0.12","measurement_description":"large","metric_serving_amount":"23.000","metric_serving_unit":"g","monounsaturated_fat":"0","number_of_units":"1.000","polyunsaturated_fat":"0.037","potassium":"73","protein":"0.71","saturated_fat":"0.012","serving_description":"1 large","serving_id":"34246","serving_url":"https://www.fatsecret.com/calories-nutrition/usda/mushrooms?portionid=34246&portionamount=1.000","sodium":"1","sugar":"0.38","vitamin_a":"0","vitamin_c":"0.5","vitamin_d":"0"},{"calcium":"1","calories":"4","carbohydrate":"0.59","cholesterol":"0","fat":"0.06","fiber":"0.2","iron":"0.09","measurement_description":"medium","metric_serving_amount":"18.000","metric_serving_unit":"g","monounsaturated_fat":"0","number_of_units":"1.000","polyunsaturated_fat":"0.029","potassium":"57","protein":"0.56","saturated_fat":"0.009","serving_description":"1 medium","serving_id":"34247","serving_url":"https://www.fatsecret.com/calories-nutrition/usda/mushrooms?portionid=34247&portionamount=1.000","sodium":"1","sugar":"0.30","vitamin_a":"0","vitamin_c":"0.4","vitamin_d":"0"},{"calcium":"0","calories":"1","carbohydrate":"0.20","cholesterol":"0","fat":"0.02","fiber":"0.1","iron":"0.03","measurement_description":"slice","metric_serving_amount":"6.000","metric_serving_unit":"g","monounsaturated_fat":"0","number_of_units":"1.000","polyunsaturated_fat":"0.010","potassium":"19","protein":"0.19","saturated_fat":"0.003","serving_description":"1 slice","serving_id":"34248","serving_url":"https://www.fatsecret.com/calories-nutrition/usda/mushrooms?portionid=34248&portionamount=1.000","sodium":"0","sugar":"0.10","vitamin_a":"0","vitamin_c":"0.1","vitamin_d":"0"},{"calcium":"0","calories":"2","carbohydrate":"0.33","cholesterol":"0","fat":"0.03","fiber":"0.1","iron":"0.05","measurement_description":"small","metric_serving_amount":"10.000","metric_serving_unit":"g","monounsaturated_fat":"0","number_of_units":"1.000","polyunsaturated_fat":"0.016","potassium":"32","protein":"0.31","saturated_fat":"0.005","serving_description":"1 small","serving_id":"34249","serving_url":"https://www.fatsecret.com/calories-nutrition/usda/mushrooms?portionid=34249&portionamount=1.000","sodium":"0","sugar":"0.16","vitamin_a":"0","vitamin_c":"0.2","vitamin_d":"0"},{"calcium":"1","calories":"8","carbohydrate":"1.15","cholesterol":"0","fat":"0.12","fiber":"0.4","iron":"0.18","measurement_description":"cup pieces","metric_serving_amount":"35.000","metric_serving_unit":"g","monounsaturated_fat":"0","number_of_units":"0.500","polyunsaturated_fat":"0.056","potassium":"111","protein":"1.08","saturated_fat":"0.018","serving_description":"1/2 cup pieces","serving_id":"34250","serving_url":"https://www.fatsecret.com/calories-nutrition/usda/mushrooms?portionid=34250&portionamount=0.500","sodium":"2","sugar":"0.58","vitamin_a":"0","vitamin_c":"0.7","vitamin_d":"1"},{"calcium":"1","calories":"6","carbohydrate":"0.93","cholesterol":"0","fat":"0.10","fiber":"0.3","iron":"0.14","measurement_description":"oz","metric_serving_amount":"28.350","metric_serving_unit":"g","monounsaturated_fat":"0","number_of_units":"1.000","polyunsaturated_fat":"0.045","potassium":"90","protein":"0.88","saturated_fat":"0.014","serving_description":"1 oz","serving_id":"44166","serving_url":"https://www.fatsecret.com/calories-nutrition/usda/mushrooms?portionid=44166&portionamount=1.000","sodium":"1","sugar":"0.47","vitamin_a":"0","vitamin_c":"0.6","vitamin_d":"1"},{"calcium":"14","calories":"100","carbohydrate":"14.88","cholesterol":"0","fat":"1.54","fiber":"4.5","iron":"2.27","measurement_description":"lb","metric_serving_amount":"453.600","metric_serving_unit":"g","monounsaturated_fat":"0","number_of_units":"1.000","polyunsaturated_fat":"0.726","potassium":"1442","protein":"14.02","saturated_fat":"0.227","serving_description":"1 lb","serving_id":"48813","serving_url":"https://www.fatsecret.com/calories-nutrition/usda/mushrooms?portionid=48813&portionamount=1.000","sodium":"23","sugar":"7.48","vitamin_a":"0","vitamin_c":"9.5","vitamin_d":"9"},{"calcium":"3","calories":"22","carbohydrate":"3.28","cholesterol":"0","fat":"0.34","fiber":"1.0","iron":"0.50","measurement_description":"g","metric_serving_amount":"100.000","metric_serving_unit":"g","monounsaturated_fat":"0","number_of_units":"100.000","polyunsaturated_fat":"0.160","potassium":"318","protein":"3.09","saturated_fat":"0.050","serving_description":"100 g","serving_id":"59152","serving_url":"https://www.fatsecret.com/calories-nutrition/usda/mushrooms?portionid=59152&portionamount=100.000","sodium":"5","sugar":"1.65","vitamin_a":"0","vitamin_c":"2.1","vitamin_d":"2"}]}}`
  )
  console.log(convertFsToFoodItem(fsFoodItem))
}

runTest()
*/
