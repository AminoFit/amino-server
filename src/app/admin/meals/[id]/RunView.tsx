import classNames from "classnames"
import { ms, num, usd } from "../../_lib/format"
import type { MealRunRow, RunModelCall, RunTool } from "../../_lib/types"
import { Badge, RouteBadge, StateBadge } from "../../_components/ui"

type Event = { at: number; ms: number; label: string; kind: "tool" | "model"; error?: string; detail?: string
  body: { input?: unknown; output?: unknown }; meta?: string }

const json = (value: unknown) => typeof value === "string" ? value : JSON.stringify(value, null, 2)

/** One worker delivery: its totals, the resolver's stage timings and trace, and a waterfall of every tool and model call
 * (click a row for its input and output). Rendered on the server: <details> handles expanding. */
export function RunView({ run }: { run: MealRunRow }) {
  const events: Event[] = [
    ...(run.tools ?? []).map((tool: RunTool): Event => ({ at: tool.atMs, ms: tool.ms, label: tool.name, kind: "tool", error: tool.error,
      body: { input: tool.input, output: tool.output } })),
    ...(run.models ?? []).map((call: RunModelCall): Event => ({ at: call.atMs, ms: call.ms, label: call.kind, kind: "model",
      detail: call.detail, error: call.status !== "ok" && call.status !== "stop" ? call.status : undefined,
      meta: `${call.model.split("/").pop()} · ${num(call.promptTokens)}→${num(call.completionTokens)} tok${call.costUsd != null ? ` · ${usd(call.costUsd)}` : ""}`,
      body: call.output === undefined ? {} : { output: call.output } }))
  ].sort((a, b) => a.at - b.at)
  const span = Math.max(run.durationMs, ...events.map(event => event.at + event.ms), 1)
  return (
    <div className="rounded-md border border-zinc-200 dark:border-zinc-800">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-zinc-200 bg-zinc-50 px-3 py-2 text-xs dark:border-zinc-800 dark:bg-zinc-950">
        <span className="font-medium">Attempt {run.attempt}</span>
        <StateBadge state={run.state} />
        <RouteBadge route={run.route} />
        {run.errorCode && <code className="text-red-700 dark:text-red-400">{run.errorCode}</code>}
        <span className="tabular-nums text-zinc-500">{ms(run.durationMs)}</span>
        <span className="tabular-nums text-zinc-500">{run.modelCalls} model calls · {run.toolCalls} tool calls</span>
        <span className="tabular-nums text-zinc-500">{num(run.promptTokens)} in / {num(run.completionTokens)} out tokens</span>
        <span className="ml-auto font-medium tabular-nums">{usd(run.costUsd)}</span>
      </div>
      {(run.resolutions ?? []).map((resolution, index) => (
        <div key={index} className="border-b border-zinc-100 px-3 py-2 text-xs dark:border-zinc-800">
          <div className="mb-1 flex flex-wrap items-center gap-2">
            <span className="font-medium">Resolution {index + 1}</span>
            <RouteBadge route={resolution.model} />
            {resolution.validationErrorCode && <Badge tone="amber">repair: {resolution.validationErrorCode}</Badge>}
            <span className="text-zinc-500">{ms(resolution.durationMs)} · {resolution.steps} steps · {resolution.toolCalls} tools</span>
          </div>
          <StageBar timeline={resolution.timeline} />
          {resolution.trace.length > 0 && (
            <ol className="mt-1 list-decimal space-y-0.5 pl-5 font-mono text-[11px] text-zinc-600 dark:text-zinc-400">
              {resolution.trace.map((line, i) => <li key={i}>{line}</li>)}
            </ol>
          )}
        </div>
      ))}
      {events.length > 0 && (
        <div className="flex gap-4 px-3 pt-2 text-[11px] text-zinc-500">
          <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-[var(--series-1)]" />tool call</span>
          <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-[var(--series-2)]" />model call</span>
          <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-[var(--series-8)]" />error</span>
          <span className="ml-auto">click a row for its input and output</span>
        </div>
      )}
      <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
        {events.map((event, index) => (
          <details key={index} className="group">
            <summary className="grid cursor-pointer select-none grid-cols-[minmax(0,11rem)_minmax(0,1fr)_4.5rem] items-center gap-2 px-3 py-1 text-xs hover:bg-zinc-50 dark:hover:bg-zinc-800/50">
              <span className="flex min-w-0 items-center gap-1.5">
                <span className={classNames("h-2 w-2 shrink-0 rounded-full", event.kind === "tool" ? "bg-[var(--series-1)]" : "bg-[var(--series-2)]")} />
                <span className={classNames("truncate font-mono", event.error && "text-red-700 dark:text-red-400")}>{event.label}</span>
              </span>
              <span className="relative h-3.5 rounded bg-zinc-100 dark:bg-zinc-800" title={event.meta ?? event.detail}>
                <span className={classNames("absolute inset-y-0 rounded", event.kind === "tool" ? "bg-[var(--series-1)]" : "bg-[var(--series-2)]",
                  event.error && "!bg-[var(--series-8)]")}
                  style={{ left: `${(100 * event.at) / span}%`, width: `max(2px, ${(100 * event.ms) / span}%)` }} />
              </span>
              <span className="text-right tabular-nums text-zinc-500">{ms(event.ms)}</span>
            </summary>
            <div className="space-y-1 bg-zinc-50 px-3 py-2 dark:bg-zinc-950">
              <div className="text-[11px] text-zinc-500">
                starts at {ms(event.at)}{event.meta && ` · ${event.meta}`}{event.detail && ` · ${event.detail}`}{event.error && ` · error: ${event.error}`}
              </div>
              {"input" in event.body && <Block title="Input" value={event.body.input} />}
              {"output" in event.body && <Block title="Output" value={event.body.output} />}
            </div>
          </details>
        ))}
        {!events.length && <p className="px-3 py-2 text-xs text-zinc-400">No tool or model calls were recorded.</p>}
      </div>
    </div>
  )
}

function Block({ title, value }: { title: string; value: unknown }) {
  return (
    <div>
      <div className="text-[11px] font-medium text-zinc-500">{title}</div>
      <pre className="max-h-80 overflow-auto whitespace-pre-wrap break-words rounded border border-zinc-200 bg-white p-2 font-mono text-[11px] dark:border-zinc-800 dark:bg-zinc-900">{json(value)}</pre>
    </div>
  )
}

/** Where the resolver's time went, summed per stage (tool calls overlap, so this can exceed the wall time). */
function StageBar({ timeline }: { timeline: { stage: string; ms: number }[] }) {
  const sums = new Map<string, { ms: number; n: number }>()
  for (const { stage, ms: t } of timeline) sums.set(stage, { ms: (sums.get(stage)?.ms ?? 0) + t, n: (sums.get(stage)?.n ?? 0) + 1 })
  const rows = [...sums].sort((a, b) => b[1].ms - a[1].ms)
  if (!rows.length) return null
  return (
    <div className="flex flex-wrap gap-1">
      {rows.map(([stage, { ms: t, n }]) => (
        <span key={stage} className="rounded bg-zinc-100 px-1.5 py-0.5 font-mono text-[11px] text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
          {stage}{n > 1 ? ` ×${n}` : ""} <b className="tabular-nums">{ms(t)}</b>
        </span>
      ))}
    </div>
  )
}
