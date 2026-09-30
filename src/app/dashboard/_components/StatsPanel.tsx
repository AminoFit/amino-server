import { FireIcon } from "@heroicons/react/20/solid"
import type { Dashboard } from "../_lib/types"
import { format, shiftDay } from "../_lib/dates"
import { MACROS, averages, heatmap, number, targetDays, titleCase, type HeatCell } from "../_lib/stats"

// The Stats page, from the last 12 weeks: streak and averages, days on target, calories per day, a calendar of
// calories against the goal, the average day against the goals, and the foods logged most. Days link to the log.

export function Card({ title, subtitle, children, className = "", style }: { title: string; subtitle?: string;
  children: React.ReactNode; className?: string; style?: React.CSSProperties }) {
  return (
    <section style={style} className={`min-w-0 rounded-3xl border border-app-border/70 bg-app-card p-5 shadow-sm shadow-black/[0.03] ${className}`}>
      <div className="mb-4">
        <h2 className="text-[15px] font-semibold tracking-tight">{title}</h2>
        {subtitle && <p className="mt-0.5 text-xs text-app-muted">{subtitle}</p>}
      </div>
      {children}
    </section>
  )
}

const delay = (ms: number) => ({ "--delay": `${ms}ms` }) as React.CSSProperties
const dayLink = (date: string) => `/log?day=${date}`

function Tile({ label, value, unit, note }: { label: string; value: string; unit?: string; note?: string }) {
  return (
    <div className="rounded-2xl bg-app-text/[0.04] px-4 py-3.5">
      <p className="text-[11px] font-medium uppercase tracking-wide text-app-muted">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums tracking-tight">{value}{unit && <span className="ml-1 text-xs font-normal text-app-muted">{unit}</span>}</p>
      {note && <p className="mt-0.5 text-xs text-app-muted">{note}</p>}
    </div>
  )
}

const MACRO_BG: Record<string, string> = { kcal: "bg-app-kcal", carbG: "bg-app-carb", proteinG: "bg-app-protein", totalFatG: "bg-app-fat" }
const HEAT: Record<HeatCell["level"], string> = {
  none: "bg-app-text/[0.07]", low: "bg-app-kcal/25", mid: "bg-app-kcal/55", goal: "bg-app-kcal", over: "bg-app-carb"
}

function Overview({ data }: { data: Dashboard }) {
  const { today, goals, recent } = data
  const week = averages(recent, today, 7)
  const month = averages(recent, today, 30)
  const target = targetDays(recent, today, goals, 30)
  const streak = data.stats.streak
  const ofGoal = (kcal: number) => `${Math.round((100 * kcal) / goals.kcal)}% of goal`
  return (
    <Card title="Overview" subtitle="Averages count the days you logged food" className="app-rise lg:col-span-2" style={delay(40)}>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 [&>*]:min-w-0">
        <div className="rounded-2xl bg-gradient-to-br from-app-carb/25 to-app-protein/15 px-4 py-3.5">
          <p className="text-[11px] font-medium uppercase tracking-wide text-app-muted">Streak</p>
          <p className="mt-1 flex items-center gap-1 text-2xl font-semibold tabular-nums tracking-tight">
            <FireIcon className={`h-5 w-5 ${streak ? "text-app-carb" : "text-app-muted"}`} aria-hidden />{streak}
          </p>
          <p className="mt-0.5 text-xs text-app-muted">{streak === 1 ? "day" : "days"} in a row</p>
        </div>
        <Tile label="7-day average" value={week.loggedDays ? number(week.kcal) : "—"} unit="kcal"
          note={week.loggedDays ? ofGoal(week.kcal) : "Nothing logged"} />
        <Tile label="30-day average" value={month.loggedDays ? number(month.kcal) : "—"} unit="kcal"
          note={month.loggedDays ? ofGoal(month.kcal) : "Nothing logged"} />
        <Tile label="Days logged" value={String(month.loggedDays)} unit="of 30" note="Last 30 days" />
      </div>
      <div className="mt-5">
        <p className="mb-2.5 text-xs text-app-muted">
          On target, last 30 days <span className="opacity-70">(within 10%; protein at least 90%)</span>
        </p>
        <ul className="grid grid-cols-1 gap-x-8 gap-y-2 sm:grid-cols-2">
          {MACROS.map(({ key, label }) => {
            const share = target.logged ? target.hits[key] / target.logged : 0
            return (
              <li key={key} className="grid min-w-0 grid-cols-[4.5rem_minmax(0,1fr)_auto] items-center gap-3 text-sm">
                <span className="text-app-muted">{label}</span>
                <span className="h-1.5 overflow-hidden rounded-full bg-app-text/[0.07]">
                  <span className={`app-bar block h-full rounded-full ${MACRO_BG[key]}`} style={{ transform: `scaleX(${share})` }} />
                </span>
                <span className="text-xs tabular-nums text-app-muted">
                  <span className="font-semibold text-app-text">{target.hits[key]}</span> / {target.logged} days
                </span>
              </li>
            )
          })}
        </ul>
      </div>
    </Card>
  )
}

/** Calories each day for 30 days, with the goal as a dashed line. */
function CaloriesChart({ data }: { data: Dashboard }) {
  const { today, goals, recent } = data
  const byDate = new Map(recent.map(day => [day.date, day.kcal]))
  const days = Array.from({ length: 30 }, (_, i) => shiftDay(today, i - 29))
  const top = Math.max(goals.kcal * 1.3, ...days.map(day => byDate.get(day) ?? 0))
  return (
    <Card title="Calories" subtitle="Last 30 days" className="app-rise" style={delay(100)}>
      <div className="relative h-44">
        <div className="absolute inset-x-0 border-t border-dashed border-app-text/30" style={{ bottom: `${(100 * goals.kcal) / top}%` }}>
          <span className="absolute -top-2.5 right-0 rounded bg-app-card px-1 text-[10px] tabular-nums text-app-muted">
            goal {number(goals.kcal)}
          </span>
        </div>
        <div className="flex h-full min-w-0 items-end gap-[2px] sm:gap-[3px]">
          {days.map((day, index) => {
            const kcal = byDate.get(day) ?? 0
            const over = kcal > goals.kcal * 1.1
            return (
              <a key={day} href={dayLink(day)} title={`${format(day, { weekday: "short", month: "short", day: "numeric" })} · ${number(kcal)} kcal`}
                className="group flex h-full min-w-0 flex-1 items-end rounded-t-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-app-link">
                <span className={`app-bar-y block w-full rounded-t-md transition group-hover:opacity-80 ${kcal ? over ? "bg-app-carb" : "bg-app-kcal" : "bg-app-text/[0.08]"}`}
                  style={{ height: kcal ? `${Math.max(2, (100 * kcal) / top)}%` : "3px", animationDelay: `${120 + index * 12}ms` }} />
              </a>
            )
          })}
        </div>
      </div>
      <div className="mt-2 flex justify-between text-[11px] text-app-muted">
        <span>{format(days[0], { month: "short", day: "numeric" })}</span><span>Today</span>
      </div>
    </Card>
  )
}

function Calendar({ data }: { data: Dashboard }) {
  const weeks = heatmap(data.recent, data.today, data.goals.kcal)
  return (
    <Card title="Last 12 weeks" subtitle="Calories against your goal. Pick a day to open it." className="app-rise" style={delay(140)}>
      <div className="mx-auto flex min-w-0 max-w-md gap-[3px]">
        {weeks.map(column => (
          <div key={column[0].date} className="flex min-w-0 flex-1 flex-col gap-[3px]">
            {column.map(cell => cell.future
              ? <span key={cell.date} className="aspect-square w-full" />
              : <a key={cell.date} href={dayLink(cell.date)}
                  title={`${format(cell.date, { weekday: "short", month: "short", day: "numeric" })}${cell.kcal ? ` · ${number(cell.kcal)} kcal` : ""}`}
                  className={`aspect-square w-full rounded-[4px] transition hover:scale-110 hover:ring-2 hover:ring-app-link/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-app-link ${HEAT[cell.level]} ${cell.date === data.today ? "ring-1 ring-app-text/50" : ""}`} />)}
          </div>
        ))}
      </div>
      <div className="mx-auto mt-3 flex max-w-md items-center justify-between text-[11px] text-app-muted">
        <span>{format(weeks[0][0].date, { month: "short", day: "numeric" })}</span>
        <span className="flex items-center gap-3">
          {([["low", "Under"], ["goal", "On goal"], ["over", "Over"]] as const).map(([level, label]) => (
            <span key={level} className="flex items-center gap-1"><span className={`h-2.5 w-2.5 rounded-[3px] ${HEAT[level]}`} />{label}</span>
          ))}
        </span>
      </div>
    </Card>
  )
}

/** The average logged day in the last 30 days against the goals. */
function AverageDay({ data }: { data: Dashboard }) {
  const month = averages(data.recent, data.today, 30)
  return (
    <Card title="Your average day" subtitle="Last 30 days, against your goals" className="app-rise" style={delay(180)}>
      <ul className="space-y-4">
        {MACROS.map(({ key, label, unit }) => {
          const value = month[key], goal = data.goals[key]
          const scale = Math.max(goal * 1.5, value)
          return (
            <li key={key}>
              <div className="flex items-baseline justify-between text-sm">
                <span className="text-app-muted">{label}</span>
                <span className="tabular-nums"><span className="font-semibold">{number(value)}</span>
                  <span className="text-app-muted"> / {number(goal)} {unit}</span></span>
              </div>
              <div className="relative mt-1.5 h-2.5 overflow-hidden rounded-full bg-app-text/[0.07]">
                <span className={`app-bar absolute inset-y-0 left-0 w-full rounded-full ${MACRO_BG[key]}`} style={{ transform: `scaleX(${value / scale})` }} />
                <span className="absolute inset-y-0 w-0.5 bg-app-text/60" style={{ left: `${(100 * goal) / scale}%` }} title="Goal" />
              </div>
            </li>
          )
        })}
      </ul>
    </Card>
  )
}

function TopFoods({ data }: { data: Dashboard }) {
  return (
    <Card title="Most logged" subtitle="Last 30 days" className="app-rise" style={delay(220)}>
      {data.stats.topFoods.length === 0 ? <p className="text-sm text-app-muted">Nothing logged in the last 30 days.</p> : (
        <ul className="space-y-1">
          {data.stats.topFoods.map(food => (
            <li key={food.id} className="flex items-center gap-3 rounded-xl px-1 py-1.5">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-app-text/[0.06]">
                {food.icon && <img src={food.icon} alt="" width={28} height={28} loading="lazy" decoding="async" className="h-7 w-7 object-contain" />}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">{titleCase(food.name ?? "Unknown food")}</span>
                {food.brand && <span className="block truncate text-xs text-app-muted">{food.brand}</span>}
              </span>
              <span className="text-sm tabular-nums text-app-muted"><span className="font-semibold text-app-text">{food.times}</span>×</span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}

export function StatsView({ data }: { data: Dashboard }) {
  return (
    <main className="mx-auto max-w-6xl px-4 pb-16 pt-6 sm:px-6 lg:pt-8">
      <h1 className="app-rise mb-4 px-1 text-2xl font-semibold tracking-tight sm:text-3xl">Stats</h1>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Overview data={data} />
        <CaloriesChart data={data} />
        <Calendar data={data} />
        <AverageDay data={data} />
        <TopFoods data={data} />
      </div>
    </main>
  )
}
