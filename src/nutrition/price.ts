// A food's values at a weight, the one way everything prices food (meals, edits, the tray, recipes, MCP, the backfill):
// its per-serving columns and its Nutrient rows (any naming and unit) over its serving weight. Unknown stays unknown.
import { COLUMN_NUTRIENTS, MICRO_KEYS, NUTRIENT_NAMES, type Amounts, type ColumnKey, type NutrientKey } from "./spec"
import { inKeyUnit, nutrientKey } from "./units"
import { validNutrition, type Nutrition } from "./validate"

export type FoodBasis = {defaultServingWeightGram:number|null;weightUnknown?:boolean|null}
  & {[K in typeof COLUMN_NUTRIENTS[ColumnKey]]?:number|null}
  & {Nutrient?:{nutrientName:string;nutrientUnit?:string|null;nutrientAmountPerDefaultServing:number}[]|null}

const finite=(value:unknown):value is number=>typeof value==="number"&&Number.isFinite(value)

/** What a food contributes at `grams`. Unknown nutrients are absent rather than zero; null when the food has no
 * usable weight or calorie basis. */
export function nutrientsAt(food:FoodBasis,grams:number):Amounts|null {
  const basis=food.defaultServingWeightGram
  if (food.weightUnknown||!finite(basis)||basis<=0||!finite(food.kcalPerServing)||!finite(grams)||grams<=0) return null
  const factor=grams/basis,amounts:Amounts={}
  for (const [key,column] of Object.entries(COLUMN_NUTRIENTS) as [ColumnKey,typeof COLUMN_NUTRIENTS[ColumnKey]][]) {
    const value=food[column]
    if (finite(value)) amounts[key]=value*factor
  }
  // Nutrient rows in any naming and unit ("Magnesium, Mg", Vitamin D in IU); the first row for a nutrient counts.
  for (const row of food.Nutrient??[]) {
    const key=nutrientKey(row.nutrientName)
    if (!key||key in COLUMN_NUTRIENTS||amounts[key]!=null||!finite(row.nutrientAmountPerDefaultServing)) continue
    const value=inKeyUnit(key,row.nutrientAmountPerDefaultServing,row.nutrientUnit)
    if (value!=null) amounts[key]=value*factor
  }
  return amounts
}

/** Nutrient rows for amounts per default serving, named so getMappedNutrientField reads them back. */
export function nutrientRows(amounts:Amounts) {
  return MICRO_KEYS.flatMap(key=>{
    const amount=amounts[key]
    if (!finite(amount)||amount<0) return []
    const unit=key.endsWith("Mcg")?"mcg":key.endsWith("Mg")?"mg":key.endsWith("Ml")?"ml":"g"
    return [{name:NUTRIENT_NAMES[key][0],unit,amount}]
  })
}

/** Food columns (as save_user_food takes them) for amounts per default serving. Protein, carbs and fat are never
 * null on a FoodItem; an unknown one is stored as 0, as elsewhere in the catalogue. */
export function columnValues(amounts:Amounts) {
  return {kcal:amounts.kcal??0,proteinG:amounts.proteinG??0,carbG:amounts.carbG??0,totalFatG:amounts.totalFatG??0,
    fiberG:amounts.fiberG??null,sugarG:amounts.sugarG??null,addedSugarG:amounts.addedSugarG??null,
    satFatG:amounts.satFatG??null,transFatG:amounts.transFatG??null}
}

/** A recipe's values per portion. A nutrient is the sum over the ingredients that know it (as a meal's total would
 * be); a portion weighs the cooked weight, or else the ingredients' total, divided by the portions. */
export function recipeValues(ingredients:{food:FoodBasis;grams:number}[],portions:number,cookedWeightGram?:number|null) {
  if (!ingredients.length||!finite(portions)||portions<=0) throw new Error("invalid_recipe")
  const totals:Amounts={}
  let ingredientGrams=0
  for (const {food,grams} of ingredients) {
    const amounts=nutrientsAt(food,grams)
    if (!amounts) throw new Error("ingredient_nutrition_unavailable")
    ingredientGrams+=grams
    for (const [key,value] of Object.entries(amounts) as [NutrientKey,number][]) totals[key]=(totals[key]??0)+value
  }
  const wholeGrams=finite(cookedWeightGram)&&cookedWeightGram>0?cookedWeightGram:ingredientGrams
  const perPortion=Object.fromEntries(Object.entries(totals).map(([key,value])=>[key,value/portions])) as Amounts
  return {ingredientGrams,wholeGrams,portionGrams:wholeGrams/portions,totals,perPortion}
}

/** Calories and macros at a weight (a view of nutrientsAt), when they pass validNutrition. */
export function foodNutrition(food: FoodBasis, grams: number): Nutrition | null {
  const amounts = nutrientsAt(food, grams)
  if (!amounts) return null
  const nutrients = { kcal: amounts.kcal!, proteinG: amounts.proteinG ?? null, carbG: amounts.carbG ?? null, totalFatG: amounts.totalFatG ?? null }
  return validNutrition(grams, nutrients) ? nutrients : null
}
