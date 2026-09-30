"use client"

import { useState } from "react"
import { CheckIcon, ClipboardDocumentIcon, SparklesIcon } from "@heroicons/react/20/solid"
import type { Agent } from "../_lib/types"
import { shiftDay } from "../_lib/dates"
import { number } from "../_lib/stats"
import { disconnectAgent } from "@/app/log/actions"
import { Card } from "./StatsPanel"

// Agents connected to the account over MCP (Claude, ChatGPT, …): what they've done in the last 30 days, and a way to
// disconnect them. Connecting happens from the agent, approved with the app.

const MCP_URL = "https://www.amino.fit/api/mcp"

const toolName = (tool: string) => tool.replace(/_/g, " ").replace(/^\w/, c => c.toUpperCase())

function ago(iso: string) {
  const seconds = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000)
  if (seconds < 60) return "just now"
  if (seconds < 3600) return `${Math.round(seconds / 60)} min ago`
  if (seconds < 86400) return `${Math.round(seconds / 3600)} h ago`
  const days = Math.round(seconds / 86400)
  return days === 1 ? "yesterday" : `${days} days ago`
}

const connectedOn = (iso: string) => iso
  ? new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : null

/** Calls per day over the last 30 days. */
function Sparkline({ days, today }: { days: Record<string, number>; today: string }) {
  const counts = Array.from({ length: 30 }, (_, i) => days[shiftDay(today, i - 29)] ?? 0)
  const max = Math.max(1, ...counts)
  return (
    <svg viewBox="0 0 90 28" className="h-7 w-[90px] shrink-0" aria-label="Calls per day, last 30 days">
      {counts.map((count, i) => {
        const height = count ? Math.max(2, (count / max) * 28) : 1
        return <rect key={i} x={i * 3} y={28 - height} width={2} height={height} rx={1}
          className={count ? "fill-app-link" : "fill-app-text/15"} />
      })}
    </svg>
  )
}

function AgentRow({ agent, today, onGone }: { agent: Agent; today: string; onGone: () => void }) {
  const [state, setState] = useState<"idle" | "confirm" | "busy" | "error">("idle")
  const usage = agent.usage
  const disconnect = () => {
    setState("busy")
    void disconnectAgent(agent.id).then(result => {
      if ("ok" in result) onGone()
      else if (result.error === "signed_out") window.location.assign("/login?next=/log")
      else setState("error")
    })
  }
  return (
    <li className="app-fade flex flex-col rounded-2xl border border-app-border/70 bg-app-text/[0.02] p-4">
      <div className="flex items-center gap-3">
        {agent.logoUri
          ? <img src={agent.logoUri} alt="" className="h-10 w-10 shrink-0 rounded-xl bg-white object-contain p-1" />
          : <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-app-kcal to-app-fat text-white">
              <SparklesIcon className="h-5 w-5" aria-hidden />
            </span>}
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">{agent.name}</p>
          <p className="truncate text-xs text-app-muted" suppressHydrationWarning>
            {usage ? `Used ${ago(usage.lastUsedAt)}` : "Not used in the last 30 days"}
          </p>
        </div>
        {usage && <Sparkline days={usage.days} today={today} />}
      </div>
      {usage && (
        <>
          <dl className="mt-4 grid grid-cols-3 divide-x divide-app-border/70 rounded-xl bg-app-text/[0.04] py-2.5 text-center">
            <div><dt className="text-[11px] text-app-muted">Calls</dt><dd className="text-sm font-semibold tabular-nums">{number(usage.calls)}</dd></div>
            <div><dt className="text-[11px] text-app-muted">Succeeded</dt>
              <dd className="text-sm font-semibold tabular-nums">{Math.round((100 * (usage.calls - usage.failed)) / usage.calls)}%</dd></div>
            <div><dt className="text-[11px] text-app-muted">Avg time</dt><dd className="text-sm font-semibold tabular-nums">{number(usage.avgMs)} ms</dd></div>
          </dl>
          <ul className="mt-3 flex flex-wrap gap-1.5">
            {usage.tools.slice(0, 4).map(tool => (
              <li key={tool.tool} className="rounded-full bg-app-text/[0.06] px-2.5 py-1 text-[11px] text-app-muted">
                {toolName(tool.tool)} <span className="font-semibold tabular-nums text-app-text">{number(tool.calls)}</span>
              </li>
            ))}
          </ul>
        </>
      )}
      <div className="mt-auto flex items-center justify-end gap-2 pt-3">
        {state === "confirm" || state === "busy" ? (
          <>
            <span className="mr-auto text-xs text-app-muted">It loses access to your data.</span>
            <button type="button" onClick={() => setState("idle")} disabled={state === "busy"}
              className="rounded-full px-3 py-1.5 text-xs font-medium text-app-muted transition hover:bg-app-text/[0.06]">Cancel</button>
            <button type="button" onClick={disconnect} disabled={state === "busy"}
              className="rounded-full bg-app-danger px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-app-danger/90 disabled:opacity-60">
              {state === "busy" ? "Disconnecting…" : "Disconnect"}
            </button>
          </>
        ) : (
          <>
            {state === "error" ? <span className="mr-auto text-xs text-app-danger">That didn&apos;t work. Try again.</span>
              : connectedOn(agent.grantedAt) && <span className="mr-auto text-xs text-app-muted" suppressHydrationWarning>
                Connected {connectedOn(agent.grantedAt)}</span>}
            <button type="button" onClick={() => setState("confirm")}
              className="rounded-full px-3 py-1.5 text-xs font-medium text-app-danger transition hover:bg-app-danger/10">Disconnect</button>
          </>
        )}
      </div>
    </li>
  )
}

function CopyAddress() {
  const [copied, setCopied] = useState(false)
  const copy = () => void navigator.clipboard.writeText(MCP_URL).then(() => {
    setCopied(true)
    setTimeout(() => setCopied(false), 1600)
  })
  return (
    <button type="button" onClick={copy} title="Copy the address"
      className="group flex w-full items-center gap-2 rounded-xl border border-dashed border-app-border bg-app-text/[0.03] px-3 py-2.5 text-left transition hover:border-app-link/60">
      <code className="min-w-0 flex-1 truncate text-xs">{MCP_URL}</code>
      {copied
        ? <CheckIcon className="app-fade h-4 w-4 text-app-kcal" aria-label="Copied" />
        : <ClipboardDocumentIcon className="h-4 w-4 text-app-muted transition group-hover:text-app-text" aria-label="Copy" />}
    </button>
  )
}

export function AgentsPanel({ agents: initial, today }: { agents: Agent[] | null; today: string }) {
  const [agents, setAgents] = useState(initial)
  return (
    <Card title="Connected agents" subtitle="AI assistants that can read your log and set your goals, and what they did in the last 30 days"
      className="app-rise" style={{ "--delay": "260ms" } as React.CSSProperties}>
      <div className="sm:max-w-md"><CopyAddress /></div>
      {agents === null ? (
        <p className="mt-4 text-sm text-app-muted">Your agents couldn&apos;t be loaded right now.</p>
      ) : agents.length === 0 ? (
        <p className="mt-4 max-w-xl text-sm leading-relaxed text-app-muted">
          None yet. Add Amino as a custom connector (an MCP server) in Claude, ChatGPT or another agent with the address
          above, then approve it with your phone.
        </p>
      ) : (
        <ul className="mt-4 grid gap-3 sm:grid-cols-2">
          {agents.map(agent => <AgentRow key={agent.id} agent={agent} today={today}
            onGone={() => setAgents(list => list?.filter(a => a.id !== agent.id) ?? null)} />)}
        </ul>
      )}
    </Card>
  )
}
