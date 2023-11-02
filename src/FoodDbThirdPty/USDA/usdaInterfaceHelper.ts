import { Tables } from "types/supabase"
import { toTitleCase } from "../../utils/nlpHelper"

interface FoodNutrient extends Omit<Tables<"Nutrient">, "id" | "foodItemId"> {}

interface UsdaServing extends Omit<Tables<"Serving">, "id" | "foodItemId"> {}

export interface FoodItemWithServings extends Omit<Tables<"FoodItem">, "Serving" | "Nutrient"> {
  Serving: UsdaServing[]
  Nutrient: FoodNutrient[]
}

interface Portion {
  servingSize: number
  servingSizeUnit: string
  householdServingFullText: string
  gramWeight?: number
  name?: string
}

export interface UsdaFoodItem {
  itemName: string
  fdcId: number
  branded: boolean
  brandName: string | null
  foodInfo: { [key: string]: { amount: number | null; unit: string | null } }
  default_serving: {
    default_serving_amount: number
    default_serving_unit: string
  }
  portions: Portion[]
  householdServingFullText?: string
  servingSize?: number
  servingSizeUnit?: string
  packageWeight?: string
  upc?: string
}

export function mapUsdaFoodItemToFoodItem(usdaFoodItem: UsdaFoodItem): FoodItemWithServings {
  const nutrientNameToFoodItemKey: {
    [key: string]: keyof FoodItemWithServings
  } = {
    Energy: "kcalPerServing",
    calories: "kcalPerServing",
    "Energy (Atwater General Factors)": "kcalPerServing",
    Protein: "proteinPerServing",
    protein: "proteinPerServing",
    fiber: "fiberPerServing",
    "Fiber, total dietary": "fiberPerServing",
    "Total dietary fiber (AOAC 2011.25)": "fiberPerServing",
    "Total lipid (fat)": "totalFatPerServing",
    "Total fat (NLEA)": "totalFatPerServing",
    fat: "totalFatPerServing",
    "Carbohydrate, by difference": "carbPerServing",
    "Carbohydrate, by summation": "carbPerServing",
    "Sugars, total including NLEA": "sugarPerServing",
    "Sugars, Total": "sugarPerServing",
    "Fatty acids, total saturated": "satFatPerServing",
    saturatedFat: "satFatPerServing",
    transFat: "transFatPerServing",
    carbohydrates: "carbPerServing",
    sugars: "sugarPerServing",
    addedSugar: "addedSugarPerServing",
    "Fatty acids, total trans": "transFatPerServing",
    "Sugars, added": "addedSugarPerServing"
  }

  //console.log("portions:", JSON.stringify(usdaFoodItem.portions, null, 2))

  const foodItem: FoodItemWithServings = {
    id: 0,
    knownAs: [],
    description: null,
    lastUpdated: new Date().toISOString(),
    verified: true,
    userId: null,
    foodInfoSource: "USDA",
    messageId: null,
    name: toTitleCase(usdaFoodItem.itemName),
    brand: toTitleCase(usdaFoodItem.brandName || ""),
    weightUnknown: false,
    defaultServingWeightGram:
      usdaFoodItem.default_serving.default_serving_unit === "g"
        ? usdaFoodItem.default_serving.default_serving_amount
        : null,
    defaultServingLiquidMl:
      usdaFoodItem.default_serving.default_serving_unit === "ml"
        ? usdaFoodItem.default_serving.default_serving_amount
        : null,
    isLiquid: usdaFoodItem.default_serving.default_serving_unit === "ml",
    Serving: usdaFoodItem.portions.map((portion) => {
      let servingWeightGram = null
      let servingAlternateAmount = null
      let servingAlternateUnit = null

      // Prioritize gramWeight if available
      if (portion.gramWeight) {
        servingWeightGram = portion.gramWeight
      } else {
        servingWeightGram = portion.servingSizeUnit === "g" ? portion.servingSize : null
        servingAlternateAmount = portion.servingSizeUnit !== "g" ? portion.servingSize : null
        servingAlternateUnit = portion.servingSizeUnit !== "g" ? portion.servingSizeUnit : null
      }

      const servingName =
        portion.householdServingFullText ||
        (portion.name ? portion.name : `${servingAlternateAmount || ""} ${servingAlternateUnit || ""}`.trim())

      return {
        servingWeightGram,
        servingAlternateAmount,
        servingAlternateUnit,
        servingName
      }
    }),

    UPC: usdaFoodItem.upc ? Number(usdaFoodItem.upc) : null,
    externalId: usdaFoodItem.fdcId.toString(),
    Nutrient: [],
    kcalPerServing: 0,
    proteinPerServing: 0,
    totalFatPerServing: 0,
    carbPerServing: 0,
    fiberPerServing: null,
    sugarPerServing: null,
    satFatPerServing: null,
    transFatPerServing: null,
    addedSugarPerServing: null,
    adaEmbedding: null,
    bgeBaseEmbedding: null
  }

  for (const [nutrientName, nutrientInfo] of Object.entries(usdaFoodItem.foodInfo)) {
    const foodItemKey = nutrientNameToFoodItemKey[nutrientName]
    if (foodItemKey) {
      // Only set the value if it hasn't been set yet and nutrientInfo.amount is not null
      if (!foodItem[foodItemKey] && nutrientInfo.amount !== null) {
        ;(foodItem[foodItemKey] as any) = nutrientInfo.amount as number
      }
    } else if (nutrientInfo.amount !== null) {
      // Only push if nutrientInfo.amount is not null
      foodItem.Nutrient.push({
        nutrientName,
        nutrientUnit: nutrientInfo.unit || "g", // Use the unit from nutrientInfo if available
        nutrientAmountPerDefaultServing: parseFloat((nutrientInfo.amount as number).toFixed(3))
      })
    }
  }

  return foodItem
}

function runTest() {
  const chiaSeeds: UsdaFoodItem = JSON.parse(
    `{"itemName":"Seeds, chia seeds, dried","branded":false,"brandName":null,"default_serving":{"default_serving_amount":100,"default_serving_unit":"g"},"foodInfo":{"Energy":{"amount":486,"unit":"kcal"},"Protein":{"amount":16.54,"unit":"g"},"Total lipid (fat)":{"amount":30.74,"unit":"g"},"Carbohydrate, by difference":{"amount":42.12,"unit":"g"},"Energy (Atwater General Factors)":{"amount":null,"unit":null},"Sugars, total including NLEA":{"amount":null,"unit":null},"Sugars, Total":{"amount":null,"unit":null},"Fiber, total dietary":{"amount":34.4,"unit":"g"},"Carbohydrate, by summation":{"amount":null,"unit":null},"Total fat (NLEA)":{"amount":null,"unit":null},"Fatty acids, total saturated":{"amount":3.33,"unit":"g"},"Fatty acids, total monounsaturated":{"amount":2.309,"unit":"g"},"Fatty acids, total trans":{"amount":0.14,"unit":"g"},"Sugars, added":{"amount":null,"unit":null},"Cholesterol":{"amount":0,"unit":"mg"},"Potassium, K":{"amount":407,"unit":"mg"},"Sodium, Na":{"amount":16,"unit":"mg"},"Calcium, Ca":{"amount":631,"unit":"mg"}},"portions":[{"name":"1 oz","abbreviation":"undetermined","amount":1,"gramWeight":28.35}]}`
  )
  const peanut: UsdaFoodItem = JSON.parse(
    `{"itemName":"Peanuts, raw","branded":false,"brandName":null,"default_serving":{"default_serving_amount":100,"default_serving_unit":"g"},"foodInfo":{"Energy":{"amount":null,"unit":null},"Protein":{"amount":23.205,"unit":"g"},"Total lipid (fat)":{"amount":43.28,"unit":"g"},"Carbohydrate, by difference":{"amount":26.498,"unit":"g"},"Energy (Atwater General Factors)":{"amount":588.332,"unit":"kcal"},"Sugars, total including NLEA":{"amount":null,"unit":null},"Sugars, Total":{"amount":null,"unit":null},"Fiber, total dietary":{"amount":8.014,"unit":"g"},"Carbohydrate, by summation":{"amount":null,"unit":null},"Total fat (NLEA)":{"amount":null,"unit":null},"Fatty acids, total saturated":{"amount":null,"unit":null},"Fatty acids, total monounsaturated":{"amount":null,"unit":null},"Fatty acids, total trans":{"amount":null,"unit":null},"Sugars, added":{"amount":null,"unit":null},"Cholesterol":{"amount":null,"unit":null},"Potassium, K":{"amount":635.6,"unit":"mg"},"Sodium, Na":{"amount":1.493,"unit":"mg"},"Calcium, Ca":{"amount":49.13,"unit":"mg"}},"portions":[]}`
  )
  const bread: UsdaFoodItem = JSON.parse(
    `{"itemName":"Bread, white, commercially prepared","branded":false,"brandName":null,"default_serving":{"default_serving_amount":100,"default_serving_unit":"g"},"foodInfo":{"Energy":{"amount":270,"unit":"kcal"},"Protein":{"amount":9.43,"unit":"g"},"Total lipid (fat)":{"amount":3.59,"unit":"g"},"Carbohydrate, by difference":{"amount":49.2,"unit":"g"},"Energy (Atwater General Factors)":{"amount":null,"unit":null},"Sugars, total including NLEA":{"amount":null,"unit":null},"Sugars, Total":{"amount":5.34,"unit":"g"},"Fiber, total dietary":{"amount":2.3,"unit":"g"},"Carbohydrate, by summation":{"amount":44.8,"unit":"g"},"Total fat (NLEA)":{"amount":3.45,"unit":"g"},"Fatty acids, total saturated":{"amount":0.821,"unit":"g"},"Fatty acids, total monounsaturated":{"amount":0.717,"unit":"g"},"Fatty acids, total trans":{"amount":0.035,"unit":"g"},"Sugars, added":{"amount":null,"unit":null},"Cholesterol":{"amount":null,"unit":null},"Potassium, K":{"amount":117,"unit":"mg"},"Sodium, Na":{"amount":477,"unit":"mg"},"Calcium, Ca":{"amount":211,"unit":"mg"}},"portions":[{"name":"slice","abbreviation":"slice","amount":1,"gramWeight":27.3}]}`
  )
  const almondButter: UsdaFoodItem = JSON.parse(
    `{"itemName":"Almond butter, creamy","branded":false,"brandName":null,"default_serving":{"default_serving_amount":100,"default_serving_unit":"g"},"foodInfo":{"Energy":{"amount":null,"unit":null},"Protein":{"amount":20.78734,"unit":"g"},"Total lipid (fat)":{"amount":53.04,"unit":"g"},"Carbohydrate, by difference":{"amount":21.23666,"unit":"g"},"Energy (Atwater General Factors)":{"amount":645.456,"unit":"kcal"},"Sugars, total including NLEA":{"amount":null,"unit":null},"Sugars, Total":{"amount":null,"unit":null},"Fiber, total dietary":{"amount":9.718,"unit":"g"},"Carbohydrate, by summation":{"amount":null,"unit":null},"Total fat (NLEA)":{"amount":null,"unit":null},"Fatty acids, total saturated":{"amount":4.253,"unit":"g"},"Fatty acids, total monounsaturated":{"amount":34.69,"unit":"g"},"Fatty acids, total trans":{"amount":null,"unit":null},"Sugars, added":{"amount":null,"unit":null},"Cholesterol":{"amount":null,"unit":null},"Potassium, K":{"amount":745.4,"unit":"mg"},"Sodium, Na":{"amount":0.9963,"unit":"mg"},"Calcium, Ca":{"amount":263.8,"unit":"mg"}},"portions":[]}`
  )
  // console.log(mapUsdaFoodItemToFoodItem(chiaSeeds))
  // console.log(mapUsdaFoodItemToFoodItem(peanut))
  // console.log(mapUsdaFoodItemToFoodItem(bread))
  // console.log(mapUsdaFoodItemToFoodItem(almondButter))
}

//runTest()
