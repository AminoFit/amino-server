import { FireIcon } from "@heroicons/react/20/solid"
import type { Dashboard } from "../_lib/types"
import { format } from "../_lib/dates"
import { MACROS, averages, heatmap, number, targetDays, titleCase, type HeatCell } from "../_lib/stats"

// The side panel's stats from the last 12 weeks: streak, averages, days on target, a calendar of calories against the
// goal, and the foods logged most.

export function Card({ title, subtitle, children, className = "", style }: { title: string; subtitle?: string;
  children: React.ReactNode; className?: string; style?: React.CSSProperties }) {
  return (
    <section style={style} className={`rounded-3xl border border-app-border/70 bg-app-card p-5 shadow-sm shadow-black/[0.03] ${className}`}>
      <div className="mb-4">
        <h2 className="text-[15px] font-semibold tracking-tight">{title}</h2>
        {subtitle && <p className="mt-0.5 text-xs text-app-muted">{subtitle}</p>}
      </div>
      {children}
    </section>
  )
}

function Tile({ label, value, unit, note }: { label: string; value: string; unit?: string; note?: string }) {
  return (
    <div className="rounded-2xl bg-app-text/[0.04] px-3 py-3">
      <p className="text-[11px] font-medium uppercase tracking-wide text-app-muted">{label}</p>
      <p className="mt-1 text-xl font-semibold tabular-nums tracking-tight">{value}{unit && <span className="ml-1 text-xs font-normal text-app-muted">{unit}</span>}</p>
      {note && <p className="mt-0.5 text-[11px] text-app-muted">{note}</p>}
    </div>
  )
}

const TARGET_BAR: Record<string, string> = { kcal: "bg-app-kcal", carbG: "bg-app-carb", proteinG: "bg-app-protein", totalFatG: "bg-app-fat" }
const HEAT: Record<HeatCell["level"], string> = {
  none: "bg-app-text/[0.07]", low: "bg-app-kcal/25", mid: "bg-app-kcal/55", goal: "bg-app-kcal", over: "bg-app-carb"
}

export function StatsPanel({ data, onPickDay, selected }: { data: Dashboard; onPickDay: (day: string) => void; selected: string }) {
  const { today, goals, recent } = data
  const week = averages(recent, today, 7)
  const month = averages(recent, today, 30)
  const target = targetDays(recent, today, goals, 30)
  const weeks = heatmap(recent, today, goals.kcal)
  const streak = data.stats.streak
  return (
    <>
      <Card title="Overview" subtitle="Averages count the days you logged food" className="app-rise" style={{ "--delay": "80ms" } as React.CSSProperties}>
        <div className="grid grid-cols-3 gap-2">
          <div className="rounded-2xl bg-gradient-to-br from-app-carb/25 to-app-protein/15 px-3 py-3">
            <p className="text-[11px] font-medium uppercase tracking-wide text-app-muted">Streak</p>
            <p className="mt-1 flex items-center gap-1 text-xl font-semibold tabular-nums tracking-tight">
              <FireIcon className={`h-5 w-5 ${streak ? "text-app-carb" : "text-app-muted"}`} aria-hidden />{streak}
            </p>
            <p className="mt-0.5 text-[11px] text-app-muted">{streak === 1 ? "day" : "days"} in a row</p>
          </div>
          <Tile label="7 days" value={week.loggedDays ? number(week.kcal) : "—"} unit="kcal"
            note={week.loggedDays ? `${Math.round((100 * week.kcal) / goals.kcal)}% of goal` : "Nothing logged"} />
          <Tile label="30 days" value={month.loggedDays ? number(month.kcal) : "—"} unit="kcal"
            note={month.loggedDays ? `${Math.round((100 * month.kcal) / goals.kcal)}% of goal` : "Nothing logged"} />
        </div>
        <div className="mt-5">
          <p className="mb-2.5 text-xs text-app-muted">
            On target, last 30 days <span className="opacity-70">(within 10%; protein at least 90%)</span>
          </p>
          <ul className="space-y-2">
            {MACROS.map(({ key, label }) => {
              const share = target.logged ? target.hits[key] / target.logged : 0
              return (
                <li key={key} className="grid grid-cols-[4.5rem_1fr_auto] items-center gap-3 text-sm">
                  <span className="text-app-muted">{label}</span>
                  <span className="h-1.5 overflow-hidden rounded-full bg-app-text/[0.07]">
                    <span className={`app-bar block h-full rounded-full ${TARGET_BAR[key]}`} style={{ transform: `scaleX(${share})` }} />
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

      <Card title="Last 12 weeks" subtitle="Calories against your goal. Pick a day to open it." className="app-rise"
        style={{ "--delay": "140ms" } as React.CSSProperties}>
        <div className="flex gap-[3px]">
          {weeks.map(column => (
            <div key={column[0].date} className="flex flex-1 flex-col gap-[3px]">
              {column.map(cell => (
                <button key={cell.date} type="button" disabled={cell.future}
                  onClick={() => onPickDay(cell.date)}
                  title={`${format(cell.date, { weekday: "short", month: "short", day: "numeric" })}${cell.kcal ? ` · ${number(cell.kcal)} kcal` : ""}`}
                  className={`aspect-square w-full rounded-[4px] transition hover:scale-110 hover:ring-2 hover:ring-app-link/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-app-link disabled:invisible ${HEAT[cell.level]} ${cell.date === selected ? "ring-2 ring-app-text" : ""}`} />
              ))}
            </div>
          ))}
        </div>
        <div className="mt-3 flex items-center justify-between text-[11px] text-app-muted">
          <span>{format(weeks[0][0].date, { month: "short", day: "numeric" })}</span>
          <span className="flex items-center gap-3">
            {([["low", "Under"], ["goal", "On goal"], ["over", "Over"]] as const).map(([level, label]) => (
              <span key={level} className="flex items-center gap-1"><span className={`h-2.5 w-2.5 rounded-[3px] ${HEAT[level]}`} />{label}</span>
            ))}
          </span>
        </div>
      </Card>

      {data.stats.topFoods.length > 0 && (
        <Card title="Most logged" subtitle="Last 30 days" className="app-rise" style={{ "--delay": "200ms" } as React.CSSProperties}>
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
        </Card>
      )}
    </>
  )
}
