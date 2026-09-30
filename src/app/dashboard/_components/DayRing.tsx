// The week strip's calorie ring, as in the app: filled to calories ÷ goal, a faint disc within 15% of the goal, and an
// inner ring for anything over it.

const SIZE = 40
const STROKE = 3

export function DayRing({ progress, children }: { progress: number; children: React.ReactNode }) {
  const radius = (SIZE - STROKE) / 2
  const length = 2 * Math.PI * radius
  const inner = radius - STROKE - 1
  const innerLength = 2 * Math.PI * inner
  const over = Math.min(Math.max(progress - 1, 0), 1)
  const nearGoal = progress >= 0.85 && progress <= 1.15
  return (
    <span className="relative grid h-10 w-10 place-items-center">
      <svg viewBox={`0 0 ${SIZE} ${SIZE}`} className="absolute inset-0 -rotate-90" aria-hidden>
        {nearGoal && <circle cx={SIZE / 2} cy={SIZE / 2} r={radius} className="fill-app-kcal/15" />}
        <circle cx={SIZE / 2} cy={SIZE / 2} r={radius} fill="none" strokeWidth={STROKE} className="stroke-app-kcal/15" />
        {progress > 0 && <circle cx={SIZE / 2} cy={SIZE / 2} r={radius} fill="none" strokeWidth={STROKE}
          strokeLinecap="round" className="app-ring-arc stroke-app-kcal"
          strokeDasharray={length} strokeDashoffset={length * (1 - Math.min(progress, 1))}
          style={{ "--ring-length": length } as React.CSSProperties} />}
        {over > 0 && <circle cx={SIZE / 2} cy={SIZE / 2} r={inner} fill="none" strokeWidth={2} strokeLinecap="round"
          className="app-ring-arc" stroke="#1F7EA0" strokeDasharray={innerLength} strokeDashoffset={innerLength * (1 - over)}
          style={{ "--ring-length": innerLength } as React.CSSProperties} />}
      </svg>
      <span className="relative text-sm font-semibold tabular-nums">{children}</span>
    </span>
  )
}
