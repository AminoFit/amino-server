import { CameraIcon, ChatBubbleBottomCenterTextIcon, ExclamationTriangleIcon, MicrophoneIcon } from "@heroicons/react/20/solid"
import type { FoodRow, Meal } from "../_lib/types"
import { MACROS, clock, number, serving, sumItems, titleCase } from "../_lib/stats"
import { macroText } from "./GoalBars"

// A meal as the app's log shows it: a header with the time and what was typed or said, then its foods joined by a
// line, each with its icon, serving and macros.

const INPUT = {
  photo: { Icon: CameraIcon, label: "Photo" },
  voice: { Icon: MicrophoneIcon, label: "Voice" },
  text: { Icon: ChatBubbleBottomCenterTextIcon, label: "Typed" }
}

function MacroCells({ item }: { item: FoodRow }) {
  return (
    <div className="mt-2 inline-flex overflow-hidden rounded-lg border border-app-text/15 text-xs">
      {MACROS.map(({ key, short }) => (
        <span key={key} className={`flex items-baseline gap-1 border-l border-app-text/15 px-2 py-1 first:border-l-0 ${item[key] ? "" : "opacity-40"}`}>
          <span className={`font-semibold tabular-nums ${item[key] ? macroText(key) : ""}`}>{number(item[key])}</span>
          <span className="text-app-muted">{short}</span>
        </span>
      ))}
    </div>
  )
}

function Food({ item, last }: { item: FoodRow; last: boolean }) {
  return (
    <li className="flex gap-3.5 py-2.5">
      <div className="flex flex-col items-center">
        <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-app-text/[0.06]">
          {item.icon
            ? <img src={item.icon} alt="" width={36} height={36} loading="lazy" decoding="async" className="h-9 w-9 object-contain" />
            : <span className="text-base font-semibold text-app-muted">{item.name?.[0]?.toUpperCase() ?? "?"}</span>}
        </div>
        {!last && <div className="-mb-2.5 mt-1 w-px flex-1 bg-app-text/15" />}
      </div>
      <div className="min-w-0 flex-1 pt-0.5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            {item.brand && <p className="truncate text-xs text-app-muted">{item.brand}</p>}
            <p className="line-clamp-2 text-[15px] font-medium leading-snug">{titleCase(item.name ?? "Unknown food")}</p>
          </div>
          <p className="shrink-0 pt-0.5 text-right text-xs text-app-muted">{serving(item)}</p>
        </div>
        <MacroCells item={item} />
      </div>
    </li>
  )
}

export function MealCard({ meal, style, className = "" }: { meal: Meal; style?: React.CSSProperties; className?: string }) {
  const { Icon, label } = INPUT[meal.input]
  const kcal = sumItems(meal.items).kcal
  const title = meal.text ?? (meal.input === "photo" ? "Photo food log" : "Logged manually")
  return (
    <article style={style} className={`overflow-hidden rounded-3xl border border-app-border/70 bg-app-card shadow-sm shadow-black/[0.03] ${className}`}>
      <header className="flex items-center gap-3 border-b border-app-border/60 bg-app-text/[0.025] px-4 py-3">
        <span className="rounded-full bg-app-text/10 px-2.5 py-1 text-xs font-medium tabular-nums">{clock(meal.time)}</span>
        <Icon className="h-4 w-4 shrink-0 text-app-muted" aria-label={label} />
        <p className={`min-w-0 flex-1 truncate text-sm ${meal.text ? "text-app-text/80" : "text-app-muted"}`} title={meal.text}>{title}</p>
        {meal.photos?.map(url => (
          <a key={url} href={url} target="_blank" rel="noreferrer" className="shrink-0 overflow-hidden rounded-lg ring-1 ring-app-border transition hover:ring-app-link">
            <img src={url} alt="Meal photo" loading="lazy" decoding="async" className="h-9 w-9 object-cover" />
          </a>
        ))}
        {meal.items.length > 0 &&
          <span className="shrink-0 text-sm font-semibold tabular-nums">{number(kcal)}<span className="ml-1 font-normal text-app-muted">kcal</span></span>}
      </header>
      {meal.status === "processing" && meal.items.length === 0 ? (
        <div className="space-y-2.5 px-4 py-4" aria-label="Working out what's in this meal">
          <div className="app-shimmer h-11 rounded-xl" />
          <p className="text-xs text-app-muted">Working out what&apos;s in this meal…</p>
        </div>
      ) : meal.items.length === 0 ? (
        <p className="flex items-center gap-2 px-4 py-4 text-sm text-app-muted">
          <ExclamationTriangleIcon className="h-4 w-4" aria-hidden /> No foods were found in this one.
        </p>
      ) : (
        <ul className="px-4 py-1.5">
          {meal.items.map((item, index) => <Food key={item.id} item={item} last={index === meal.items.length - 1} />)}
        </ul>
      )}
    </article>
  )
}
