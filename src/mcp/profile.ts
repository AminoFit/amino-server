import moment from "moment-timezone"
import type { UserDatabase } from "./auth"

// Goals and body stats, read and written the way the app stores them (User row, metric units).

export const ACTIVITY_LEVELS = ["None", "Light Exercise", "Moderate Exercise", "Very Active", "Extremely Active"] as const
export const SEXES = ["male", "female", "other"] as const

const PROFILE_COLUMNS = "tzIdentifier,unitPreference,calorieGoal,proteinGoal,carbsGoal,fatGoal,manualMacroGoals," +
  "weightKg,heightCm,dateOfBirth,gender,activityLevel"

type ProfileRow = { tzIdentifier: string | null; unitPreference: string | null; calorieGoal: number | null
  proteinGoal: number | null; carbsGoal: number | null; fatGoal: number | null; manualMacroGoals: boolean
  weightKg: number | string | null; heightCm: number | string | null; dateOfBirth: string | null
  gender: string | null; activityLevel: string | null }

export type Profile = ReturnType<typeof shapeProfile>

const zoneOf = (row: ProfileRow) => row.tzIdentifier && moment.tz.zone(row.tzIdentifier) ? row.tzIdentifier : "UTC"
const number = (value: number | string | null) => value == null ? null : Number(value)

/** The app saves a birth date as local midnight in UTC, so the calendar date is read back in the user's timezone. */
export function birthDateOf(stored: string | null, timezone: string) {
  if (!stored) return null
  return moment.tz(stored.endsWith("Z") || /[+-]\d\d:?\d\d$/.test(stored) ? stored : `${stored}Z`, timezone).format("YYYY-MM-DD")
}

export function storedBirthDate(date: string, timezone: string) {
  return moment.tz(date, "YYYY-MM-DD", timezone).toISOString()
}

export function shapeProfile(row: ProfileRow, now = new Date()) {
  const timezone = zoneOf(row)
  const dateOfBirth = birthDateOf(row.dateOfBirth, timezone)
  return {
    timezone,
    units: row.unitPreference === "IMPERIAL" ? "imperial" : "metric",
    goals: { calories: row.calorieGoal, proteinG: row.proteinGoal, carbsG: row.carbsGoal, fatG: row.fatGoal,
      macrosSetByHand: row.manualMacroGoals },
    body: { weightKg: number(row.weightKg), heightCm: number(row.heightCm), dateOfBirth,
      age: dateOfBirth ? moment.tz(now, timezone).diff(moment.tz(dateOfBirth, "YYYY-MM-DD", timezone), "years") : null,
      sex: row.gender, activityLevel: row.activityLevel }
  }
}

async function profileRow(db: UserDatabase, userId: string) {
  const { data, error } = await db.from("User").select(PROFILE_COLUMNS).eq("id", userId).single()
  if (error) throw error
  return data as unknown as ProfileRow
}

export async function getProfile(db: UserDatabase, userId: string) {
  return shapeProfile(await profileRow(db, userId))
}

/** The goals from a day (`from`, the user's local date) until the next change: UserGoalHistory, written whenever the
 * goals change. The first entry is where history starts, not a change. */
export type GoalHistoryEntry = { from: string; calories: number | null; proteinG: number | null; carbsG: number | null
  fatG: number | null }

export async function goalHistory(db: UserDatabase, userId: string): Promise<GoalHistoryEntry[]> {
  const { data, error } = await (db as any).from("UserGoalHistory")
    .select("effectiveOn,calorieGoal,proteinGoal,carbsGoal,fatGoal").eq("userId", userId).order("effectiveOn")
  if (error) throw error
  return (data ?? []).map((row: { effectiveOn: string; calorieGoal: number | null; proteinGoal: number | null
    carbsGoal: number | null; fatGoal: number | null }) => ({ from: row.effectiveOn, calories: row.calorieGoal,
    proteinG: row.proteinGoal, carbsG: row.carbsGoal, fatG: row.fatGoal }))
}

type DayGoals = { calories: number | null; proteinG: number | null; carbsG: number | null; fatG: number | null }

/** The goals that applied on `day` (YYYY-MM-DD): the latest entry on or before it; before history starts, the earliest
 * known; with no history, the current goals. */
export function goalsOnDay(history: readonly GoalHistoryEntry[], day: string, current: DayGoals): DayGoals {
  let applied = history[0]
  for (const entry of history) {
    if (entry.from > day) break
    applied = entry
  }
  if (!applied) return current
  return { calories: applied.calories ?? current.calories, proteinG: applied.proteinG ?? current.proteinG,
    carbsG: applied.carbsG ?? current.carbsG, fatG: applied.fatG ?? current.fatG }
}

/** Each day with the goals it had, and the goal changes inside [from, to]. */
export function withDayGoals<D extends { date?: unknown }>(days: D[], history: readonly GoalHistoryEntry[],
  current: DayGoals, from: string, to: string) {
  return {
    days: days.map(day => ({ ...day, goals: goalsOnDay(history, String(day.date), current) })),
    goalChanges: history.slice(1).filter(entry => entry.from >= from && entry.from <= to)
  }
}

async function updateProfile(db: UserDatabase, userId: string, patch: Record<string, unknown>) {
  const { data, error } = await db.from("User").update(patch).eq("id", userId).select(PROFILE_COLUMNS).single()
  if (error) throw error
  return shapeProfile(data as unknown as ProfileRow)
}

export type GoalChange = { calories?: number; proteinG?: number; carbsG?: number; fatG?: number }

/** The User columns for a goal change. Setting any macro marks the macros as set by hand, so the app keeps them.
 * Changing only calories rescales macros that follow the calories (not set by hand) to keep the user's split. */
export function goalPatch(current: ProfileRow, change: GoalChange) {
  const patch: Record<string, unknown> = {}
  if (change.calories != null) patch.calorieGoal = Math.round(change.calories)
  const macros = { proteinGoal: change.proteinG, carbsGoal: change.carbsG, fatGoal: change.fatG }
  const setsMacro = Object.values(macros).some(value => value != null)
  if (setsMacro) {
    for (const [column, value] of Object.entries(macros)) if (value != null) patch[column] = Math.round(value)
    patch.manualMacroGoals = true
  } else if (change.calories != null && !current.manualMacroGoals && current.calorieGoal && current.calorieGoal > 0) {
    const scale = change.calories / current.calorieGoal
    for (const column of ["proteinGoal", "carbsGoal", "fatGoal"] as const) {
      const value = current[column]
      if (value != null) patch[column] = Math.round(value * scale)
    }
  }
  return patch
}

/** A note when the macro goals don't add up to the calorie goal (4/4/9 kcal per gram, 15% tolerance). */
export function goalNote(goals: Profile["goals"]) {
  const { calories, proteinG, carbsG, fatG } = goals
  if (!calories || proteinG == null || carbsG == null || fatG == null) return undefined
  const fromMacros = proteinG * 4 + carbsG * 4 + fatG * 9
  if (Math.abs(fromMacros - calories) / calories <= 0.15) return undefined
  return `The macro goals add up to about ${Math.round(fromMacros)} kcal, not the ${calories} kcal calorie goal.`
}

export async function updateGoals(db: UserDatabase, userId: string, change: GoalChange) {
  const patch = goalPatch(await profileRow(db, userId), change)
  const profile = await updateProfile(db, userId, patch)
  return { ...profile, note: goalNote(profile.goals) }
}

export type BodyChange = { weightKg?: number; heightCm?: number; dateOfBirth?: string
  sex?: typeof SEXES[number]; activityLevel?: typeof ACTIVITY_LEVELS[number] }

export async function updateBody(db: UserDatabase, userId: string, change: BodyChange) {
  const current = await profileRow(db, userId)
  const patch: Record<string, unknown> = {}
  if (change.weightKg != null) patch.weightKg = Math.round(change.weightKg * 10) / 10
  if (change.heightCm != null) patch.heightCm = Math.round(change.heightCm * 10) / 10
  if (change.dateOfBirth != null) patch.dateOfBirth = storedBirthDate(change.dateOfBirth, zoneOf(current))
  if (change.sex != null) patch.gender = change.sex
  if (change.activityLevel != null) patch.activityLevel = change.activityLevel
  return updateProfile(db, userId, patch)
}
