// Snapshot only nutritional values, never ownership, timestamps or lifecycle fields.
export const HISTORY_NUTRIENTS = ["kcal", "totalFatG", "satFatG", "transFatG", "unsatFatG", "polyunsatFatG",
  "monounsatFatG", "carbG", "fiberG", "sugarG", "addedSugarG", "proteinG", "waterMl", "vitaminAMcg",
  "vitaminCMg", "vitaminDMcg", "vitaminEMg", "vitaminKMcg", "vitaminB1Mg", "vitaminB2Mg", "vitaminB3Mg",
  "vitaminB5Mg", "vitaminB6Mg", "vitaminB7Mcg", "vitaminB9Mcg", "vitaminB12Mcg", "calciumMg", "ironMg",
  "magnesiumMg", "phosphorusMg", "potassiumMg", "sodiumMg", "zincMg", "copperMg", "manganeseMg", "seleniumMcg",
  "iodineMcg", "cholesterolMg", "omega3Mg", "omega6Mg", "caffeineMg", "alcoholG"] as const
export type HistoryNutrition = Partial<Record<typeof HISTORY_NUTRIENTS[number], number | null>>
