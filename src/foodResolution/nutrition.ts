// Shared checks for catalogue-derived food and per-log nutrition. Unknown macros
// stay null; a missing calorie basis cannot become a zero-calorie match.
export type Nutrition = { kcal: number; proteinG: number | null; carbG: number | null; totalFatG: number | null }
type Basis = { defaultServingWeightGram?: number | null; weightUnknown?: boolean | null;
  kcalPerServing?: number | null; proteinPerServing?: number | null; carbPerServing?: number | null; totalFatPerServing?: number | null }
export function validNutrition(grams: number, nutrients: Nutrition): boolean {
  if (!Number.isFinite(grams) || grams <= 0 || grams > 5000 || !Number.isFinite(nutrients.kcal) ||
      nutrients.kcal < 0 || nutrients.kcal > 45000 || nutrients.kcal / grams > 9.5) return false
  const macros = [nutrients.proteinG,nutrients.carbG,nutrients.totalFatG]
  return macros.every(n=>n === null || (typeof n === "number" && Number.isFinite(n) && n >= 0 && n <= grams * 1.05)) &&
    macros.reduce<number>((sum,n)=>sum+(n ?? 0),0) <= grams * 1.1
}
export function foodNutrition(food: Basis, grams: number): Nutrition | null {
  const basis = food.defaultServingWeightGram
  if (food.weightUnknown || typeof basis !== "number" || !Number.isFinite(basis) || basis <= 0 ||
      typeof food.kcalPerServing !== "number") return null
  const factor = grams / basis
  const scale = (n: number | null | undefined) => n == null ? null : n * factor
  const nutrients = {kcal:food.kcalPerServing * factor,proteinG:scale(food.proteinPerServing),
    carbG:scale(food.carbPerServing),totalFatG:scale(food.totalFatPerServing)}
  return validNutrition(grams,nutrients) ? nutrients : null
}
