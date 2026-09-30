// Prisma-era columns are `timestamp without time zone` holding UTC; read them as UTC, not the server's local time.
export const utc = (value: string | null | undefined) =>
  value ? new Date(/(?:Z|[+-]\d\d:?\d\d)$/i.test(value) ? value : `${value}Z`) : null

export function ms(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) return "—"
  if (value < 1000) return `${Math.round(value)} ms`
  if (value < 60_000) return `${(value / 1000).toFixed(value < 10_000 ? 1 : 0)} s`
  return `${Math.floor(value / 60_000)} m ${Math.round((value % 60_000) / 1000)} s`
}

export const num = (value: number | null | undefined, digits = 0) =>
  value == null || !Number.isFinite(value) ? "—" : value.toLocaleString("en-US", { maximumFractionDigits: digits })

export const pct = (part: number, whole: number) => (whole ? `${((100 * part) / whole).toFixed(part && part / whole < 0.1 ? 1 : 0)}%` : "—")

export function usd(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) return "—"
  return value < 0.01 ? `$${value.toFixed(4)}` : `$${value.toFixed(value < 1 ? 3 : 2)}`
}

export function ago(value: string | Date | null | undefined, now = Date.now()) {
  const date = typeof value === "string" ? utc(value) : value
  if (!date) return "—"
  const seconds = Math.round((now - date.getTime()) / 1000)
  const future = seconds < 0, s = Math.abs(seconds)
  const text = s < 60 ? `${s}s` : s < 3600 ? `${Math.round(s / 60)}m` : s < 86400 ? `${Math.round(s / 3600)}h` :
    s < 86400 * 60 ? `${Math.round(s / 86400)}d` : `${Math.round(s / (86400 * 30))}mo`
  return future ? `in ${text}` : `${text} ago`
}

/** A date in a time zone as "Wed 1 Oct, 08:14". */
export function inZone(value: string | Date | null | undefined, timeZone: string, withDate = true) {
  const date = typeof value === "string" ? utc(value) : value
  if (!date) return "—"
  try {
    return date.toLocaleString("en-GB", { timeZone, hour: "2-digit", minute: "2-digit",
      ...(withDate ? { weekday: "short", day: "numeric", month: "short" } : {}) })
  } catch { return date.toISOString() }
}

/** YYYY-MM-DD of an instant in a time zone. */
export function dayIn(date: Date, timeZone: string) {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(date)
}

/** The UTC instants bounding a calendar day in a time zone (handles DST: the offset is measured at each end). */
export function zoneDayBounds(day: string, timeZone: string) {
  const offsetAt = (instant: Date) => {
    const parts = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone, hourCycle: "h23", year: "numeric",
      month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" })
      .formatToParts(instant).map(part => [part.type, part.value]))
    const asUtc = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute, +parts.second)
    return asUtc - instant.getTime()
  }
  const midnight = (d: string) => { const guess = new Date(`${d}T00:00:00Z`); return new Date(guess.getTime() - offsetAt(guess)) }
  const next = new Date(`${day}T00:00:00Z`); next.setUTCDate(next.getUTCDate() + 1)
  return { from: midnight(day), to: midnight(next.toISOString().slice(0, 10)) }
}

export const shiftDay = (day: string, by: number) => {
  const date = new Date(`${day}T00:00:00Z`); date.setUTCDate(date.getUTCDate() + by); return date.toISOString().slice(0, 10)
}

/** Search params as a flat record of strings (Next passes string | string[] | undefined). */
export type Params = Record<string, string | string[] | undefined>
export const param = (params: Params, key: string) => { const value = params[key]; return (Array.isArray(value) ? value[0] : value)?.trim() || undefined }

/** A link to the same page with some params changed (undefined removes one). */
export function withParams(path: string, params: Params, changes: Record<string, string | number | undefined>) {
  const next = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) { const v = Array.isArray(value) ? value[0] : value; if (v) next.set(key, v) }
  for (const [key, value] of Object.entries(changes)) value === undefined || value === "" ? next.delete(key) : next.set(key, String(value))
  const query = next.toString()
  return query ? `${path}?${query}` : path
}

export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
