import type { DayTotals, FoodRow, GoalChange, Goals, Meal } from "./types"
import { shiftDay, weekStart } from "./dates"

export type MacroKey = keyof Goals

export const MACROS: { key: MacroKey; label: string; short: string; unit: string }[] = [
  { key: "kcal", label: "Calories", short: "cal", unit: "kcal" },
  { key: "carbG", label: "Carbs", short: "carb", unit: "g" },
  { key: "proteinG", label: "Protein", short: "pro", unit: "g" },
  { key: "totalFatG", label: "Fat", short: "fat", unit: "g" }
]

export type Totals = Record<MacroKey | "fiberG", number>
const ZERO: Totals = { kcal: 0, proteinG: 0, carbG: 0, totalFatG: 0, fiberG: 0 }

export const sumItems = (items: FoodRow[]): Totals => items.reduce((sum, item) => ({
  kcal: sum.kcal + item.kcal, proteinG: sum.proteinG + item.proteinG, carbG: sum.carbG + item.carbG,
  totalFatG: sum.totalFatG + item.totalFatG, fiberG: sum.fiberG + item.fiberG }), ZERO)

export const dayTotals = (meals: Meal[]) => sumItems(meals.flatMap(meal => meal.items))

/** The goals that applied on `day` (YYYY-MM-DD): the latest change on or before it; before history starts, the
 * earliest known; with no history, today's. */
export function goalsOn(history: readonly GoalChange[], day: string, current: Goals): Goals {
  let applied = history[0]
  for (const change of history) {
    if (change.from > day) break
    applied = change
  }
  return applied?.goals ?? current
}

/** Each day's goals, for the charts. */
export type GoalsOn = (day: string) => Goals

/** On target: calories, carbs and fat within 10% of the goal; protein at least 90% of it. */
export function onTarget(key: MacroKey, value: number, goal: number) {
  if (!goal) return false
  const ratio = value / goal
  return key === "proteinG" ? ratio >= 0.9 : ratio >= 0.9 && ratio <= 1.1
}

/** Averages over the days with food logged among the last `days` (ending today), and the average of those days' own
 * goals to compare them with (today's goals when nothing was logged). */
export function averages(recent: DayTotals[], today: string, days: number, goalsOnDay: GoalsOn) {
  const from = shiftDay(today, -(days - 1))
  const logged = recent.filter(day => day.date >= from && day.date <= today && day.meals > 0)
  const dayGoals = logged.map(day => goalsOnDay(day.date))
  const mean = (key: MacroKey) => logged.length ? logged.reduce((sum, day) => sum + day[key], 0) / logged.length : 0
  const meanGoal = (key: MacroKey) => logged.length ? dayGoals.reduce((sum, goals) => sum + goals[key], 0) / logged.length
    : goalsOnDay(today)[key]
  return { loggedDays: logged.length, kcal: mean("kcal"), proteinG: mean("proteinG"), carbG: mean("carbG"),
    totalFatG: mean("totalFatG"), goals: { kcal: meanGoal("kcal"), proteinG: meanGoal("proteinG"), carbG: meanGoal("carbG"),
      totalFatG: meanGoal("totalFatG") } as Goals }
}

/** How many of the logged days in the last `days` each macro was on target, each against that day's goals. */
export function targetDays(recent: DayTotals[], today: string, goalsOnDay: GoalsOn, days: number) {
  const from = shiftDay(today, -(days - 1))
  const logged = recent.filter(day => day.date >= from && day.date <= today && day.meals > 0)
  return { logged: logged.length, hits: Object.fromEntries(MACROS.map(({ key }) =>
    [key, logged.filter(day => onTarget(key, day[key], goalsOnDay(day.date)[key])).length])) as Record<MacroKey, number> }
}

export type HeatCell = { date: string; kcal: number | null; level: "none" | "low" | "mid" | "goal" | "over"; future: boolean }

/** 12 weeks of calories against each day's goal, a column per week (Sunday first), ending with this week. */
export function heatmap(recent: DayTotals[], today: string, goalsOnDay: GoalsOn, weeks = 12): HeatCell[][] {
  const byDate = new Map(recent.map(day => [day.date, day]))
  const first = shiftDay(weekStart(today), -7 * (weeks - 1))
  return Array.from({ length: weeks }, (_, week) => Array.from({ length: 7 }, (_, weekday) => {
    const date = shiftDay(first, week * 7 + weekday)
    const kcal = byDate.get(date)?.kcal ?? null
    const goal = goalsOnDay(date).kcal
    const ratio = kcal == null || !goal ? 0 : kcal / goal
    const level = kcal == null || kcal === 0 ? "none" : ratio > 1.1 ? "over" : ratio >= 0.9 ? "goal" : ratio >= 0.5 ? "mid" : "low"
    return { date, kcal, level, future: date > today }
  }))
}

export const number = (value: number, digits = 0) =>
  value.toLocaleString("en-US", { maximumFractionDigits: digits, minimumFractionDigits: 0 })

/** "Greek yogurt, plain" → "Greek Yogurt, Plain", as the app shows food names. */
export const titleCase = (text: string) => text.replace(/(^|[\s(/-])(\p{Ll})/gu, (_, before, letter) => before + letter.toUpperCase())

// Serving text as the app shows it (amino-mobile common/foodPortions.ts formatPortion and FoodItemRow's
// formatServingAmount): "150g", "2 Bottle (660g)", "2 × 240 mL (480g)".
const MEASURES: Record<string, string> = {
  ml: "mL", l: "L", g: "g", kg: "kg", mg: "mg", oz: "oz", oza: "fl oz", floz: "fl oz", lb: "lb", lbs: "lb",
  onz: "oz", grm: "g", mlt: "mL", ltr: "L", kgm: "kg", mgm: "mg", lbr: "lb", tbsp: "tbsp", tsp: "tsp", cup: "cup", cups: "cups"
}
const LEADING_QUANTITY = /^(\d*[.,]?\d+(?:\/\d+)?|[½¼¾⅓⅔⅛])\s*(.*)$/

const servingName = (name: string) => name.trim().split(/\s+/).map(word => {
  const measure = MEASURES[word.toLowerCase().replace(/\.$/, "")]
  if (measure) return measure
  if (word === word.toUpperCase()) return word
  return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
}).join(" ").replace(/\bfl\.? oz\b/gi, "fl oz")

function portion(amount: number, rawUnit: string) {
  const shown = Number(amount.toFixed(2)).toString()
  const unit = rawUnit.trim().replace(/^\.(\d)/, "0.$1")
  const match = unit.match(LEADING_QUANTITY)
  if (!match || !match[2]) return `${shown} ${servingName(unit)}`
  if (match[1] === "1") return `${shown} ${servingName(match[2])}`
  return amount === 1 ? servingName(unit) : `${shown} × ${servingName(unit)}`
}

export function serving(item: FoodRow) {
  const unit = item.unit?.toLowerCase() ?? ""
  const grams = item.grams ?? 0
  if (!unit || unit === "g" || unit === "gram" || unit === "grams") return `${grams.toFixed(0)}g`
  return `${portion(item.amount ?? 0, item.unit!)} (${grams.toFixed(0)}g)`
}

/** "13:05" → "1:05 PM". */
export const clock = (time: string) => {
  const [hours, minutes] = time.split(":").map(Number)
  return `${((hours + 11) % 12) + 1}:${String(minutes).padStart(2, "0")} ${hours < 12 ? "AM" : "PM"}`
}

/** "Ada Lovelace" → "AL"; the email's first letter when there's no name. */
export function initials(name?: string, email?: string) {
  const words = (name ?? "").trim().split(/\s+/).filter(Boolean)
  if (words.length) return words.slice(0, 2).map(word => word[0]).join("").toUpperCase()
  return (email?.[0] ?? "?").toUpperCase()
}
