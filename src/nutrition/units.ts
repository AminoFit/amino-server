// Nutrient names and units from every source ("Magnesium, Mg", "Vitamin A" in IU, Open Food Facts' grams, a Supplement
// Facts line) as Amino's keys and units (spec.ts), and back as the catalogue's rows.
import { COLUMN_NUTRIENTS, HISTORY_NUTRIENTS, MICRO_KEYS, NUTRIENT_NAMES, keyUnit, type Micros, type NutrientKey } from "./spec"

const normalized = (name: string) => name.toLowerCase().replace(/\s+/g, "").replace(/[^a-z0-9]/g, "")
const BY_NAME = new Map<string, NutrientKey>()
for (const [key, names] of Object.entries(NUTRIENT_NAMES) as [NutrientKey, string[]][])
  for (const name of [key, ...names]) if (!BY_NAME.has(normalized(name))) BY_NAME.set(normalized(name), key)
/** A key from one of its listed names (spec.ts NUTRIENT_NAMES), compared without case, spaces or punctuation. */
export function getMappedNutrientField(name: string): NutrientKey | null {
  return BY_NAME.get(normalized(name)) ?? null
}

/** Kilojoules as kilocalories. */
export const kjToKcal = (kj: number) => kj / 4.184

const finite = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value)
const GRAMS: Record<string, number> = { g: 1, mg: 1e-3, mcg: 1e-6, "µg": 1e-6, ug: 1e-6 }
/** International units per key unit: vitamin A as retinol (0.3 µg), D (0.025 µg), E as natural tocopherol (0.67 mg). */
const IU: Partial<Record<NutrientKey, number>> = { vitaminAMcg: 0.3, vitaminDMcg: 0.025, vitaminEMg: 0.67 }

/** A nutrient's key from any of its names ("Magnesium, Mg", "magnesium", "magnesiumMg"); null when unknown. */
export function nutrientKey(name: string): NutrientKey | null {
  const trimmed = name.trim()
  if ((HISTORY_NUTRIENTS as readonly string[]).includes(trimmed)) return trimmed as NutrientKey
  const mapped = getMappedNutrientField(trimmed.replace(/\s*\((?:as|from)\b[^)]*\)/i, ""))
  if (mapped && (HISTORY_NUTRIENTS as readonly string[]).includes(mapped)) return mapped as NutrientKey
  // Label wording: "Vitamin B12 (as cyanocobalamin)", "Folate (DFE)", "Total Folate", "Niacinamide".
  const plain = trimmed.toLowerCase().replace(/\(.*?\)/g, " ").replace(/[^a-z0-9]+/g, " ").trim()
  const alias: Record<string, NutrientKey> = { "total folate": "vitaminB9Mcg", "folic acid": "vitaminB9Mcg",
    niacinamide: "vitaminB3Mg", "pantothenic acid": "vitaminB5Mg", "omega 3": "omega3Mg", "omega 6": "omega6Mg",
    "vitamin b 6": "vitaminB6Mg", "vitamin b 12": "vitaminB12Mcg" }
  if (alias[plain]) return alias[plain]
  // "Total Omega-3 Fatty Acids", "Omega-3 fatty acids (total)".
  const omega = /^(total )?omega ?(3|6)( fatty acids)?( total)?$/.exec(plain)
  if (omega) return omega[2] === "3" ? "omega3Mg" : "omega6Mg"
  const again = getMappedNutrientField(plain)
  return again && (HISTORY_NUTRIENTS as readonly string[]).includes(again) ? again as NutrientKey : null
}

/** An amount in its key's unit; null for a unit that can't be converted (or IU for a nutrient without a factor). */
export function inKeyUnit(key: NutrientKey, amount: number, unit?: string | null): number | null {
  if (!finite(amount) || amount < 0) return null
  const from = (unit ?? "").trim().toLowerCase().replace("μ", "µ"), to = keyUnit(key)
  if (!from || from === to || (from === "µg" && to === "mcg")) return amount
  if (from === "iu") return IU[key] != null ? amount * IU[key]! : null
  if (from in GRAMS && to in GRAMS) return amount * GRAMS[from] / GRAMS[to]
  return null
}

/** Omega-3 fatty acids a fish oil or flax label lists one by one ("EPA (eicosapentaenoic acid) 700 mg"): their sum is
 * the omega-3, unless the label gives a total. */
const OMEGA3_PARTS = /^(epa|dha|dpa|ala|eicosapentaenoic acid|docosahexaenoic acid|docosapentaenoic acid|alpha-?linolenic acid)\b/i
const omega3Part = (name: string) => OMEGA3_PARTS.test(name.trim().replace(/^\(|\)$/g, ""))

/** Micronutrients from named amounts (a label's lines, a database's rows): unknown names and units dropped, the first
 * value for a key kept. */
export function microsFrom(rows: { name: string; amount: number | null | undefined; unit?: string | null }[]): Micros {
  const micros: Micros = {}
  let omega3 = 0
  for (const row of rows) if (omega3Part(row.name) && finite(row.amount)) omega3 += inKeyUnit("omega3Mg", row.amount, row.unit) ?? 0
  for (const row of rows) {
    const key = nutrientKey(row.name)
    if (!key || key in COLUMN_NUTRIENTS || micros[key] != null || !finite(row.amount)) continue
    const value = inKeyUnit(key, row.amount, row.unit)
    if (value != null) micros[key] = value
  }
  if (omega3 > 0 && micros.omega3Mg == null) micros.omega3Mg = omega3
  return micros
}

/** Scales micronutrients (per one basis) by a factor. */
export function scaleMicros(micros: Micros, factor: number): Micros {
  return Object.fromEntries(Object.entries(micros).flatMap(([key, value]) =>
    finite(value) && finite(factor) ? [[key, value * factor]] : [])) as Micros
}

/** Nutrient rows for micronutrients per default serving, named the catalogue's way so every reader maps them back. */
export function microRows(micros: Micros) {
  return MICRO_KEYS.flatMap(key => {
    const amount = micros[key]
    return finite(amount) && amount >= 0
      ? [{ nutrientName: NUTRIENT_NAMES[key][0], nutrientUnit: keyUnit(key), nutrientAmountPerDefaultServing: Math.round(amount * 1e4) / 1e4 }]
      : []
  })
}

/** Open Food Facts' micronutrients, which it keeps in grams per 100 g, as keys per 100 g. */
const OFF_KEYS: Record<string, NutrientKey> = { sodium: "sodiumMg", potassium: "potassiumMg", calcium: "calciumMg", iron: "ironMg",
  magnesium: "magnesiumMg", zinc: "zincMg", phosphorus: "phosphorusMg", copper: "copperMg", manganese: "manganeseMg",
  selenium: "seleniumMcg", iodine: "iodineMcg", "vitamin-a": "vitaminAMcg", "vitamin-c": "vitaminCMg", "vitamin-d": "vitaminDMcg",
  "vitamin-e": "vitaminEMg", "vitamin-k": "vitaminKMcg", "vitamin-b1": "vitaminB1Mg", "vitamin-b2": "vitaminB2Mg",
  "vitamin-pp": "vitaminB3Mg", "pantothenic-acid": "vitaminB5Mg", "vitamin-b6": "vitaminB6Mg", biotin: "vitaminB7Mcg",
  "vitamin-b9": "vitaminB9Mcg", folates: "vitaminB9Mcg", "vitamin-b12": "vitaminB12Mcg", cholesterol: "cholesterolMg",
  caffeine: "caffeineMg", "omega-3-fat": "omega3Mg", "omega-6-fat": "omega6Mg" }
export function offMicrosPer100g(nutriments: Record<string, number | string | undefined>): Micros {
  const micros: Micros = {}
  for (const [name, key] of Object.entries(OFF_KEYS)) {
    const raw = nutriments[`${name}_100g`], value = Number(raw)
    if (micros[key] != null || raw == null || raw === "" || !Number.isFinite(value) || value < 0) continue
    const converted = inKeyUnit(key, value, "g")
    if (converted != null) micros[key] = converted
  }
  return micros
}
