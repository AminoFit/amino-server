// The app's timestamps are `timestamp without time zone` columns holding UTC, so PostgREST returns them without a
// zone ("2026-09-27T07:21:35.208"). Node would read such a string as server-local time, and Postgres casts to
// `timestamp` drop an offset, so every instant entering a meal operation is normalised to UTC ("…Z") first.
const ZONE = /(?:Z|[+-]\d\d:?\d\d)$/i

/** An instant as UTC ISO ("…Z"); a zone-less database timestamp is UTC. Throws on anything unparseable. */
export function utcInstant(value: string): string {
  const trimmed = value.trim()
  const ms = /^\d{4}-\d\d-\d\dT/.test(trimmed) ? Date.parse(ZONE.test(trimmed) ? trimmed : `${trimmed}Z`) : NaN
  if (!Number.isFinite(ms)) throw new Error("invalid_instant")
  return new Date(ms).toISOString()
}

/** An IANA timezone this runtime knows ("America/Denver"). */
export function validTimezone(value: unknown): value is string {
  if (typeof value !== "string" || !value || value.length > 80) return false
  try { new Intl.DateTimeFormat("en", { timeZone: value }); return true } catch { return false }
}

/** The user's wall clock at an instant, e.g. "Monday 2026-09-28 01:21", so the model never does timezone arithmetic. */
export function localTime(instant: string, timezone: string): string {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone: validTimezone(timezone) ? timezone : "UTC", weekday: "long", year: "numeric",
    month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
    .formatToParts(new Date(instant)).map(part => [part.type, part.value]))
  return `${parts.weekday} ${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}`
}
