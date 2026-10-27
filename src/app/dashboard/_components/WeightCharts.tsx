"use client"

import { useEffect, useRef, useState } from "react"
import { format, daysBetween } from "../_lib/dates"
import { number } from "../_lib/stats"
import { inUnit, niceTicks, runs, shownWeight, smoothPath, weightUnit, type ShownPoint, type UnitPreference, type WeightDay }
  from "../_lib/weight"

// The weight and expenditure charts, drawn as the app's are (amino-mobile screens/Progress/components/Weight.tsx
// WeightChart and ExpenditureChart.tsx): axis values in a gutter on the right, dashed grid lines, the newest point marked.
// Hovering (or dragging a finger along) reads a day's values above the chart.

/** Room on the right for the axis values. */
const WEIGHT_GUTTER = 34
const EXPENDITURE_GUTTER = 40
const LABELS = 18

/** The chart's width, measured: text stays its own size whatever the card's width. */
function useWidth() {
  const ref = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(0)
  useEffect(() => {
    const element = ref.current
    if (!element) return
    const observer = new ResizeObserver(([entry]) => setWidth(Math.round(entry.contentRect.width)))
    observer.observe(element)
    return () => observer.disconnect()
  }, [])
  return [ref, width] as const
}

/** The day nearest the pointer, read out above the chart with a line down to it. */
function useScrub(count: number, xOf: (index: number) => number) {
  const [index, setIndex] = useState<number | null>(null)
  const onPointerMove = (event: React.PointerEvent<SVGSVGElement>) => {
    if (!count) return
    const x = event.clientX - event.currentTarget.getBoundingClientRect().left
    let best = 0
    for (let i = 1; i < count; i++) if (Math.abs(xOf(i) - x) < Math.abs(xOf(best) - x)) best = i
    setIndex(best)
  }
  return { index, handlers: { onPointerMove, onPointerDown: onPointerMove, onPointerLeave: () => setIndex(null) } }
}

function Readout({ text }: { text: string | null }) {
  return (
    <p className={`h-5 truncate text-xs tabular-nums text-app-muted transition-opacity duration-150 ${text ? "opacity-100" : "opacity-0"}`}
      aria-live="polite">{text ?? " "}</p>
  )
}

const shortDay = (day: string) => format(day, { month: "short", day: "numeric" })

/** Weigh-ins as dots and the trend as a line, in the user's units. The goal is a dashed line when it falls inside the
 * chart's range (it never stretches the chart); outside it, a label at the edge it lies beyond. */
export function WeightChart({ days, unit, goalKg, height = 180 }: { days: readonly WeightDay[]; unit: UnitPreference
  goalKg: number | null; height?: number }) {
  const [ref, width] = useWidth()
  const shown = (kg: number) => inUnit(kg, unit)
  const values = days.flatMap(day => day.weightKg == null ? [shown(day.trendKg)] : [shown(day.trendKg), shown(day.weightKg)])
  const min = Math.min(...values), max = Math.max(...values)
  // At least a 1-unit span, so a flat trend doesn't fill the chart with noise.
  const pad = Math.max((max - min) * 0.15, 0.5), low = min - pad, high = max + pad
  const inset = 4, plot = width - WEIGHT_GUTTER
  const x = (index: number) => days.length < 2 ? plot / 2 : inset + index * (plot - 2 * inset) / (days.length - 1)
  const y = (value: number) => inset + (high - value) * (height - 2 * inset) / (high - low)
  const ticks = niceTicks(low, high)
  const decimals = ticks.some(tick => !Number.isInteger(tick)) ? 1 : 0
  const goal = goalKg != null ? shown(goalKg) : null
  const goalInRange = goal != null && goal >= low && goal <= high
  const last = days.length - 1
  const { index, handlers } = useScrub(days.length, x)
  const hovered = index != null ? days[index] : null
  return (
    <div>
      <Readout text={hovered ? `${shortDay(hovered.day)} · ${shownWeight(hovered.trendKg, unit)} ${weightUnit(unit)}${
        hovered.weightKg != null ? ` · weighed ${shownWeight(hovered.weightKg, unit)}` : ""}` : null} />
      <div ref={ref} className="relative" style={{ height }}>
        {goal != null && !goalInRange && (
          <span className={`absolute left-0 rounded bg-app-card px-1 text-[11px] tabular-nums text-app-primary ${goal > high ? "-top-1" : "-bottom-1"}`}>
            Goal {shownWeight(goalKg!, unit)} {weightUnit(unit)} {goal > high ? "↑" : "↓"}
          </span>
        )}
        {width > 0 && days.length > 0 && (
          <svg width={width} height={height} className="block touch-pan-y" role="img"
            aria-label={`Weight trend from ${shownWeight(days[0].trendKg, unit)} to ${shownWeight(days[last].trendKg, unit)} ${weightUnit(unit)}`}
            {...handlers}>
            {ticks.map(tick => (
              <g key={tick}>
                <line x1={0} x2={plot} y1={y(tick)} y2={y(tick)} className="stroke-app-border" strokeDasharray="3 4" />
                <text x={width} y={y(tick) + 4} textAnchor="end" fontSize={11} className="fill-app-muted">{number(tick, decimals)}</text>
              </g>
            ))}
            {days.map((day, i) => day.weightKg == null ? null : (
              <circle key={day.day} cx={x(i)} cy={y(shown(day.weightKg))} r={2.5} className="fill-app-muted" opacity={0.6} />
            ))}
            {goalInRange && <line x1={0} x2={plot} y1={y(goal!)} y2={y(goal!)} className="stroke-app-primary" strokeWidth={1.5} strokeDasharray="6 4" />}
            <path d={smoothPath(days.map((day, i) => ({ x: x(i), y: y(shown(day.trendKg)) })))} className="stroke-app-link" strokeWidth={2}
              fill="none" strokeLinejoin="round" strokeLinecap="round" />
            {index != null && <line x1={x(index)} x2={x(index)} y1={0} y2={height} className="stroke-app-text/30" />}
            <circle cx={x(index ?? last)} cy={y(shown(days[index ?? last].trendKg))} r={5} className="fill-app-card stroke-app-link" strokeWidth={2} />
          </svg>
        )}
      </div>
    </div>
  )
}

/** The estimate as a line in the text colour (blue stays "what you ate"), its likely range as a soft band around it.
 * Days are placed by date, so a stretch without an estimate is a gap, not a line drawn across it. */
export function ExpenditureChart({ points, from, to, height = 200 }: { points: readonly ShownPoint[]; from: string; to: string
  height?: number }) {
  const [ref, width] = useWidth()
  const inset = 6, plot = width - EXPENDITURE_GUTTER
  const span = Math.max(1, daysBetween(from, to))
  const x = (day: string) => inset + daysBetween(from, day) * (plot - 2 * inset) / span
  const values = points.flatMap(point => [point.kcal - point.plusMinus, point.kcal + point.plusMinus])
  const min = Math.min(...values), max = Math.max(...values)
  // At least 200 kcal tall, so a steady estimate doesn't fill the chart with its wobble.
  const pad = Math.max((max - min) * 0.1, (200 - (max - min)) / 2, 20), low = min - pad, high = max + pad
  const y = (value: number) => inset + (high - value) * (height - LABELS - 2 * inset) / (high - low)
  const ticks = points.length ? niceTicks(low, high) : []
  const labels = [0, 1, 2, 3].map(i => {
    const back = Math.round(i * span / 4)
    const date = new Date(`${to}T00:00:00Z`)
    date.setUTCDate(date.getUTCDate() - back)
    return date.toISOString().slice(0, 10)
  }).reverse()
  const { index, handlers } = useScrub(points.length, i => x(points[i].day))
  const hovered = index != null ? points[index] : null
  const last = points[points.length - 1]
  const round10 = (kcal: number) => number(Math.round(kcal / 10) * 10)
  return (
    <div>
      <Readout text={hovered ? `${shortDay(hovered.day)} · ${round10(hovered.kcal)} ± ${round10(hovered.plusMinus)} kcal` : null} />
      <div ref={ref} style={{ height }}>
        {width > 0 && points.length > 0 && (
          <svg width={width} height={height} className="block touch-pan-y" role="img"
            aria-label={`Expenditure estimates from ${shortDay(points[0].day)} to ${shortDay(last.day)}`} {...handlers}>
            {ticks.map(tick => (
              <g key={tick}>
                <line x1={0} x2={plot} y1={y(tick)} y2={y(tick)} className="stroke-app-border" strokeDasharray="3 4" />
                <text x={width} y={y(tick) + 4} textAnchor="end" fontSize={11} className="fill-app-muted">{number(tick)}</text>
              </g>
            ))}
            {runs(points).map(run => {
              const upper = run.map(point => ({ x: x(point.day), y: y(point.kcal + point.plusMinus) }))
              const lower = run.map(point => ({ x: x(point.day), y: y(point.kcal - point.plusMinus) })).reverse()
              // The band: along the top edge, then back along the bottom one.
              const band = run.length > 1
                ? `${smoothPath(upper)} L${lower[0].x.toFixed(1)} ${lower[0].y.toFixed(1)} ${smoothPath(lower).replace(/^M[^C]*/, "")} Z` : null
              return (
                <g key={run[0].day}>
                  {band && <path d={band} className="fill-app-text/[0.12]" />}
                  {run.length > 1
                    ? <path d={smoothPath(run.map(point => ({ x: x(point.day), y: y(point.kcal) })))} className="stroke-app-text" strokeWidth={2}
                        fill="none" strokeLinecap="round" />
                    : <circle cx={x(run[0].day)} cy={y(run[0].kcal)} r={2.5} className="fill-app-text" />}
                </g>
              )
            })}
            {hovered && <line x1={x(hovered.day)} x2={x(hovered.day)} y1={0} y2={height - LABELS} className="stroke-app-text/30" />}
            <circle cx={x((hovered ?? last).day)} cy={y((hovered ?? last).kcal)} r={5} className="fill-app-card stroke-app-text" strokeWidth={2} />
            {labels.map(day => (
              <text key={day} x={Math.min(Math.max(x(day), 20), plot - 20)} y={height - 3} textAnchor="middle" fontSize={11}
                className="fill-app-muted">{shortDay(day)}</text>
            ))}
          </svg>
        )}
      </div>
    </div>
  )
}
