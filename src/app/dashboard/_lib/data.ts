import { createClient } from "@/utils/supabase/server"
import { createAdminSupabase } from "@/utils/supabase/serverAdmin"
import { listGrants } from "@/utils/supabase/oauthServer"
import type { Agent, AgentUsage, Dashboard, Day, DayTotals, DayWithWeek, Goals } from "./types"
import { shiftDay, weekStart } from "./dates"

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

/** The first page load: goals, the day (today when none is given), its week, 12 weeks of totals and stats. */
export async function loadDashboard(day: string | null): Promise<Dashboard> {
  const raw = await call<Dashboard>(createClient(), "web_dashboard", { p_date: day })
  return { ...raw, goals: goalsOf(raw.goals), day: await withPhotoUrls(raw.day) }
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
