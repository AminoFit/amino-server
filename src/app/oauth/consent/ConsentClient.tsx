"use client"

import { useEffect, useState } from "react"
import { decideOnWeb } from "./actions"

const POLL_MS = 1500
const GIVE_UP_MS = 10 * 60_000

/** Waits while the user approves on their phone, then sends the browser back to the agent. */
export function WaitForApp({ authorizationId }: { authorizationId: string }) {
  const [state, setState] = useState<"waiting" | "done" | "expired">("waiting")
  useEffect(() => {
    const startedAt = Date.now()
    let stopped = false
    let timer: ReturnType<typeof setTimeout> | undefined
    const poll = () => fetch(`/api/oauth/handoff/${authorizationId}`, { cache: "no-store" })
      .then(response => response.json()).catch(() => ({ status: "waiting" }))
      .then((result: { status: string; redirectUrl?: string }) => {
        if (stopped) return
        if (result.status === "decided" && result.redirectUrl) {
          setState("done")
          window.location.assign(result.redirectUrl)
        } else if (Date.now() - startedAt > GIVE_UP_MS) setState("expired")
        else timer = setTimeout(poll, POLL_MS)
      })
    void poll()
    return () => { stopped = true; if (timer) clearTimeout(timer) }
  }, [authorizationId])
  if (state === "done") return <p role="status" className="text-sm text-gray-700">Done. You can go back to your agent.</p>
  if (state === "expired") return <p role="status" className="text-sm text-gray-700">
    This request has expired. Start connecting again from your agent.</p>
  return <p role="status" className="text-sm text-gray-500">Waiting for you to approve in Amino…</p>
}

/** Approve or deny for someone signed in on the web. */
export function WebDecision({ authorizationId }: { authorizationId: string }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const [done, setDone] = useState(false)
  const decide = (action: "approve" | "deny") => {
    setBusy(true)
    setError("")
    void decideOnWeb(authorizationId, action).then(result => {
      if (result.redirectUrl) { setDone(true); window.location.assign(result.redirectUrl) }
      else { setBusy(false); setError(result.error === "signed_out" ? "You were signed out. Reload the page." :
        "That didn't work. Start connecting again from your agent.") }
    })
  }
  if (done) return <p role="status" className="text-sm text-gray-700">Done. You can go back to your agent.</p>
  return (
    <div className="space-y-3">
      <button type="button" disabled={busy} onClick={() => decide("approve")}
        className="flex w-full justify-center rounded-md bg-indigo-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 disabled:opacity-50">
        Allow access
      </button>
      <button type="button" disabled={busy} onClick={() => decide("deny")}
        className="flex w-full justify-center rounded-md bg-white px-3 py-2 text-sm font-semibold text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 hover:bg-gray-50 disabled:opacity-50">
        Deny
      </button>
      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
    </div>
  )
}
