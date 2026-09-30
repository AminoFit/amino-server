"use client"

import { useEffect, useRef, useState, type ReactNode } from "react"

export type Series = { key: string; label: string; color: string }
export type Point = { x: string; values: Record<string, number | null> }

const PAD = { top: 8, right: 8, bottom: 22, left: 40 }

function useWidth() {
  const ref = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(0)
  useEffect(() => {
    const element = ref.current
    if (!element) return
    const observer = new ResizeObserver(entries => setWidth(entries[0].contentRect.width))
    observer.observe(element)
    return () => observer.disconnect()
  }, [])
  return [ref, width] as const
}

/** Round axis ticks: 0 plus three or four steps of 1, 2 or 5 × 10ⁿ. */
function ticks(max: number) {
  if (max <= 0) return [0, 1]
  const raw = max / 4, power = 10 ** Math.floor(Math.log10(raw))
  const step = [1, 2, 5, 10].map(m => m * power).find(s => s >= raw) ?? raw
  return Array.from({ length: Math.ceil(max / step) + 1 }, (_, i) => i * step)
}

function Legend({ series }: { series: Series[] }) {
  if (series.length < 2) return null
  return (
    <div className="mb-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-zinc-600 dark:text-zinc-300">
      {series.map(s => (
        <span key={s.key} className="flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: s.color }} />{s.label}
        </span>
      ))}
    </div>
  )
}

function Tooltip({ x, left, width, rows, format }: { x: string; left: number; width: number; rows: { s: Series; v: number | null }[]
  format: (v: number) => string }) {
  const flip = left > width * 0.6
  return (
    <div className="pointer-events-none absolute top-2 z-10 min-w-[9rem] rounded-md border border-zinc-200 bg-white px-2.5 py-2 text-xs shadow-lg dark:border-zinc-700 dark:bg-zinc-900"
      style={flip ? { right: width - left + 12 } : { left: left + 12 }}>
      <div className="mb-1 font-medium text-zinc-900 dark:text-zinc-100">{x}</div>
      {rows.map(({ s, v }) => (
        <div key={s.key} className="flex items-center justify-between gap-3 text-zinc-600 dark:text-zinc-300">
          <span className="flex items-center gap-1.5"><span className="inline-block h-2 w-2 rounded-sm" style={{ background: s.color }} />{s.label}</span>
          <span className="tabular-nums text-zinc-900 dark:text-zinc-100">{v == null ? "—" : format(v)}</span>
        </div>
      ))}
    </div>
  )
}

function Frame({ height, children, legend }: { height: number; children: (width: number) => ReactNode; legend: ReactNode }) {
  const [ref, width] = useWidth()
  return (
    <div>
      {legend}
      <div ref={ref} className="relative" style={{ height }}>{width > 0 && children(width)}</div>
    </div>
  )
}

function Axes({ width, height, yTicks, y, labels, x }: { width: number; height: number; yTicks: number[]; y: (v: number) => number
  labels: string[]; x: (i: number) => number }) {
  const every = Math.max(1, Math.ceil(labels.length / Math.max(1, Math.floor((width - PAD.left) / 64))))
  return (
    <g fontSize={10} fill="var(--chart-axis)">
      {yTicks.map(t => (
        <g key={t}>
          <line x1={PAD.left} x2={width - PAD.right} y1={y(t)} y2={y(t)} stroke="var(--chart-grid)" />
          <text x={PAD.left - 6} y={y(t)} dy="0.32em" textAnchor="end">{t >= 1000 ? `${t / 1000}k` : t}</text>
        </g>
      ))}
      {labels.map((label, i) => i % every === 0 && (
        <text key={i} x={x(i)} y={height - 6} textAnchor="middle">{label.slice(5)}</text>
      ))}
    </g>
  )
}

/** Stacked columns per x (e.g. meals per day by input type), with a per-column hover tooltip. */
// Charts are client components: the page passes a unit suffix, not a formatting function (functions cannot cross).
const formatter = (unit = "") => (v: number) => `${v.toLocaleString()}${unit}`

export function StackedBars({ data, series, height = 220, unit }: { data: Point[]; series: Series[]; height?: number; unit?: string }) {
  const format = formatter(unit)
  const [hover, setHover] = useState<number | null>(null)
  const totals = data.map(d => series.reduce((sum, s) => sum + (d.values[s.key] ?? 0), 0))
  const yTicks = ticks(Math.max(1, ...totals))
  return (
    <Frame height={height} legend={<Legend series={series} />}>
      {width => {
        const inner = width - PAD.left - PAD.right, band = inner / Math.max(1, data.length)
        const barWidth = Math.max(2, Math.min(28, band * 0.7))
        const y = (v: number) => PAD.top + (1 - v / yTicks[yTicks.length - 1]) * (height - PAD.top - PAD.bottom)
        const x = (i: number) => PAD.left + band * i + band / 2
        return (
          <>
            <svg width={width} height={height} onMouseLeave={() => setHover(null)} role="img" aria-label="Stacked bar chart">
              <Axes width={width} height={height} yTicks={yTicks} y={y} labels={data.map(d => d.x)} x={x} />
              {data.map((d, i) => {
                let base = 0
                return (
                  <g key={d.x} opacity={hover === null || hover === i ? 1 : 0.45}>
                    {series.map(s => {
                      const v = d.values[s.key] ?? 0
                      if (!v) return null
                      const top = y(base + v), bottom = y(base)
                      base += v
                      // A 2px surface gap between stacked segments.
                      return <rect key={s.key} x={x(i) - barWidth / 2} y={top} width={barWidth} height={Math.max(0, bottom - top - 2)}
                        rx={2} fill={s.color} />
                    })}
                    <rect x={x(i) - band / 2} y={PAD.top} width={band} height={height - PAD.top - PAD.bottom} fill="transparent"
                      onMouseEnter={() => setHover(i)} />
                  </g>
                )
              })}
            </svg>
            {hover !== null && data[hover] && (
              <Tooltip x={data[hover].x} left={x(hover)} width={width} format={format}
                rows={[...series.map(s => ({ s, v: data[hover].values[s.key] ?? 0 })).filter(r => r.v),
                  ...(series.length > 1 ? [{ s: { key: "total", label: "Total", color: "transparent" }, v: totals[hover] }] : [])]} />
            )}
          </>
        )
      }}
    </Frame>
  )
}

/** Lines over x with a crosshair tooltip; gaps where a value is missing. One y axis only. */
export function Lines({ data, series, height = 220, unit }: { data: Point[]; series: Series[]; height?: number; unit?: string }) {
  const format = formatter(unit)
  const [hover, setHover] = useState<number | null>(null)
  const max = Math.max(1, ...data.flatMap(d => series.map(s => d.values[s.key] ?? 0)))
  const yTicks = ticks(max)
  return (
    <Frame height={height} legend={<Legend series={series} />}>
      {width => {
        const inner = width - PAD.left - PAD.right
        const x = (i: number) => PAD.left + (data.length > 1 ? (inner * i) / (data.length - 1) : inner / 2)
        const y = (v: number) => PAD.top + (1 - v / yTicks[yTicks.length - 1]) * (height - PAD.top - PAD.bottom)
        const path = (s: Series) => {
          let d = "", pen = false
          data.forEach((p, i) => { const v = p.values[s.key]; if (v == null) { pen = false; return }
            d += `${pen ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`; pen = true })
          return d
        }
        const onMove = (event: React.MouseEvent<SVGSVGElement>) => {
          const left = event.clientX - event.currentTarget.getBoundingClientRect().left
          setHover(Math.max(0, Math.min(data.length - 1, Math.round(((left - PAD.left) / inner) * (data.length - 1)))))
        }
        return (
          <>
            <svg width={width} height={height} onMouseMove={onMove} onMouseLeave={() => setHover(null)} role="img" aria-label="Line chart">
              <Axes width={width} height={height} yTicks={yTicks} y={y} labels={data.map(d => d.x)} x={x} />
              {hover !== null && <line x1={x(hover)} x2={x(hover)} y1={PAD.top} y2={height - PAD.bottom} stroke="var(--chart-axis)" strokeDasharray="3 3" />}
              {series.map(s => <path key={s.key} d={path(s)} fill="none" stroke={s.color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />)}
              {/* A value with no neighbour draws no line segment, so it gets a marker. */}
              {series.map(s => data.map((p, i) => {
                const v = p.values[s.key]
                if (v == null || data[i - 1]?.values[s.key] != null || data[i + 1]?.values[s.key] != null) return null
                return <circle key={`${s.key}-${i}`} cx={x(i)} cy={y(v)} r={3} fill={s.color} />
              }))}
              {hover !== null && series.map(s => {
                const v = data[hover]?.values[s.key]
                return v == null ? null : <circle key={s.key} cx={x(hover)} cy={y(v)} r={4} fill={s.color} stroke="var(--chart-surface)" strokeWidth={2} />
              })}
            </svg>
            {hover !== null && data[hover] && (
              <Tooltip x={data[hover].x} left={x(hover)} width={width} format={format}
                rows={series.map(s => ({ s, v: data[hover].values[s.key] ?? null }))} />
            )}
          </>
        )
      }}
    </Frame>
  )
}
