import type { UserDatabase } from "./auth"
import { McpInputError } from "./meals"
import { createAdminSupabase } from "@/utils/supabase/serverAdmin"

// Weight history for agents (2026-10-03-weight-history-plan.md): weigh-ins from Apple Health, the app and agents,
// per local day, with the smoothed trend the Progress tab shows. Read through weight_trend as the user.

const num = (value: unknown) => value == null ? null : Number(value)
const shift = (date: string, days: number) => new Date(Date.parse(`${date}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10)
const round = (value: number) => Math.round(value * 100) / 100

/** Days with a weigh-in in [from, to], and a summary: the latest weigh-in, today's trend, the trend's change. */
export async function weightHistory(db: UserDatabase, from: string, to: string) {
  // 30 days earlier too, for the 30-day change at the start of a short range.
  const { data, error } = await (db as any).rpc("weight_trend", { p_from: shift(from, -30), p_to: to })
  if (error) throw error
  const all = ((data ?? []) as Record<string, unknown>[]).map(row => ({ date: String(row.day), weightKg: num(row.weightKg),
    bodyFatPct: num(row.bodyFatPct), trendKg: Number(row.trendKg) }))
  const last = all.at(-1)
  const trendOn = (date: string) => all.find(day => day.date === date)?.trendKg
  const latest = [...all].reverse().find(day => day.weightKg != null)
  const change = (days: number) => {
    const then = last ? trendOn(shift(last.date, -days)) : undefined
    return last && then != null ? round(last.trendKg - then) : null
  }
  return {
    days: all.filter(day => day.date >= from && day.weightKg != null)
      .map(({ date, weightKg, bodyFatPct, trendKg }) => ({ date, weightKg, ...(bodyFatPct != null ? { bodyFatPct } : {}), trendKg })),
    summary: last ? { latestWeighIn: latest ? { date: latest.date, weightKg: latest.weightKg } : null, trendKg: last.trendKg,
      trendChange7DaysKg: change(7), trendChange30DaysKg: change(30) } : null
  }
}

/** One weight an agent records, at a time (default now); the profile weight follows the latest weigh-in. On the server
 * for the verified user: agent tokens can't call record_weight themselves. */
export async function recordWeight(userId: string, weightKg: number, measuredAt?: string) {
  if (measuredAt && Date.parse(measuredAt) > Date.now() + 86_400_000) throw new McpInputError("measuredAt is in the future.")
  const { error } = await (createAdminSupabase() as any).rpc("record_weight_for", { p_user_id: userId,
    p_weight_kg: Math.round(weightKg * 100) / 100, p_measured_at: measuredAt ?? null, p_source: "agent" })
  if (error) throw error
}

/** Estimated daily energy expenditure (energy_expenditure: complete-day intake minus the robust weight slope × 7,700
 * kcal/kg over the last `days` local days, ending yesterday). Only for users in FeatureFlag.expenditure_estimate. */
export async function expenditureEstimate(db: UserDatabase, days: number) {
  const { data, error } = await (db as any).rpc("energy_expenditure", { p_days: days })
  if (error) throw error
  const { enabled, ...estimate } = (data ?? {}) as { enabled?: boolean } & Record<string, unknown>
  if (!enabled) return { available: false as const, note: "The expenditure estimate isn't available for this user yet." }
  return { available: true as const, ...estimate }
}
