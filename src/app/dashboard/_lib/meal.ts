import type { FoodRow, Meal } from "./types"
import { titleCase } from "./stats"

// What a meal's card says about it, as in the app (amino-mobile common/foodLog/mealCard.ts): a meal of several foods is
// titled by what's in it, and its line says who logged it or what the user said.

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

/** The line under a meal's title: who logged it (an agent or someone linked), else the user's own words, else nothing
 * (an Add Food entry, whose text only lists its foods, or a photo without words). */
export function mealSubline(meal: Meal): { kind: "loggedBy" | "said"; text: string } | null {
  if (meal.loggedBy) return { kind: "loggedBy", text: `Logged by ${meal.loggedBy}${meal.agent ? ` via ${meal.agent}` : ""}` }
  if (meal.agent) return { kind: "loggedBy", text: `Logged by ${meal.agent}` }
  if (meal.listsFoods) return null
  const said = words(meal.text)
  return said ? { kind: "said", text: said } : null
}

/** An agent's text is its note about the meal (how it estimated it), shown inside the open meal. */
export const agentNote = (meal: Meal) => meal.agent ? words(meal.text) || null : null
