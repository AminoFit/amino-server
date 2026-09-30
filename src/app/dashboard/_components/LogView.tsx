"use client"

import { useEffect, useRef, useState } from "react"
import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query"
import { ChevronDownIcon, ChevronLeftIcon, ChevronRightIcon } from "@heroicons/react/20/solid"
import type { Dashboard, DayTotals, DayWithWeek } from "../_lib/types"
import { dayTitle, format, isDay, shiftDay, weekOf } from "../_lib/dates"
import { dayTotals, number } from "../_lib/stats"
import { DayRing } from "./DayRing"
import { GoalBars } from "./GoalBars"
import { MealCard } from "./MealCard"
import { TopBar } from "./TopBar"

// The web log: pick a day (arrows, the week strip, the calendar, or ← → and T on the keyboard) and see its goals and
// meals; stats are on /stats. The first day comes with the page; others load from /api/web/day, with the neighbouring
// days fetched ahead so moving a day at a time is instant.

const SIGN_IN = "/login?next=/log"

async function fetchDay(date: string): Promise<DayWithWeek> {
  const response = await fetch(`/api/web/day?date=${date}`, { cache: "no-store" })
  if (response.status === 401) { window.location.assign(SIGN_IN); throw new Error("signed_out") }
  if (!response.ok) throw new Error(`day ${response.status}`)
  return response.json()
}

const dayQuery = (date: string) => ({ queryKey: ["web-day", date], queryFn: () => fetchDay(date), staleTime: 60_000 })

function WeekStrip({ day, today, kcalByDay, goal, onPick }: { day: string; today: string; kcalByDay: Map<string, number>;
  goal: number; onPick: (day: string) => void }) {
  return (
    <div className="grid grid-cols-7 gap-1">
      {weekOf(day).map(date => {
        const selected = date === day, isToday = date === today, future = date > today
        return (
          <button key={date} type="button" onClick={() => onPick(date)} aria-pressed={selected}
            aria-label={format(date, { weekday: "long", month: "long", day: "numeric" })}
            className={`flex flex-col items-center gap-1.5 rounded-2xl py-2 transition duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-app-link
              ${selected ? "bg-app-text/10" : "hover:bg-app-text/[0.05]"} ${isToday && !selected ? "ring-1 ring-inset ring-app-text/15" : ""}
              ${future ? "opacity-45" : ""}`}>
            <span className={`text-[11px] font-medium uppercase tracking-wide ${selected ? "text-app-text" : "text-app-muted"}`}>
              {format(date, { weekday: "short" })}
            </span>
            <DayRing progress={goal ? (kcalByDay.get(date) ?? 0) / goal : 0}>{Number(date.slice(8))}</DayRing>
          </button>
        )
      })}
    </div>
  )
}

function RoundButton({ label, onClick, children, disabled }: { label: string; onClick: () => void; children: React.ReactNode; disabled?: boolean }) {
  return (
    <button type="button" aria-label={label} title={label} onClick={onClick} disabled={disabled}
      className="grid h-9 w-9 place-items-center rounded-full bg-app-text/[0.06] text-app-text transition hover:bg-app-text/[0.12] active:scale-95 disabled:opacity-30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-app-link">
      {children}
    </button>
  )
}

export function LogView({ initial }: { initial: Dashboard }) {
  const queryClient = useQueryClient()
  const { today, goals } = initial
  const [day, setDay] = useState(initial.day.date)
  const [direction, setDirection] = useState<"left" | "right" | null>(null)
  const picker = useRef<HTMLInputElement>(null)

  const query = useQuery({ ...dayQuery(day), placeholderData: keepPreviousData,
    initialData: day === initial.day.date ? { day: initial.day, week: initial.week } : undefined })
  const shown = query.data ?? { day: initial.day, week: initial.week }
  const loading = query.isPlaceholderData && query.isFetching

  // Calories per day for the rings: the 12 weeks from the page, then any week fetched since.
  const kcalByDay = new Map<string, number>()
  const addDays = (days: DayTotals[]) => days.forEach(d => kcalByDay.set(d.date, d.kcal))
  addDays(initial.recent)
  queryClient.getQueriesData<DayWithWeek>({ queryKey: ["web-day"] }).forEach(([, data]) => data && addDays(data.week))

  const go = (next: string) => {
    if (!isDay(next) || next === day) return
    setDirection(next > day ? "right" : "left")
    setDay(next)
    window.history.replaceState(null, "", next === today ? "/log" : `/log?day=${next}`)
  }

  useEffect(() => {
    void queryClient.prefetchQuery(dayQuery(shiftDay(day, -1)))
    if (day < today) void queryClient.prefetchQuery(dayQuery(shiftDay(day, 1)))
  }, [day, today, queryClient])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement
      if (event.metaKey || event.ctrlKey || event.altKey || target.closest("input, textarea, select, [role=menu]")) return
      if (event.key === "ArrowLeft") go(shiftDay(day, -1))
      else if (event.key === "ArrowRight") go(shiftDay(day, 1))
      else if (event.key === "t" || event.key === "T") go(today)
      else return
      event.preventDefault()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  })

  const openPicker = () => {
    const input = picker.current
    if (!input) return
    try { input.showPicker() } catch { input.focus() }
  }

  const meals = shown.day.meals
  const totals = dayTotals(meals)
  const mealCount = meals.filter(meal => meal.items.length).length
  const firstShow = direction === null
  const slide = direction === "right" ? "app-from-right" : direction === "left" ? "app-from-left" : ""

  return (
    <>
      <TopBar name={initial.name} email={initial.email} active="log" />
      <main className="mx-auto max-w-3xl px-4 pb-16 pt-6 sm:px-6 lg:pt-8">
        <div className="min-w-0 space-y-4">
          <section className="app-rise rounded-3xl border border-app-border/70 bg-app-card/90 p-4 shadow-sm shadow-black/[0.03] sm:p-6">
            <div className="flex items-center gap-3">
              <div className="relative min-w-0 flex-1">
                <button type="button" onClick={openPicker}
                  className="group -mx-2 flex max-w-full flex-col items-start rounded-xl px-2 py-1 text-left transition hover:bg-app-text/[0.05] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-app-link">
                  <span className="text-xs font-medium uppercase tracking-wider text-app-muted">
                    {format(day, { month: "long", year: "numeric" })}
                  </span>
                  <span className="flex items-center gap-1.5 text-2xl font-semibold tracking-tight sm:text-3xl">
                    <span className="truncate">{dayTitle(day, today)}</span>
                    <ChevronDownIcon className="h-5 w-5 shrink-0 text-app-muted transition group-hover:translate-y-0.5" aria-hidden />
                  </span>
                </button>
                <input ref={picker} type="date" value={day} max={shiftDay(today, 365)} tabIndex={-1} aria-label="Pick a day"
                  onChange={event => go(event.target.value)}
                  className="pointer-events-none absolute bottom-0 left-0 h-px w-px opacity-0" />
              </div>
              {day !== today && (
                <button type="button" onClick={() => go(today)}
                  className="app-fade rounded-full bg-app-text px-3.5 py-1.5 text-xs font-semibold text-app-bg transition hover:opacity-90 active:scale-95">
                  Today
                </button>
              )}
              <RoundButton label="Previous day" onClick={() => go(shiftDay(day, -1))}><ChevronLeftIcon className="h-5 w-5" /></RoundButton>
              <RoundButton label="Next day" onClick={() => go(shiftDay(day, 1))}><ChevronRightIcon className="h-5 w-5" /></RoundButton>
            </div>
            <div className="mt-5"><WeekStrip day={day} today={today} kcalByDay={kcalByDay} goal={goals.kcal} onPick={go} /></div>
            <div className={`mt-5 transition-opacity duration-200 ${loading ? "opacity-60" : ""}`}>
              <GoalBars totals={totals} goals={goals} />
              {totals.fiberG > 0 && <p className="mt-2.5 px-1 text-xs text-app-muted">{number(totals.fiberG, 1)} g fibre</p>}
            </div>
          </section>

          <div className="flex items-baseline justify-between px-1 pt-2">
            <h2 className="text-lg font-semibold tracking-tight">Meals</h2>
            <p className="text-sm tabular-nums text-app-muted">
              {mealCount ? `${mealCount} ${mealCount === 1 ? "meal" : "meals"} · ${number(totals.kcal)} kcal` : ""}
            </p>
          </div>

          <div key={shown.day.date} className={`space-y-3 transition-opacity duration-200 ${loading ? "opacity-50" : ""} ${slide}`} aria-busy={loading}>
            {query.isError && !loading && shown.day.date !== day ? (
              <div className="rounded-3xl border border-app-border/70 bg-app-card px-6 py-10 text-center">
                <p className="text-sm text-app-muted">This day couldn&apos;t be loaded.</p>
                <button type="button" onClick={() => void query.refetch()} className="mt-3 text-sm font-semibold text-app-link">Try again</button>
              </div>
            ) : meals.length === 0 ? (
              <div className="rounded-3xl border border-dashed border-app-border px-6 py-14 text-center">
                <p className="font-medium">{shown.day.date > today ? "This day hasn't happened yet" : shown.day.date === today ? "Nothing logged yet today" : "Nothing logged on this day"}</p>
                <p className="mt-1 text-sm text-app-muted">Meals you log in the Amino app show up here.</p>
              </div>
            ) : meals.map((meal, index) => (
              <MealCard key={meal.id} meal={meal} className={firstShow ? "app-rise" : ""}
                style={firstShow ? { "--delay": `${120 + Math.min(index, 8) * 50}ms` } as React.CSSProperties : undefined} />
            ))}
          </div>
        </div>


      </main>
    </>
  )
}
