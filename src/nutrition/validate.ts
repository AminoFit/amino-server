// Plausibility checks for priced nutrition. Unknown macros stay null; a missing calorie basis can't become a zero.
export type Nutrition = { kcal: number; proteinG: number | null; carbG: number | null; totalFatG: number | null }

/** Calories within 9.5 kcal/g and macros that fit in the weight. */
export function validNutrition(grams: number, nutrients: Nutrition): boolean {
  if (!Number.isFinite(grams) || grams <= 0 || grams > 5000 || !Number.isFinite(nutrients.kcal) ||
      nutrients.kcal < 0 || nutrients.kcal > 45000 || nutrients.kcal / grams > 9.5) return false
  const macros = [nutrients.proteinG, nutrients.carbG, nutrients.totalFatG]
  return macros.every(n => n === null || (typeof n === "number" && Number.isFinite(n) && n >= 0 && n <= grams * 1.05)) &&
    macros.reduce<number>((sum, n) => sum + (n ?? 0), 0) <= grams * 1.1
}
