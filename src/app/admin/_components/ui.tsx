import Link from "next/link"
import classNames from "classnames"
import type { ReactNode } from "react"
import { ago, utc } from "../_lib/format"
import { LocalTime } from "./LocalTime"

export function PageHeader({ title, subtitle, actions, crumbs }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode
  crumbs?: { href: string; label: string }[] }) {
  return (
    <header className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        {crumbs?.length ? (
          <nav className="mb-1 flex items-center gap-1 text-xs text-zinc-500 dark:text-zinc-400">
            {crumbs.map((crumb, index) => (
              <span key={crumb.href} className="flex items-center gap-1">
                {index > 0 && <span aria-hidden>/</span>}
                <Link href={crumb.href} className="hover:text-zinc-900 dark:hover:text-zinc-100">{crumb.label}</Link>
              </span>
            ))}
          </nav>
        ) : null}
        <h1 className="truncate text-xl font-semibold text-zinc-900 dark:text-zinc-50">{title}</h1>
        {subtitle && <div className="mt-0.5 text-sm text-zinc-500 dark:text-zinc-400">{subtitle}</div>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  )
}

export function Card({ title, actions, children, className, padded = true }: { title?: ReactNode; actions?: ReactNode
  children: ReactNode; className?: string; padded?: boolean }) {
  return (
    <section className={classNames("rounded-lg border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900", className)}>
      {(title || actions) && (
        <div className="flex items-center justify-between gap-2 border-b border-zinc-200 px-4 py-2.5 dark:border-zinc-800">
          <h2 className="text-sm font-semibold text-zinc-800 dark:text-zinc-100">{title}</h2>
          {actions && <div className="flex items-center gap-2 text-xs">{actions}</div>}
        </div>
      )}
      <div className={padded ? "p-4" : undefined}>{children}</div>
    </section>
  )
}

export function Stat({ label, value, hint, href, tone }: { label: string; value: ReactNode; hint?: ReactNode; href?: string
  tone?: "good" | "warn" | "bad" }) {
  const body = (
    <div className={classNames("h-full rounded-lg border bg-white px-4 py-3 dark:bg-zinc-900",
      tone === "bad" ? "border-red-300 dark:border-red-900" : tone === "warn" ? "border-amber-300 dark:border-amber-900" :
        "border-zinc-200 dark:border-zinc-800", href && "transition hover:border-zinc-400 dark:hover:border-zinc-600")}>
      <div className="text-xs font-medium text-zinc-500 dark:text-zinc-400">{label}</div>
      <div className="mt-1 text-2xl font-semibold tabular-nums text-zinc-900 dark:text-zinc-50">{value}</div>
      {hint && <div className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">{hint}</div>}
    </div>
  )
  return href ? <Link href={href} className="block">{body}</Link> : body
}

export const StatGrid = ({ children }: { children: ReactNode }) =>
  <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">{children}</div>

const TONES = {
  gray: "bg-zinc-100 text-zinc-700 ring-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:ring-zinc-700",
  green: "bg-emerald-50 text-emerald-800 ring-emerald-200 dark:bg-emerald-950 dark:text-emerald-300 dark:ring-emerald-900",
  red: "bg-red-50 text-red-800 ring-red-200 dark:bg-red-950 dark:text-red-300 dark:ring-red-900",
  amber: "bg-amber-50 text-amber-800 ring-amber-200 dark:bg-amber-950 dark:text-amber-300 dark:ring-amber-900",
  blue: "bg-sky-50 text-sky-800 ring-sky-200 dark:bg-sky-950 dark:text-sky-300 dark:ring-sky-900",
  violet: "bg-violet-50 text-violet-800 ring-violet-200 dark:bg-violet-950 dark:text-violet-300 dark:ring-violet-900"
} as const
export type Tone = keyof typeof TONES

export const Badge = ({ tone = "gray", children, title }: { tone?: Tone; children: ReactNode; title?: string }) =>
  <span title={title} className={classNames("inline-flex items-center whitespace-nowrap rounded px-1.5 py-0.5 text-[11px] font-medium ring-1 ring-inset", TONES[tone])}>{children}</span>

const STATE_TONES: Record<string, Tone> = { succeeded: "green", RESOLVED: "green", failed: "red", FAILED: "red",
  conflicted: "red", retry_wait: "amber", needs_clarification: "violet", running: "blue", PROCESSING: "blue",
  queued: "blue", RECEIVED: "blue", cancelled: "gray", superseded: "gray" }
const STATE_LABELS: Record<string, string> = { succeeded: "✓ succeeded", failed: "✕ failed", retry_wait: "↻ retrying",
  needs_clarification: "? clarification", running: "… running", queued: "… queued" }

export const StateBadge = ({ state }: { state: string | null | undefined }) =>
  state ? <Badge tone={STATE_TONES[state] ?? "gray"}>{STATE_LABELS[state] ?? state.toLowerCase()}</Badge> : <Badge>legacy</Badge>

/** The route that resolved a meal: a fast route, the barcode path, a structured edit or the agent's model. */
export function RouteBadge({ route }: { route: string | null | undefined }) {
  if (!route) return null
  const label = route.includes("/") ? `agent · ${route.split("/").pop()}` : route
  const tone: Tone = route === "text-fast-route" || route === "photo-fast-route" ? "green" : route === "barcode" ? "violet" :
    route.includes("/") ? "blue" : "gray"
  return <Badge tone={tone} title={route}>{label}</Badge>
}

export function Table({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={classNames("overflow-x-auto", className)}>
      <table className="min-w-full text-left text-sm">{children}</table>
    </div>
  )
}
export const Th = ({ children, className, right }: { children?: ReactNode; className?: string; right?: boolean }) =>
  <th className={classNames("whitespace-nowrap border-b border-zinc-200 px-3 py-2 text-xs font-medium text-zinc-500 dark:border-zinc-800 dark:text-zinc-400",
    right && "text-right", className)}>{children}</th>
export const Td = ({ children, className, right, mono }: { children?: ReactNode; className?: string; right?: boolean; mono?: boolean }) =>
  <td className={classNames("border-b border-zinc-100 px-3 py-2 align-top text-zinc-800 dark:border-zinc-800/60 dark:text-zinc-200",
    right && "text-right tabular-nums", mono && "font-mono text-xs", className)}>{children}</td>

export const Empty = ({ children }: { children: ReactNode }) =>
  <div className="px-4 py-10 text-center text-sm text-zinc-500 dark:text-zinc-400">{children}</div>

/** Collapsible JSON, closed by default. No client code: <details> does the toggling. */
export function Json({ value, label = "JSON", open = false }: { value: unknown; label?: ReactNode; open?: boolean }) {
  const text = typeof value === "string" ? value : JSON.stringify(value, null, 2)
  return (
    <details open={open} className="group rounded border border-zinc-200 dark:border-zinc-800">
      <summary className="cursor-pointer select-none px-2 py-1 text-xs font-medium text-zinc-600 hover:bg-zinc-50 dark:text-zinc-300 dark:hover:bg-zinc-800">
        {label} <span className="text-zinc-400">({(text ?? "").length.toLocaleString()} chars)</span>
      </summary>
      <pre className="max-h-[32rem] overflow-auto whitespace-pre-wrap break-words border-t border-zinc-200 bg-zinc-50 p-2 font-mono text-[11px] leading-relaxed text-zinc-800 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-200">{text}</pre>
    </details>
  )
}

export function KeyValues({ rows }: { rows: [ReactNode, ReactNode][] }) {
  return (
    <dl className="grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1.5 text-sm">
      {rows.map(([key, value], index) => (
        <div key={index} className="contents">
          <dt className="text-zinc-500 dark:text-zinc-400">{key}</dt>
          <dd className="min-w-0 break-words text-zinc-900 dark:text-zinc-100">{value ?? "—"}</dd>
        </div>
      ))}
    </dl>
  )
}

/** An instant: relative on the server, then the viewer's local time on hover and in the title. */
export const When = ({ value, zone }: { value: string | null | undefined; zone?: string }) =>
  value ? <LocalTime iso={utc(value)!.toISOString()} relative={ago(value)} zone={zone} /> : <span className="text-zinc-400">—</span>

export const TextLink = ({ href, children, className }: { href: string; children: ReactNode; className?: string }) =>
  <Link href={href} className={classNames("text-sky-700 hover:underline dark:text-sky-400", className)}>{children}</Link>

/** Numbered pages: the first two, a window around the current page and the last two, with gaps between
 * ("1 2 … 7 8 9 … 67 68"), plus previous and next and the range shown. */
export function Pager({ page, perPage, total, href }: { page: number; perPage: number; total: number; href: (page: number) => string }) {
  const last = Math.max(1, Math.ceil(total / perPage))
  const wanted = new Set([1, 2, last - 1, last, page - 2, page - 1, page, page + 1, page + 2].filter(n => n >= 1 && n <= last))
  const numbers = [...wanted].sort((a, b) => a - b)
  const cell = "inline-flex h-8 min-w-8 items-center justify-center rounded px-2 text-sm tabular-nums"
  const from = total ? (page - 1) * perPage + 1 : 0, to = Math.min(total, page * perPage)
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-sm text-zinc-500 dark:text-zinc-400">
      <span className="tabular-nums">{from.toLocaleString()}–{to.toLocaleString()} of {total.toLocaleString()}</span>
      {last > 1 && (
        <nav className="flex flex-wrap items-center gap-1" aria-label="Pages">
          {page > 1 ? <Link className={classNames(cell, "hover:bg-zinc-100 dark:hover:bg-zinc-800")} href={href(page - 1)} aria-label="Previous page">←</Link> :
            <span className={classNames(cell, "opacity-30")}>←</span>}
          {numbers.map((n, i) => (
            <span key={n} className="flex items-center gap-1">
              {i > 0 && n - numbers[i - 1] > 1 && <span className="px-1 text-zinc-400">…</span>}
              {n === page ? <span aria-current="page" className={classNames(cell, "bg-zinc-900 font-medium text-white dark:bg-zinc-100 dark:text-zinc-900")}>{n}</span> :
                <Link className={classNames(cell, "hover:bg-zinc-100 dark:hover:bg-zinc-800")} href={href(n)}>{n}</Link>}
            </span>
          ))}
          {page < last ? <Link className={classNames(cell, "hover:bg-zinc-100 dark:hover:bg-zinc-800")} href={href(page + 1)} aria-label="Next page">→</Link> :
            <span className={classNames(cell, "opacity-30")}>→</span>}
        </nav>
      )}
    </div>
  )
}

/** A column header that sorts the list (largest first) through the URL; the active sort shows an arrow. */
export function SortTh({ label, sort, current, href, right }: { label: string; sort: string; current: string | undefined
  href: (sort: string) => string; right?: boolean }) {
  const active = current === sort
  return (
    <Th right={right}>
      <Link href={href(sort)} className={classNames("inline-flex items-center gap-0.5 hover:text-zinc-900 dark:hover:text-zinc-100",
        active && "font-semibold text-zinc-900 dark:text-zinc-100")}>
        {label}{active ? " ↓" : ""}
      </Link>
    </Th>
  )
}

// Filter bars are plain GET forms: every filter lives in the URL, so a view can be shared or reopened.
export const FilterForm = ({ children, action }: { children: ReactNode; action: string }) =>
  <form action={action} method="get" className="mb-4 flex flex-wrap items-end gap-2">{children}
    <button type="submit" className="h-8 rounded bg-zinc-900 px-3 text-sm font-medium text-white hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300">Apply</button>
    <a href={action} className="h-8 rounded px-2 text-sm leading-8 text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100">Reset</a>
  </form>

const field = "h-8 rounded border border-zinc-300 bg-white px-2 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
export const Field = ({ label, children }: { label: string; children: ReactNode }) =>
  <label className="flex flex-col gap-1 text-xs font-medium text-zinc-500 dark:text-zinc-400">{label}{children}</label>
export const Input = ({ name, value, placeholder, type = "text", className }: { name: string; value?: string; placeholder?: string
  type?: string; className?: string }) =>
  <input name={name} defaultValue={value} placeholder={placeholder} type={type} className={classNames(field, className)} />
export const Select = ({ name, value, options }: { name: string; value?: string; options: [string, string][] }) =>
  <select name={name} defaultValue={value ?? ""} className={field}>
    {options.map(([v, label]) => <option key={v} value={v}>{label}</option>)}
  </select>

/** A food's icon, or a neutral placeholder. */
export const FoodIcon = ({ src, size = 28 }: { src: string | null | undefined; size?: number }) =>
  src ? <img src={src} alt="" width={size} height={size} loading="lazy" className="shrink-0 rounded bg-zinc-100 object-contain dark:bg-zinc-800" style={{ width: size, height: size }} /> :
    <span className="inline-block shrink-0 rounded bg-zinc-100 dark:bg-zinc-800" style={{ width: size, height: size }} />

export function Macros({ kcal, protein, carbs, fat, grams }: { kcal: number | null | undefined; protein?: number | null
  carbs?: number | null; fat?: number | null; grams?: number | null }) {
  const n = (v: number | null | undefined) => (v == null ? "—" : Math.round(v))
  return (
    <span className="whitespace-nowrap tabular-nums text-zinc-600 dark:text-zinc-300">
      <b className="font-semibold text-zinc-900 dark:text-zinc-100">{n(kcal)}</b> kcal
      {protein !== undefined && <> · P {n(protein)} · C {n(carbs)} · F {n(fat)}</>}
      {grams != null && <span className="text-zinc-400"> / {Math.round(grams)} g</span>}
    </span>
  )
}
