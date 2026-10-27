import { number } from "./stats"
import { daysBetween } from "./dates"

// Weight and expenditure for the web, as the app's Progress tab shows them (amino-mobile common/format/body.ts,
// common/progress/expenditure.ts and chartPath.ts). The numbers come from the server's weight_trend, energy_expenditure
// and energy_expenditure_history, so the app, agents and the web agree.

export type UnitPreference = "METRIC" | "IMPERIAL" | null | undefined

const KG_PER_LB = 0.45359237
export const isImperial = (unit: UnitPreference) => unit === "IMPERIAL"
export const weightUnit = (unit: UnitPreference) => isImperial(unit) ? "lb" : "kg"
/** kg in the user's units, as a number for charts. */
export const inUnit = (kg: number, unit: UnitPreference) => isImperial(unit) ? kg / KG_PER_LB : kg
/** A weight in the user's units ("78.6", "173.3"). */
export const shownWeight = (kg: number, unit: UnitPreference) => number(inUnit(kg, unit), 1)
/** A change with its sign ("−1.3", "+0.4"). */
export const signedWeight = (kg: number, unit: UnitPreference) =>
  `${kg < 0 ? "−" : kg > 0 ? "+" : ""}${shownWeight(Math.abs(kg), unit)}`

/** One day of weight_trend: the weigh-in the trend counted (null without one) and the trend. */
export type WeightDay = { day: string; weightKg: number | null; bodyFatPct: number | null; trendKg: number }

/** energy_expenditure: the estimate from the last 28 days, or what's still missing for one. */
export type ExpenditureEstimate = {
  weighings: number
  completeDays: number
  loggedDays?: number
  kcalPerDay?: number
  plusMinus?: number
  meanIntakeKcal?: number
  trendKgPerWeek?: number
  insufficient?: { weighInsNeeded: number; completeDaysNeeded: number }
}

/** One day's estimate from energy_expenditure_history, from the 28 days ending that day. */
export type ExpenditurePoint = { day: string; kcalPerDay: number; plusMinus: number }

export type WeightData = {
  unit: UnitPreference
  goalKg: number | null
  /** Every day from `from` to today; empty without a weigh-in by then. */
  days: WeightDay[]
  from: string
  /** The estimates' range: the 30 days ending yesterday. */
  expenditureFrom: string
  expenditureTo: string
  estimate: ExpenditureEstimate | null
  history: ExpenditurePoint[]
}

export type ShownPoint = { day: string; kcal: number; plusMinus: number }

/** Each estimate as the average of the estimates from its own day and the 6 before (only those that exist): a daily
 * estimate gains or drops a weigh-in as its window moves, so it jitters by more than expenditure really changes. */
export function smoothedSeries(points: readonly ExpenditurePoint[], days = 7): ShownPoint[] {
  return points.map((point, index) => {
    let kcal = 0, plusMinus = 0, count = 0
    for (let i = index; i >= 0 && daysBetween(points[i].day, point.day) < days; i--) {
      kcal += points[i].kcalPerDay; plusMinus += points[i].plusMinus; count++
    }
    return { day: point.day, kcal: kcal / count, plusMinus: plusMinus / count }
  })
}

/** Runs of points with no day missing between them, so a stretch without an estimate shows as a gap. */
export function runs<T extends { day: string }>(points: readonly T[], step = 1): T[][] {
  const out: T[][] = []
  for (const point of points) {
    const run = out[out.length - 1]
    const previous = run?.[run.length - 1]
    if (previous && daysBetween(previous.day, point.day) <= step) run.push(point)
    else out.push([point])
  }
  return out
}

type Point = { x: number; y: number }

/** An SVG path through the points as a monotone cubic (Fritsch–Carlson): smooth, but it never overshoots, so a trend
 * line can't show a dip or bump the data doesn't have. Points must be in increasing x. */
export function smoothPath(points: readonly Point[]): string {
  if (!points.length) return ""
  if (points.length === 1) return `M${points[0].x} ${points[0].y}`
  const n = points.length
  const slopes = points.slice(1).map((point, i) => (point.y - points[i].y) / (point.x - points[i].x))
  const tangents = points.map((_, i) => i === 0 ? slopes[0] : i === n - 1 ? slopes[n - 2]
    : slopes[i - 1] * slopes[i] <= 0 ? 0 : (slopes[i - 1] + slopes[i]) / 2)
  for (let i = 0; i < n - 1; i++) {
    if (slopes[i] === 0) { tangents[i] = 0; tangents[i + 1] = 0; continue }
    const a = tangents[i] / slopes[i], b = tangents[i + 1] / slopes[i], s = a * a + b * b
    if (s > 9) { const tau = 3 / Math.sqrt(s); tangents[i] = tau * a * slopes[i]; tangents[i + 1] = tau * b * slopes[i] }
  }
  const f = (value: number) => value.toFixed(1)
  let path = `M${f(points[0].x)} ${f(points[0].y)}`
  for (let i = 0; i < n - 1; i++) {
    const p = points[i], q = points[i + 1], third = (q.x - p.x) / 3
    path += ` C${f(p.x + third)} ${f(p.y + tangents[i] * third)} ${f(q.x - third)} ${f(q.y - tangents[i + 1] * third)} ${f(q.x)} ${f(q.y)}`
  }
  return path
}

/** Round values for an axis between low and high, about `count` of them (steps of 1, 2 or 5 × 10ⁿ): 76, 78, 80. */
export function niceTicks(low: number, high: number, count = 3): number[] {
  if (!(high > low)) return [low]
  const raw = (high - low) / count, power = 10 ** Math.floor(Math.log10(raw))
  const step = [1, 2, 5, 10].map(m => m * power)
    .reduce((best, candidate) => Math.abs((high - low) / candidate - count) < Math.abs((high - low) / best - count) ? candidate : best)
  const decimals = Math.max(0, -Math.floor(Math.log10(step)))
  const ticks: number[] = []
  for (let k = Math.ceil(low / step - 1e-9); k * step <= high + 1e-9; k++) ticks.push(Number((k * step).toFixed(decimals)))
  return ticks
}
