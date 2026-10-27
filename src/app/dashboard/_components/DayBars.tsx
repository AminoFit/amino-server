"use client"

import type { Goals } from "../_lib/types"
import { MACROS, number, type MacroKey, type Totals } from "../_lib/stats"
import { useCountUp } from "./useCountUp"

// The day's totals against its goals, as the app's log header shows them (amino-mobile DayBars, scrolled): a calorie bar
// saying what's left, its goal in the short segment on the right that fills with anything up to 25% over it, and under
// it one row of the three macros, each with its goal in its label ("90 / 217 Carb").

const FILL: Record<MacroKey, { main: string; over: string }> = {
  kcal: { main: "bg-app-kcal/45", over: "bg-[#1F7EA0]/70" },
  proteinG: { main: "bg-app-protein/45", over: "bg-[#B8284B]/70" },
  carbG: { main: "bg-app-carb/45", over: "bg-[#CC7A2E]/70" },
  totalFatG: { main: "bg-app-fat/45", over: "bg-[#8A1FBF]/70" }
}
/** Up to 25% over the goal fills the calorie bar's right-hand segment. */
const OVERFLOW = 0.25

const ratioOf = (value: number, goal: number) => goal > 0 ? Math.max(value / goal, 0) : 0

function CalorieBar({ value, goal }: { value: number; goal: number }) {
  const shown = useCountUp(value)
  const ratio = ratioOf(value, goal)
  const left = goal - shown
  return (
    <div className="flex h-10 overflow-hidden rounded-xl sm:h-11" role="meter" aria-label="Calories"
      aria-valuenow={Math.round(value)} aria-valuemin={0} aria-valuemax={goal}>
      <div className="relative flex-[4] bg-app-text/[0.07]">
        <div className={`app-bar absolute inset-0 ${FILL.kcal.main} ${ratio > 1 ? "" : "rounded-r-[5px]"}`}
          style={{ transform: `scaleX(${Math.min(ratio, 1)})` }} />
        <div className="relative flex h-full items-baseline gap-2 truncate px-3 leading-[2.5rem] sm:leading-[2.75rem]">
          <span className="text-base font-semibold tabular-nums sm:text-lg">{number(shown)}</span>
          <span className="text-sm sm:text-[15px]">Calories</span>
          <span className="ml-1 text-sm tabular-nums text-app-text/80 sm:text-[15px]">
            {left >= 0 ? `${number(left)} left` : `${number(-left)} over`}
          </span>
        </div>
      </div>
      <div className="relative flex-1 bg-app-text/[0.12]">
        <div className={`app-bar absolute inset-0 ${FILL.kcal.over} rounded-r-xl`}
          style={{ transform: `scaleX(${Math.min(Math.max(ratio - 1, 0) / OVERFLOW, 1)})`, animationDelay: "350ms" }} />
        <span className="relative flex h-full items-center px-2 text-[13px] font-semibold tabular-nums sm:px-2.5">{number(goal)}</span>
      </div>
    </div>
  )
}

function MacroBar({ macro, value, goal, delay }: { macro: (typeof MACROS)[number]; value: number; goal: number; delay: number }) {
  const shown = useCountUp(value)
  const ratio = ratioOf(value, goal)
  return (
    <div className="relative h-8 min-w-0 overflow-hidden rounded-[10px] bg-app-text/[0.07]" role="meter" aria-label={macro.label}
      aria-valuenow={Math.round(value)} aria-valuemin={0} aria-valuemax={goal}>
      <div className={`app-bar absolute inset-0 ${FILL[macro.key].main} ${ratio >= 1 ? "" : "rounded-r-[5px]"}`}
        style={{ transform: `scaleX(${Math.min(ratio, 1)})`, animationDelay: `${delay}ms` }} />
      <p className="relative truncate px-1.5 text-[11px] leading-8 tracking-tight tabular-nums min-[400px]:text-xs sm:px-2.5 sm:text-[13px] sm:tracking-normal">
        <span className="text-xs font-semibold min-[400px]:text-[13px] sm:text-sm">{number(shown)}</span> / {number(goal)} {macro.short}
      </p>
    </div>
  )
}

export function DayBars({ totals, goals }: { totals: Totals; goals: Goals }) {
  const [calories, ...macros] = MACROS
  return (
    <div className="space-y-1.5">
      <CalorieBar value={totals[calories.key]} goal={goals[calories.key]} />
      <div className="grid grid-cols-3 gap-1.5">
        {macros.map((macro, index) =>
          <MacroBar key={macro.key} macro={macro} value={totals[macro.key]} goal={goals[macro.key]} delay={80 + index * 60} />)}
      </div>
    </div>
  )
}

/** The text colour of each macro's numbers. */
export const macroText = (key: MacroKey) =>
  ({ kcal: "text-app-kcal", proteinG: "text-app-protein", carbG: "text-app-carb", totalFatG: "text-app-fat" })[key]
