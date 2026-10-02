// Every nutrient Amino records, defined once (docs/micronutrients-plan.md in amino-mobile). A logged food stores absolute
// amounts under these keys (LoggedFoodItem columns), each in the unit its name ends with. A catalogue food keeps the
// first nine in its own per-serving columns and every other one as a Nutrient row.

/** LoggedFoodItem's nutrient columns: values only, never ownership, timestamps or lifecycle fields. */
export const HISTORY_NUTRIENTS = ["kcal", "totalFatG", "satFatG", "transFatG", "unsatFatG", "polyunsatFatG",
  "monounsatFatG", "carbG", "fiberG", "sugarG", "addedSugarG", "proteinG", "waterMl", "vitaminAMcg",
  "vitaminCMg", "vitaminDMcg", "vitaminEMg", "vitaminKMcg", "vitaminB1Mg", "vitaminB2Mg", "vitaminB3Mg",
  "vitaminB5Mg", "vitaminB6Mg", "vitaminB7Mcg", "vitaminB9Mcg", "vitaminB12Mcg", "calciumMg", "ironMg",
  "magnesiumMg", "phosphorusMg", "potassiumMg", "sodiumMg", "zincMg", "copperMg", "manganeseMg", "seleniumMcg",
  "iodineMcg", "cholesterolMg", "omega3Mg", "omega6Mg", "caffeineMg", "alcoholG"] as const
export type NutrientKey = typeof HISTORY_NUTRIENTS[number]
export type HistoryNutrition = Partial<Record<NutrientKey, number | null>>
/** Known values by key (unknown ones absent). */
export type Amounts = Partial<Record<NutrientKey, number>>
/** Vitamins, minerals and the other row nutrients by key. */
export type Micros = Amounts

/** Nutrients a FoodItem keeps in its own columns (per default serving), with the column. */
export const COLUMN_NUTRIENTS = { kcal: "kcalPerServing", proteinG: "proteinPerServing", carbG: "carbPerServing",
  totalFatG: "totalFatPerServing", fiberG: "fiberPerServing", sugarG: "sugarPerServing", addedSugarG: "addedSugarPerServing",
  satFatG: "satFatPerServing", transFatG: "transFatPerServing" } as const
export type ColumnKey = keyof typeof COLUMN_NUTRIENTS
/** Every other nutrient: a FoodItem's Nutrient rows (vitamins, minerals, other fats, water, caffeine, alcohol). */
export const MICRO_KEYS = HISTORY_NUTRIENTS.filter(key => !(key in COLUMN_NUTRIENTS)) as Exclude<NutrientKey, ColumnKey>[]
/** What an empty logged-food value can be filled with from its food: every key but energy and the three macros, which
 * a logged food always has (SQL: nutrition_fill_keys, used by fill_logged_micronutrients). */
export const FILL_KEYS = HISTORY_NUTRIENTS.filter(key => !["kcal", "proteinG", "carbG", "totalFatG"].includes(key))

/** The unit a key is kept in. */
export function keyUnit(key: NutrientKey) {
  return key.endsWith("Mcg") ? "mcg" : key.endsWith("Mg") ? "mg" : key.endsWith("Ml") ? "ml" : key === "kcal" ? "kcal" : "g"
}

/** Each key's names across sources (USDA, Nutritionix, FatSecret, labels); the first is the one Amino writes. */
export const NUTRIENT_NAMES: Record<NutrientKey, string[]> = {
  kcal: ["kcal", "energy", "Energy", "Calories"],
  totalFatG: ["totalFat", "totalFatPerServing", "Total lipid (fat)", "Fat", "Total Fat"],
  satFatG: ["satFat", "satFatPerServing", "Fatty acids, total saturated", "Saturated Fat"],
  transFatG: ["transFat", "transFatPerServing", "Fatty acids, total trans", "Trans Fat"],
  unsatFatG: ["unsaturatedFat", "Unsaturated Fat"],
  polyunsatFatG: ["polyunsaturatedFat", "Fatty acids, total polyunsaturated", "Polyunsaturated Fat"],
  monounsatFatG: ["monounsaturatedFat", "Fatty acids, total monounsaturated", "Monounsaturated Fat"],
  carbG: ["carb", "carbPerServing", "Carbohydrate, by difference", "Total Carbohydrate"],
  fiberG: ["fiber", "fiberPerServing", "Fiber, total dietary", "Dietary Fiber"],
  sugarG: ["sugar", "sugarPerServing", "Sugars, total including NLEA", "Total Sugars", "Sugars, Total", "Sugars", "Sugar"],
  addedSugarG: ["addedSugar", "addedSugarPerServing", "Sugars, added", "Added Sugars"],
  proteinG: ["protein", "proteinPerServing", "Protein"],
  waterMl: ["water", "Water"],
  vitaminAMcg: ["vitaminA", "Vitamin A", "Vitamin A, RAE"],
  vitaminCMg: ["vitaminC", "Vitamin C", "Vitamin C, total ascorbic acid"],
  vitaminDMcg: ["vitaminD", "Vitamin D", "Vitamin D (D2 + D3), International Units", "Vitamin D (D2 + D3)"],
  vitaminEMg: ["vitaminE", "Vitamin E", "Vitamin E, IU", "Vitamin E (alpha-tocopherol)"],
  vitaminKMcg: ["vitaminK", "Vitamin K (phylloquinone)", "Vitamin K"],
  vitaminB1Mg: ["thiamin", "Thiamin", "Vitamin B1", "Vitamin B1 (Thiamin)"],
  vitaminB2Mg: ["riboflavin", "Riboflavin", "Vitamin B2", "Vitamin B2 (Riboflavin)"],
  vitaminB3Mg: ["niacin", "Niacin", "Vitamin B3", "Vitamin B3 (Niacin)"],
  vitaminB5Mg: ["pantothenicAcid", "Pantothenic acid", "Vitamin B5", "Vitamin B5 (Pantothenic Acid)"],
  vitaminB6Mg: ["vitaminB6", "Vitamin B-6", "Vitamin B6"],
  vitaminB7Mcg: ["biotin", "Biotin", "Vitamin B7", "Vitamin B7 (Biotin)"],
  vitaminB9Mcg: ["folate", "Folate, DFE", "Folic acid", "Vitamin B9", "Vitamin B9 (Folate)"],
  vitaminB12Mcg: ["vitaminB12", "Vitamin B-12", "Vitamin B12"],
  calciumMg: ["calcium", "Calcium, Ca", "calciumMg", "Calcium"],
  ironMg: ["iron", "ironMg", "Iron, Fe"],
  magnesiumMg: ["magnesium", "Magnesium, Mg"],
  phosphorusMg: ["phosphorus", "Phosphorus, P"],
  potassiumMg: ["potassium", "Potassium", "potassiumMg", "Potassium, K"],
  sodiumMg: ["sodium", "Sodium", "sodiumMg", "Sodium, Na"],
  zincMg: ["zinc", "Zinc, Zn"],
  copperMg: ["copper", "Copper, Cu"],
  manganeseMg: ["manganese", "Manganese, Mn"],
  seleniumMcg: ["selenium", "Selenium, Se"],
  iodineMcg: ["iodine", "Iodine, I"],
  cholesterolMg: ["cholesterol", "Cholesterol", "cholesterolMg"],
  omega3Mg: ["omega3", "Omega-3 fatty acids", "Omega-3 Fatty Acids"],
  omega6Mg: ["omega6", "Omega-6 fatty acids", "Omega-6 Fatty Acids"],
  caffeineMg: ["caffeine", "Caffeine"],
  alcoholG: ["alcohol", "Alcohol, ethyl"]
}
