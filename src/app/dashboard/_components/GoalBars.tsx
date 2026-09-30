"use client"

import type { Goals } from "../_lib/types"
import { MACROS, number, type MacroKey, type Totals } from "../_lib/stats"
import { useCountUp } from "./useCountUp"

// The day's four goal bars, as on the app's main screen: calories, carbs, protein and fat. The fill runs to the goal;
// the short segment on the right fills with anything up to 25% over it and shows the goal.

const FILL: Record<MacroKey, { main: string; over: string; text: string }> = {
  kcal: { main: "bg-app-kcal/45", over: "bg-[#1F7EA0]/70", text: "text-app-kcal" },
  carbG: { main: "bg-app-carb/45", over: "bg-[#CC7A2E]/70", text: "text-app-carb" },
  proteinG: { main: "bg-app-protein/45", over: "bg-[#B8284B]/70", text: "text-app-protein" },
  totalFatG: { main: "bg-app-fat/45", over: "bg-[#8A1FBF]/70", text: "text-app-fat" }
}

function GoalBar({ macro, value, goal, delay }: { macro: (typeof MACROS)[number]; value: number; goal: number; delay: number }) {
  const shown = useCountUp(value)
  const progress = goal ? value / goal : 0
  const over = Math.min(Math.max(progress - 1, 0) / 0.25, 1)
  const fill = FILL[macro.key]
  return (
    <div className="flex h-8 gap-[3px] sm:h-11" role="meter" aria-label={macro.label} aria-valuenow={Math.round(value)}
      aria-valuemin={0} aria-valuemax={goal}>
      <div className="relative flex-[4] overflow-hidden rounded-l-xl rounded-r-md bg-app-text/[0.06] sm:rounded-l-2xl">
        <div className={`app-bar absolute inset-0 ${fill.main}`} style={{ transform: `scaleX(${Math.min(progress, 1)})`,
          animationDelay: `${delay}ms` }} />
        <div className="relative flex h-full items-center justify-between gap-2 px-3 sm:px-3.5">
          <span className="flex items-baseline gap-2 truncate">
            <span className="text-xs text-app-muted sm:text-[13px]">{macro.label}</span>
            <span className="text-[15px] font-semibold tabular-nums sm:text-[17px]">{number(shown)}</span>
            <span className="text-xs text-app-muted sm:text-[13px]">{macro.unit}</span>
          </span>
          <span className={`text-xs font-semibold tabular-nums transition-opacity sm:text-sm duration-300 ${progress > 0 ? "opacity-100" : "opacity-0"}`}>
            {Math.round(progress * 100)}%
          </span>
        </div>
      </div>
      <div className="relative flex-1 overflow-hidden rounded-l-md rounded-r-xl bg-app-text/[0.06] sm:rounded-r-2xl">
        <div className={`app-bar absolute inset-0 ${fill.over}`} style={{ transform: `scaleX(${over})`,
          animationDelay: `${delay + 350}ms` }} />
        <div className="relative flex h-full flex-col items-center justify-center leading-tight">
          <span className="text-[11px] font-semibold tabular-nums sm:text-xs">{number(goal)}</span>
          <span className="hidden text-[10px] uppercase tracking-wide text-app-muted sm:block">goal</span>
        </div>
      </div>
    </div>
  )
}

export function GoalBars({ totals, goals }: { totals: Totals; goals: Goals }) {
  return (
    <div className="space-y-1 sm:space-y-1.5">
      {MACROS.map((macro, index) =>
        <GoalBar key={macro.key} macro={macro} value={totals[macro.key]} goal={goals[macro.key]} delay={index * 60} />)}
    </div>
  )
}

export const macroText = (key: MacroKey) => FILL[key].text
