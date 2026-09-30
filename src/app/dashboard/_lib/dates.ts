// Calendar days as YYYY-MM-DD strings, independent of the browser's time zone (days are the user's profile zone).

export const DAY = /^\d{4}-\d{2}-\d{2}$/

export const isDay = (value: unknown): value is string =>
  typeof value === "string" && DAY.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`))

const asDate = (day: string) => new Date(`${day}T00:00:00Z`)

export const shiftDay = (day: string, by: number) => {
  const date = asDate(day)
  date.setUTCDate(date.getUTCDate() + by)
  return date.toISOString().slice(0, 10)
}

export const daysBetween = (from: string, to: string) => Math.round((asDate(to).getTime() - asDate(from).getTime()) / 86_400_000)

/** Sunday of the day's week, as in the app. */
export const weekStart = (day: string) => shiftDay(day, -asDate(day).getUTCDay())

export const weekOf = (day: string) => Array.from({ length: 7 }, (_, i) => shiftDay(weekStart(day), i))

export const format = (day: string, options: Intl.DateTimeFormatOptions) =>
  asDate(day).toLocaleDateString("en-US", { timeZone: "UTC", ...options })

/** "Today", "Yesterday", or "Tuesday, Sep 30". */
export function dayTitle(day: string, today: string) {
  const offset = daysBetween(day, today)
  if (offset === 0) return "Today"
  if (offset === 1) return "Yesterday"
  if (offset === -1) return "Tomorrow"
  return format(day, { weekday: "long", month: "short", day: "numeric", ...(day.slice(0, 4) !== today.slice(0, 4) ? { year: "numeric" } : {}) })
}
