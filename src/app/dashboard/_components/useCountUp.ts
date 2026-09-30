"use client"

import { useEffect, useRef, useState } from "react"

const reducedMotion = () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches

/** A number that eases to its new value (from 0 on first show), in step with the bars' fill. */
export function useCountUp(target: number, duration = 650) {
  const [value, setValue] = useState(0)
  const from = useRef(0)
  useEffect(() => {
    if (reducedMotion()) { from.current = target; setValue(target); return }
    const start = performance.now(), origin = from.current
    let frame = 0
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / duration)
      const current = origin + (target - origin) * (1 - Math.pow(1 - t, 3))
      from.current = current
      setValue(current)
      if (t < 1) frame = requestAnimationFrame(step)
    }
    frame = requestAnimationFrame(step)
    return () => cancelAnimationFrame(frame)
  }, [target, duration])
  return value
}
