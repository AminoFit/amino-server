"use client"

import { useId, useState } from "react"
import { ChevronDownIcon, ExclamationTriangleIcon, FireIcon } from "@heroicons/react/20/solid"
import type { FoodRow, Meal } from "../_lib/types"
import { MACROS, amountText, clock, number, sumItems, titleCase, type MacroKey } from "../_lib/stats"
import { biggestFoods, mealTitle, mealWords, pendingTitle } from "../_lib/meal"
import { macroText } from "./DayBars"

// A meal as the app's log shows it (amino-mobile components/FoodLog/MealCard.tsx and FoodItemRow.tsx MealFoodRowBody),
// on one grid for meals and foods: the card's padding, the icon column and the gap after it, so names, time chips and
// pills line up down the log. A meal of several foods is a header (a plate of its biggest foods, a title from them, the
// time, the user's words, its totals) that opens to its foods; a meal of one food is just its row. Who logged a meal
// (an agent, someone linked) isn't shown yet: web_day doesn't return it.

/** The log's grid: 12 px padding, a 46 px icon column, a 12 px gap. */
const ROW = "flex gap-3 px-3 py-2.5"
const ICON_BOX = "grid h-[46px] w-[46px] shrink-0 place-items-center rounded-[10px] bg-app-text/10"
const PLATE_ICONS = 4
/** Opening and closing: quick and flat, no spring (the app's MEAL_OPEN_TIMING). */
const OPEN_EASE = "duration-[260ms] ease-[cubic-bezier(0.2,0,0,1)]"

/** Calories and macros in MACROS order, each segment an equal share of the width; words when there's room ("30 Pro"),
 * else letters ("30P"). */
function MacroPill({ totals }: { totals: Record<MacroKey, number> }) {
  return (
    <div className="mt-0.5 flex w-full text-[13px] leading-[18px]"
      aria-label={MACROS.map(({ key, label }) => key === "kcal" ? `${Math.round(totals.kcal)} calories`
        : `${Math.round(totals[key])} grams ${label.toLowerCase()}`).join(", ")}>
      {MACROS.map(({ key, short }) => {
        const value = Math.round(totals[key])
        const color = value === 0 ? "text-app-text/30" : macroText(key)
        return (
          <span key={key} aria-hidden
            className={`flex flex-1 items-center justify-center gap-px border border-app-text/20 py-[3px] tabular-nums first:rounded-l-[10px] last:rounded-r-[10px] [&+&]:border-l-0 ${color}`}>
            <span className="text-sm">{number(value)}</span>
            {key === "kcal" ? <FireIcon className="h-3 w-3" />
              : <span className="text-xs"><span className="min-[400px]:hidden">{short[0]}</span><span className="hidden min-[400px]:inline">&nbsp;{short}</span></span>}
          </span>
        )
      })}
    </div>
  )
}

function TimeChip({ time }: { time: string }) {
  return <span className="shrink-0 rounded-[10px] bg-app-text/10 px-1.5 py-0.5 text-xs tabular-nums text-app-text/80">{clock(time)}</span>
}

/** The meal's photos, small, each opening full size. */
function Photos({ meal }: { meal: Meal }) {
  if (!meal.photos?.length) return null
  return (
    <span className="relative z-10 ml-auto flex shrink-0 gap-1">
      {meal.photos.map(url => (
        <a key={url} href={url} target="_blank" rel="noreferrer" title="Open the photo"
          className="overflow-hidden rounded-md ring-1 ring-app-border transition hover:ring-app-link">
          <img src={url} alt="Meal photo" loading="lazy" decoding="async" className="h-6 w-6 object-cover" />
        </a>
      ))}
    </span>
  )
}

function FoodIcon({ item, size }: { item: FoodRow; size: number }) {
  if (item.icon) return <img src={item.icon} alt="" width={size} height={size} loading="lazy" decoding="async" className="object-contain"
    style={{ width: size, height: size }} />
  return size > 24 ? <span className="text-base font-semibold text-app-muted">{item.name?.[0]?.toUpperCase() ?? "?"}</span> : null
}

/** A food's row: the icon, the name (with a one-food meal's time chip at the top right), the brand and amount, and
 * the pill. Inside an open meal it sits a shade deeper than the meal's card. */
function FoodRowBody({ item, meal, inset = false }: { item: FoodRow; meal?: Meal; inset?: boolean }) {
  const details = [item.brand ? titleCase(item.brand) : null, amountText(item)].filter(Boolean).join(" · ")
  return (
    <div className={`${ROW} ${inset ? "border-t border-app-text/10 bg-black/[0.07]" : ""}`}>
      <div className={ICON_BOX}><FoodIcon item={item} size={38} /></div>
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex items-start gap-2">
          <p className="line-clamp-2 min-w-0 flex-1 text-[15px] font-medium leading-snug">{titleCase(item.name ?? "Unknown food")}</p>
          {meal && <TimeChip time={meal.time} />}
        </div>
        {(details || !!meal?.photos?.length) && (
          <div className="flex min-h-5 items-center gap-1.5 text-[13px] text-app-muted">
            <span className="truncate">{details}</span>
            {meal && <Photos meal={meal} />}
          </div>
        )}
        <MacroPill totals={item} />
      </div>
    </div>
  )
}

/** A meal without foods yet: still being worked out, or one that found none. */
function PendingMeal({ meal }: { meal: Meal }) {
  const processing = meal.status === "processing"
  const said = mealWords(meal)
  return (
    <div className={ROW}>
      <div className={processing ? `${ICON_BOX} app-shimmer` : ICON_BOX}>
        {!processing && <ExclamationTriangleIcon className="h-5 w-5 text-app-muted" aria-hidden />}
      </div>
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex items-start gap-2">
          <p className="min-w-0 flex-1 truncate text-[15px] font-medium leading-snug">
            {said ?? pendingTitle(meal)}
          </p>
          <TimeChip time={meal.time} />
        </div>
        <div className="flex min-h-5 items-center gap-1.5 text-[13px] text-app-muted">
          <span>{processing ? "Working out what's in this meal…" : "No foods were found in this one."}</span>
          <Photos meal={meal} />
        </div>
      </div>
    </div>
  )
}

function OpenableMeal({ meal, startsOpen }: { meal: Meal; startsOpen: boolean }) {
  const [open, setOpen] = useState(startsOpen)
  const rowsId = useId()
  const title = mealTitle(meal.items)
  // Unquoted: without who logged it, an agent's note can't be told from the user's own words.
  const said = mealWords(meal)
  const count = `${meal.items.length} foods`
  return (
    <>
      <div className={`relative ${ROW}`}>
        {/* The whole header opens the meal; the photos above it stay their own links. */}
        <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} aria-controls={rowsId}
          aria-label={`${title}, ${count}, ${clock(meal.time)}`}
          className="absolute inset-0 rounded-t-2xl transition-colors hover:bg-app-text/[0.03] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-app-link" />
        <div className="pointer-events-none flex h-[46px] w-[46px] shrink-0 flex-wrap content-start gap-[2px] rounded-[10px] bg-app-text/10 p-[3px]" aria-hidden>
          {biggestFoods(meal.items, PLATE_ICONS).map(item => (
            <span key={item.id} className="grid h-[19px] w-[19px] place-items-center"><FoodIcon item={item} size={19} /></span>
          ))}
        </div>
        <div className="pointer-events-none min-w-0 flex-1 space-y-1">
          <div className="flex items-start gap-2">
            <p className="line-clamp-2 min-w-0 flex-1 text-[15px] font-semibold leading-snug">{title}</p>
            <TimeChip time={meal.time} />
          </div>
          <div className="flex min-h-5 items-center gap-1 text-[13px]">
            <span className="shrink-0 text-app-text/80">{count}</span>
            <ChevronDownIcon className={`h-3.5 w-3.5 shrink-0 text-app-text/80 transition-transform ${OPEN_EASE} ${open ? "rotate-180" : ""}`} aria-hidden />
            {said && <>
              <span className="text-app-muted/70">·</span>
              <span className="truncate text-app-muted">{said}</span>
            </>}
            <span className="pointer-events-auto ml-auto flex"><Photos meal={meal} /></span>
          </div>
          <MacroPill totals={sumItems(meal.items)} />
        </div>
      </div>
      {/* Its foods, as tall as they are open; each row fades and slides in a beat after the one above it. */}
      <div id={rowsId} className={`grid transition-[grid-template-rows] ${OPEN_EASE} ${open ? "grid-rows-[1fr]" : "grid-rows-[0fr]"}`}
        aria-hidden={!open}>
        <div className="min-h-0 overflow-hidden">
          {meal.items.map((item, index) => (
            <div key={item.id} className={`transition ${OPEN_EASE} ${open ? "translate-y-0 opacity-100" : "-translate-y-2 opacity-0"}`}
              style={{ transitionDelay: open ? `${Math.min(index * 21, 104)}ms` : "0ms" }}>
              <FoodRowBody item={item} inset />
            </div>
          ))}
        </div>
      </div>
    </>
  )
}

export function MealCard({ meal, startsOpen = false, style, className = "" }: { meal: Meal; startsOpen?: boolean
  style?: React.CSSProperties; className?: string }) {
  return (
    <article style={style} className={`overflow-hidden rounded-2xl border border-app-border/70 bg-app-card shadow-sm shadow-black/[0.03] ${className}`}>
      {meal.items.length === 0 ? <PendingMeal meal={meal} />
        : meal.items.length === 1 ? <FoodRowBody item={meal.items[0]} meal={meal} />
        : <OpenableMeal meal={meal} startsOpen={startsOpen} />}
    </article>
  )
}
