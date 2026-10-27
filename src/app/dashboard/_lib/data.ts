import { createClient } from "@/utils/supabase/server"
import { createAdminSupabase } from "@/utils/supabase/serverAdmin"
import { listGrants } from "@/utils/supabase/oauthServer"
import type { Agent, AgentUsage, Dashboard, Day, DayTotals, DayWithWeek, GoalChange, Goals } from "./types"
import { shiftDay, weekStart } from "./dates"
import type { ExpenditureEstimate, ExpenditurePoint, UnitPreference, WeightData, WeightDay } from "./weight"

// Reads for the dashboard, as the signed-in user: the web_* functions check auth.uid() themselves, so a missing or
// expired session fails the call rather than returning someone else's rows.

export class SignedOut extends Error {}

// The app's defaults when a goal was never set (amino-mobile providers/userContext.tsx).
const DEFAULT_GOALS: Goals = { kcal: 2000, proteinG: 140, carbG: 150, totalFatG: 80 }
const goalsOf = (goals: Partial<Record<keyof Goals, number | null>> | null | undefined): Goals =>
  Object.fromEntries(Object.entries(DEFAULT_GOALS).map(([key, fallback]) =>
    [key, goals?.[key as keyof Goals] || fallback])) as Goals

type Rpc = ReturnType<typeof createClient>
async function call<T>(db: Rpc, name: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await (db as any).rpc(name, args)
  if (error) {
    // 28000 is web_*'s "Not signed in"; 42501 is anon without EXECUTE; PGRST301/303 are expired or bad JWTs.
    if (["28000", "42501", "PGRST301", "PGRST303"].includes(error.code)) throw new SignedOut(error.message)
    throw new Error(`${name}: ${error.message}`)
  }
  return data as T
}

/** Meal photos are private; the browser gets signed URLs good for an hour. The paths come from the user's own meals. */
async function withPhotoUrls(day: Day): Promise<Day> {
  const paths = day.meals.flatMap(meal => meal.photos ?? [])
  if (!paths.length) return day
  const { data, error } = await createAdminSupabase().storage.from("userUploadedImages").createSignedUrls(paths, 3600)
  if (error) { console.error("dashboard_photos_failed", error); return { ...day, meals: day.meals.map(m => ({ ...m, photos: undefined })) } }
  const urls = new Map((data ?? []).flatMap(item => item.path && item.signedUrl ? [[item.path, item.signedUrl] as const] : []))
  return { ...day, meals: day.meals.map(meal => ({ ...meal,
    photos: meal.photos?.map(path => urls.get(path)).filter((url): url is string => !!url) })) }
}

type GoalHistoryRow = { effectiveOn: string; calorieGoal: number | null; proteinGoal: number | null; carbsGoal: number | null
  fatGoal: number | null }

/** The user's goal changes, oldest first (UserGoalHistory; its row policy returns only the signed-in user's). */
async function goalHistory(db: Rpc, current: Goals): Promise<GoalChange[]> {
  const { data, error } = await (db as any).from("UserGoalHistory")
    .select("effectiveOn,calorieGoal,proteinGoal,carbsGoal,fatGoal").order("effectiveOn")
  if (error) throw new Error(`UserGoalHistory: ${error.message}`)
  return ((data ?? []) as GoalHistoryRow[]).map(row => ({ from: row.effectiveOn, goals: {
    kcal: row.calorieGoal || current.kcal, proteinG: row.proteinGoal || current.proteinG,
    carbG: row.carbsGoal || current.carbG, totalFatG: row.fatGoal || current.totalFatG } }))
}

/** The first page load: goals and their history, the day (today when none is given), its week, 12 weeks of totals and
 * stats. */
export async function loadDashboard(day: string | null, { photos = true } = {}): Promise<Dashboard> {
  const db = createClient()
  const raw = await call<Dashboard>(db, "web_dashboard", { p_date: day })
  const goals = goalsOf(raw.goals)
  const [history, shownDay] = await Promise.all([goalHistory(db, goals), photos ? withPhotoUrls(raw.day) : raw.day])
  return { ...raw, goals, goalHistory: history, day: shownDay }
}

export async function loadDay(day: string): Promise<DayWithWeek> {
  const db = createClient()
  const start = weekStart(day)
  const [raw, week] = await Promise.all([call<Day>(db, "web_day", { p_date: day }),
    call<DayTotals[]>(db, "web_days", { p_from: start, p_to: shiftDay(start, 6) })])
  return { day: await withPhotoUrls(raw), week }
}

/** Connected agents (Supabase Auth's OAuth grants) with their use over the last 30 days. */
export async function loadAgents(accessToken: string): Promise<Agent[]> {
  const [grants, usage] = await Promise.all([listGrants(accessToken),
    call<AgentUsage[]>(createClient(), "web_agent_usage", { p_days: 30 })])
  const byClient = new Map(usage.map(row => [row.clientId, row]))
  return grants.map(grant => ({ ...grant.client, grantedAt: grant.grantedAt, usage: byClient.get(grant.client.id) ?? null }))
    .sort((a, b) => (b.usage?.lastUsedAt ?? b.grantedAt).localeCompare(a.usage?.lastUsedAt ?? a.grantedAt))
}

/** Weight and expenditure for /stats: the trend over the 31 days ending today (so the change spans 30), the estimate
 * from the last 28 days and the daily estimates over the 30 days ending yesterday, with the goal weight and units. The
 * server functions check auth.uid() themselves (weight_trend, energy_expenditure, energy_expenditure_history). */
export async function loadWeight(userId: string, today: string): Promise<WeightData> {
  const db = createClient()
  const from = shiftDay(today, -30), yesterday = shiftDay(today, -1), expenditureFrom = shiftDay(yesterday, -29)
  const [profile, days, estimate, history] = await Promise.all([
    (db as any).from("User").select("goalWeightKg, unitPreference").eq("id", userId).maybeSingle()
      .then(({ data, error }: { data: { goalWeightKg: number | string | null; unitPreference: string | null } | null; error: { message: string } | null }) => {
        if (error) throw new Error(`User: ${error.message}`)
        return data
      }),
    call<WeightDay[]>(db, "weight_trend", { p_from: from, p_to: today }),
    call<ExpenditureEstimate | null>(db, "energy_expenditure", { p_days: 28 }),
    call<ExpenditurePoint[] | null>(db, "energy_expenditure_history", { p_from: expenditureFrom, p_to: yesterday, p_step: 1, p_days: 28 })
  ])
  const toNumber = (value: unknown) => value == null ? null : Number(value)
  return {
    unit: (profile?.unitPreference ?? "METRIC") as UnitPreference,
    goalKg: toNumber(profile?.goalWeightKg),
    days: (days ?? []).map(day => ({ day: day.day, weightKg: toNumber(day.weightKg), bodyFatPct: toNumber(day.bodyFatPct),
      trendKg: Number(day.trendKg) })),
    from, expenditureFrom, expenditureTo: yesterday, estimate, history: history ?? []
  }
}
