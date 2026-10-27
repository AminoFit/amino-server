import type { FoodRow, Meal } from "./types"
import { titleCase } from "./stats"

// What a meal's card says about it, as in the app (amino-mobile common/foodLog/mealCard.ts): a meal of several foods is
// titled by what's in it, and its line says what the user said.

/** The plate's icons: the meal's biggest foods by calories, in the title's order (ties keep the logged order). */
export const biggestFoods = (items: readonly FoodRow[], count: number) =>
  [...items].sort((a, b) => b.kcal - a.kcal).slice(0, count)

/** The two biggest foods by calories and how many more ("Granola, Greek Yogurt +2"): nothing is guessed (breakfast,
 * lunch), so the title is never wrong. */
export function mealTitle(items: readonly FoodRow[]): string {
  const named = items.filter(item => item.name?.trim())
  const biggest = biggestFoods(named, 2).map(item => titleCase(item.name!.trim()))
  const more = named.length - biggest.length
  return biggest.join(", ") + (more > 0 ? ` +${more}` : "")
}

// Scanned products travel as [barcode:…] chips in the text; only the words are shown.
const CHIP = /\[barcode:\s*(\d{6,14})\]/gi
const words = (text: string | undefined) => (text ?? "").replace(CHIP, " ").replace(/\s+/g, " ").trim()

/** An Add Food entry's text only lists its foods ("Banana (1 large), Peeled Apples (57 g)"): every comma-separated part
 * is one of the meal's own foods, by name, with or without its amount. */
function listsOwnFoods(text: string, items: readonly FoodRow[]) {
  const names = new Set(items.map(item => item.name?.trim().toLowerCase()).filter(Boolean))
  if (!names.size) return false
  const parts: string[] = []
  let depth = 0, part = ""
  for (const char of text) {
    if (char === "(") depth++
    else if (char === ")") depth = Math.max(depth - 1, 0)
    if (char === "," && depth === 0) { parts.push(part); part = "" } else part += char
  }
  parts.push(part)
  return parts.every(piece => names.has(piece.trim().replace(/\s*\(.*\)$/, "").trim().toLowerCase()))
}

/** The words under a meal's title: what the user typed or said, never an Add Food entry's list of its foods. (Who
 * logged a meal isn't on the web yet: web_day doesn't say.) */
export function mealWords(meal: Meal): string | null {
  const said = words(meal.text)
  return said && !listsOwnFoods(said, meal.items) ? said : null
}
