"use client"

import { useEffect, useRef, useState, type FormEvent } from "react"
import { clearPasswordRecoverySession, discardStoredPasswordRecoverySession, getPasswordRecoveryClient } from "@/utils/supabase/passwordRecoveryClient"
import { establishPasswordRecoverySession, passwordRecoveryErrorMessage, updateRecoveredPassword } from "@/utils/supabase/passwordRecovery"

export default function PasswordChange() {
  const [password, setPassword] = useState("")
  const [confirmation, setConfirmation] = useState("")
  const [ready, setReady] = useState(false)
  const [loading, setLoading] = useState(true)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState("")
  const [isSubmitting, setSubmitting] = useState(false)
  const submitting = useRef(false)
  const initialization = useRef<Promise<void>>()

  useEffect(() => {
    let active = true
    if (!initialization.current) {
      const url = new URL(window.location.href)
      initialization.current = (async () => {
        // Clear an older recovery session before removing a new link from the URL.
        // Even a reload while validating the new link must not resume the old account.
        if (url.hash || url.search) discardStoredPasswordRecoverySession()
        window.history.replaceState(window.history.state, "", url.pathname)
        await establishPasswordRecoverySession(getPasswordRecoveryClient().auth, url)
      })().catch(async (failure) => {
        // A failed new link must not leave a previous recovery session reusable.
        await clearPasswordRecoverySession().catch(() => {})
        throw failure
      })
    }
    initialization.current.then(() => {
      if (active) setReady(true)
    }).catch((failure) => {
      if (active) setError(passwordRecoveryErrorMessage(failure))
    }).finally(() => {
      if (active) setLoading(false)
    })
    return () => { active = false }
  }, [])

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!ready || submitting.current) return
    submitting.current = true
    setSubmitting(true)
    setError("")
    try {
      await updateRecoveredPassword(getPasswordRecoveryClient().auth, password, confirmation)
      setSuccess(true)
      setPassword("")
      setConfirmation("")
      await clearPasswordRecoverySession().catch(() => {})
    } catch (failure) {
      setError(passwordRecoveryErrorMessage(failure))
    } finally {
      submitting.current = false
      setSubmitting(false)
    }
  }

  return (
    <div className="flex min-h-full flex-1 flex-col justify-center px-6 py-12 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-sm">
        <h1 className="text-center text-2xl font-bold leading-9 tracking-tight text-gray-900">Set your new password</h1>
        <div className="mt-10 space-y-6">
          {loading && <p role="status" className="text-sm text-gray-600">Checking your reset link…</p>}
          {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
          {success ? (
            <p role="status" className="rounded-md bg-gray-50 p-4 text-sm text-gray-700">
              Your password has been updated. Return to Amino and sign in with your new password.
            </p>
          ) : ready && (
            <form className="space-y-6" onSubmit={handleSubmit} aria-busy={isSubmitting}>
              <div>
                <label htmlFor="password" className="block text-sm font-medium leading-6 text-gray-900">New password</label>
                <input
                  id="password" name="password" type="password" autoComplete="new-password" required minLength={6}
                  value={password} onChange={(event) => setPassword(event.target.value)} disabled={isSubmitting}
                  className="mt-2 block w-full rounded-md border-0 p-1.5 text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 focus:ring-2 focus:ring-indigo-600"
                />
              </div>
              <div>
                <label htmlFor="confirmation" className="block text-sm font-medium leading-6 text-gray-900">Confirm new password</label>
                <input
                  id="confirmation" name="confirmation" type="password" autoComplete="new-password" required minLength={6}
                  value={confirmation} onChange={(event) => setConfirmation(event.target.value)} disabled={isSubmitting}
                  className="mt-2 block w-full rounded-md border-0 p-1.5 text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 focus:ring-2 focus:ring-indigo-600"
                />
              </div>
              <button
                type="submit" disabled={isSubmitting}
                className="flex w-full justify-center rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-semibold leading-6 text-white hover:bg-indigo-500 disabled:opacity-50"
              >
                {isSubmitting ? "Updating…" : "Update password"}
              </button>
            </form>
          )}
          {!loading && !success && (
            <a href="/password-reset" className="block text-sm font-semibold text-indigo-600 hover:text-indigo-500">Request a new reset email</a>
          )}
          {success && <a href="/login" className="block text-sm font-semibold text-indigo-600 hover:text-indigo-500">Sign in</a>}
        </div>
      </div>
    </div>
  )
}
