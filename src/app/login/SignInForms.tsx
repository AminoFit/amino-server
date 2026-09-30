"use client"

import { useEffect, useRef, useState } from "react"
import { useFormState, useFormStatus } from "react-dom"
import { ArrowPathIcon, CheckCircleIcon, DevicePhoneMobileIcon } from "@heroicons/react/20/solid"
import GoogleLogo from "../../../public/logos/GoogleLogo"
import { login, loginWithGoogle } from "./actions"
import { startPhoneSignIn } from "./phoneActions"

const POLL_MS = 1500

type Phone =
  | { kind: "starting" }
  | { kind: "ready"; qr: string; code: string; expiresAt: number }
  | { kind: "done" }
  | { kind: "ended"; reason: "expired" | "denied" | "failed" }

/** A QR code to scan with the app, then this browser is signed in. Most users sign in with Apple on the phone. */
export function PhoneSignIn({ next }: { next: string | null }) {
  const [state, setState] = useState<Phone>({ kind: "starting" })
  const start = () => {
    setState({ kind: "starting" })
    startPhoneSignIn()
      .then(result => setState({ kind: "ready", qr: result.qr, code: result.code, expiresAt: Date.now() + result.expiresInMs }))
      .catch(() => setState({ kind: "ended", reason: "failed" }))
  }
  // Once per page: a second request would replace the first one's cookie while its code is still on screen.
  const started = useRef(false)
  useEffect(() => { if (!started.current) { started.current = true; start() } }, [])

  const expiresAt = state.kind === "ready" ? state.expiresAt : 0
  useEffect(() => {
    if (!expiresAt) return
    let stopped = false
    let timer: ReturnType<typeof setTimeout> | undefined
    const poll = () => {
      if (stopped) return
      if (Date.now() > expiresAt) { setState({ kind: "ended", reason: "expired" }); return }
      if (document.visibilityState === "hidden") { timer = setTimeout(poll, POLL_MS); return }
      fetch("/api/web-sign-in", { cache: "no-store" }).then(response => response.json())
        .catch(() => ({ status: "waiting" }))
        .then((result: { status: string }) => {
          if (stopped) return
          if (result.status === "signed_in") { setState({ kind: "done" }); window.location.assign(next ?? "/log") }
          else if (result.status === "waiting") timer = setTimeout(poll, POLL_MS)
          else setState({ kind: "ended", reason: result.status === "denied" ? "denied" : result.status === "failed" ? "failed" : "expired" })
        })
    }
    timer = setTimeout(poll, POLL_MS)
    return () => { stopped = true; if (timer) clearTimeout(timer) }
  }, [expiresAt, next])

  return (
    <div className="flex h-full flex-col items-center text-center">
      <span className="grid h-10 w-10 place-items-center rounded-2xl bg-app-kcal/15 text-app-kcal">
        <DevicePhoneMobileIcon className="h-5 w-5" aria-hidden />
      </span>
      <h2 className="mt-3 text-lg font-semibold tracking-tight">Sign in with your phone</h2>
      <p className="mt-1 max-w-xs text-sm text-app-muted">
        In Amino, open Settings → Sign in on the web and scan this code.
      </p>
      <div className="relative mt-6 grid h-52 w-52 place-items-center rounded-3xl bg-white p-4 shadow-sm ring-1 ring-black/5">
        {state.kind === "ready" && <div className="app-fade h-full w-full [&>svg]:h-full [&>svg]:w-full" aria-label="QR code to scan with the Amino app"
          dangerouslySetInnerHTML={{ __html: state.qr }} />}
        {state.kind === "starting" && <div className="app-shimmer h-full w-full rounded-2xl" />}
        {state.kind === "done" && <CheckCircleIcon className="app-fade h-16 w-16 text-emerald-500" aria-label="Signed in" />}
        {state.kind === "ended" && (
          <button type="button" onClick={start} className="flex flex-col items-center gap-2 text-sm font-medium text-gray-700">
            <ArrowPathIcon className="h-6 w-6" aria-hidden />
            {state.reason === "denied" ? "Not approved. New code" : state.reason === "failed" ? "That didn't work. New code" : "Code expired. New code"}
          </button>
        )}
      </div>
      <p className="mt-5 min-h-[2.5rem] text-sm text-app-muted" role="status">
        {state.kind === "ready" ? <>When the app asks, pick <span className="mx-1 inline-block rounded-lg bg-app-text/10 px-2 py-0.5 text-base font-semibold tabular-nums text-app-text">{state.code}</span></>
          : state.kind === "done" ? "Signed in. Opening your log…" : ""}
      </p>
    </div>
  )
}

function SubmitButton() {
  const { pending } = useFormStatus()
  return (
    <button type="submit" disabled={pending}
      className="flex w-full justify-center rounded-xl bg-app-text px-4 py-2.5 text-sm font-semibold text-app-bg transition hover:opacity-90 active:scale-[0.99] disabled:opacity-60">
      {pending ? "Signing in…" : "Sign in"}
    </button>
  )
}

const FIELD = "block w-full rounded-xl border border-app-border bg-app-bg/60 px-3.5 py-2.5 text-sm text-app-text placeholder:text-app-muted/70 outline-none transition focus:border-app-link focus:ring-2 focus:ring-app-link/25"

/** Email and password, or Google. */
export function PasswordSignIn({ next, googleFailed }: { next: string | null; googleFailed: boolean }) {
  const [state, action] = useFormState(login, googleFailed ? { error: "Signing in with Google didn't work. Try again." } : null)
  return (
    <div>
      <h2 className="text-lg font-semibold tracking-tight">Email and password</h2>
      <form action={action} className="mt-5 space-y-3">
        {next && <input type="hidden" name="next" value={next} />}
        <label className="block">
          <span className="mb-1.5 block text-xs font-medium text-app-muted">Email</span>
          <input name="email" type="email" autoComplete="email" required className={FIELD} />
        </label>
        <label className="block">
          <span className="mb-1.5 flex items-center justify-between text-xs font-medium text-app-muted">
            Password <a href="/password-reset" className="text-app-link hover:underline">Forgot it?</a>
          </span>
          <input name="password" type="password" autoComplete="current-password" required className={FIELD} />
        </label>
        {state?.error && <p role="alert" className="app-fade text-sm text-app-danger">{state.error}</p>}
        <div className="pt-1"><SubmitButton /></div>
      </form>
      <div className="my-5 flex items-center gap-3 text-xs text-app-muted">
        <span className="h-px flex-1 bg-app-border" />or<span className="h-px flex-1 bg-app-border" />
      </div>
      <form action={loginWithGoogle}>
        {next && <input type="hidden" name="next" value={next} />}
        <button type="submit"
          className="flex w-full items-center justify-center gap-2.5 rounded-xl border border-app-border bg-app-card px-4 py-2.5 text-sm font-semibold transition hover:bg-app-text/[0.04]">
          <GoogleLogo /> Continue with Google
        </button>
      </form>
    </div>
  )
}
