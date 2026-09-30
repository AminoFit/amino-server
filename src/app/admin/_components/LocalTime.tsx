"use client"

import { useEffect, useState } from "react"

/** Server-rendered as "3h ago"; after hydration shows the viewer's local time too, with the user's own zone in the title. */
export function LocalTime({ iso, relative, zone }: { iso: string; relative: string; zone?: string }) {
  const [local, setLocal] = useState<string | null>(null)
  useEffect(() => {
    setLocal(new Date(iso).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }))
  }, [iso])
  const inUserZone = zone ? (() => {
    try { return new Date(iso).toLocaleString("en-GB", { timeZone: zone, weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) }
    catch { return null }
  })() : null
  return (
    <time dateTime={iso} title={`${iso}${inUserZone ? `\nUser's time (${zone}): ${inUserZone}` : ""}`} className="whitespace-nowrap tabular-nums">
      {local ?? relative}{local && <span className="text-zinc-400"> · {relative}</span>}
    </time>
  )
}
