"use client"

import { useEffect, useState } from "react"
import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query"
import { ChevronDownIcon } from "@heroicons/react/20/solid"
import type { Dashboard, DayTotals, DayWithWeek } from "../_lib/types"
import { dayTitle, format, isDay, shiftDay, weekOf } from "../_lib/dates"
import { dayTotals, goalsOn, number, type GoalsOn } from "../_lib/stats"
import { DayRing } from "./DayRing"
import { GoalBars } from "./GoalBars"
import { MealCard } from "./MealCard"

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

function WeekStrip({ day, today, kcalByDay, goalsOnDay, onPick }: { day: string; today: string; kcalByDay: Map<string, number>;
  goalsOnDay: GoalsOn; onPick: (day: string) => void }) {
  return (
    <div className="grid grid-cols-7 gap-1">
      {weekOf(day).map(date => {
        const selected = date === day, isToday = date === today, future = date > today, goal = goalsOnDay(date).kcal
        return (
          <button key={date} type="button" onClick={() => onPick(date)} aria-pressed={selected}
            aria-label={format(date, { weekday: "long", month: "long", day: "numeric" })}
            className={`flex flex-col items-center gap-1 rounded-2xl py-1.5 transition sm:gap-1.5 sm:py-2 duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-app-link
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

/** `loadedAt`: when the server read the first day. The tabs prefetch this page, so it can be minutes old by the time
 * it shows; the day refetches at once when it's older than the query's minute. */
export function LogView({ initial, loadedAt }: { initial: Dashboard; loadedAt: number }) {
  const queryClient = useQueryClient()
  const { today, goals, goalHistory } = initial
  // Each day is judged against the goals it had, not today's.
  const goalsOnDay: GoalsOn = date => goalsOn(goalHistory ?? [], date, goals)
  const [day, setDay] = useState(initial.day.date)
  const [direction, setDirection] = useState<"left" | "right" | null>(null)

  const query = useQuery({ ...dayQuery(day), placeholderData: keepPreviousData,
    initialData: day === initial.day.date ? { day: initial.day, week: initial.week } : undefined,
    initialDataUpdatedAt: loadedAt })
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

  // The day title is a date input: a tap opens the phone's own picker; on desktop the click opens the calendar
  // (the picker icon is stretched over the input, and showPicker covers browsers that ignore that).
  const openPicker = (event: React.MouseEvent<HTMLInputElement>) => {
    try { event.currentTarget.showPicker() } catch {}
  }

  const meals = shown.day.meals
  const totals = dayTotals(meals)
  const mealCount = meals.filter(meal => meal.items.length).length
  const firstShow = direction === null
  const slide = direction === "right" ? "app-from-right" : direction === "left" ? "app-from-left" : ""

  return (
    <>
      <main className="mx-auto max-w-3xl px-3 pb-16 pt-4 sm:px-6 sm:pt-6 lg:pt-8">
        <div className="min-w-0 space-y-4">
          <section className="app-rise rounded-3xl border border-app-border/70 bg-app-card/90 p-3.5 shadow-sm shadow-black/[0.03] sm:p-6">
            <div className="flex items-center gap-3">
              <div className="relative min-w-0 flex-1">
                <input type="date" value={day} max={shiftDay(today, 365)} aria-label="Pick a day" required
                  onChange={event => go(event.target.value)} onClick={openPicker}
                  className="peer absolute inset-0 z-10 h-full w-full cursor-pointer appearance-none opacity-0 text-base [&::-webkit-calendar-picker-indicator]:absolute [&::-webkit-calendar-picker-indicator]:inset-0 [&::-webkit-calendar-picker-indicator]:h-full [&::-webkit-calendar-picker-indicator]:w-full [&::-webkit-calendar-picker-indicator]:cursor-pointer" />
                <div className="-mx-2 flex max-w-full flex-col items-start rounded-xl px-2 py-1 transition peer-hover:bg-app-text/[0.05] peer-focus-visible:ring-2 peer-focus-visible:ring-app-link">
                  <span className="text-[11px] font-medium uppercase tracking-wider text-app-muted sm:text-xs">
                    {format(day, { month: "long", year: "numeric" })}
                  </span>
                  <span className="flex max-w-full items-center gap-1.5 text-xl font-semibold tracking-tight sm:text-3xl">
                    <span className="truncate">{dayTitle(day, today)}</span>
                    <ChevronDownIcon className="h-5 w-5 shrink-0 text-app-muted" aria-hidden />
                  </span>
                </div>
              </div>
              {day !== today && (
                <button type="button" onClick={() => go(today)}
                  className="app-fade shrink-0 rounded-full bg-app-text px-3.5 py-1.5 text-xs font-semibold text-app-bg transition hover:opacity-90 active:scale-95">
                  Today
                </button>
              )}
            </div>
            <div className="mt-3 sm:mt-5"><WeekStrip day={day} today={today} kcalByDay={kcalByDay} goalsOnDay={goalsOnDay} onPick={go} /></div>
            <div className={`mt-3 sm:mt-5 transition-opacity duration-200 ${loading ? "opacity-60" : ""}`}>
              <GoalBars totals={totals} goals={goalsOnDay(day)} />
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
