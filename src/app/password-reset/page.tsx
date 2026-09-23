"use client"

import { useEffect, useRef, useState, type FormEvent } from "react"
import { getPasswordRecoveryClient } from "@/utils/supabase/passwordRecoveryClient"
import { passwordRecoveryErrorMessage, requestPasswordReset } from "@/utils/supabase/passwordRecovery"

export default function PasswordReset() {
  const [email, setEmail] = useState("")
  const [sent, setSent] = useState(false)
  const [error, setError] = useState("")
  const [isSubmitting, setSubmitting] = useState(false)
  const [ready, setReady] = useState(false)
  const submitting = useRef(false)

  // Avoid a native form submission before the browser has attached React's handler.
  useEffect(() => { setReady(true) }, [])

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (submitting.current) return
    submitting.current = true
    setSubmitting(true)
    setError("")
    try {
      await requestPasswordReset(getPasswordRecoveryClient().auth, email, window.location.origin)
      setSent(true)
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
        <h1 className="text-center text-2xl font-bold leading-9 tracking-tight text-gray-900">
          Reset your Amino password
        </h1>
        <div className="mt-10">
          {sent ? (
            <p role="status" className="rounded-md bg-gray-50 p-4 text-sm text-gray-700">
              If an account exists for this email, you will receive a password reset link. Check your inbox and spam folder.
            </p>
          ) : (
            <form className="space-y-6" onSubmit={handleSubmit} aria-busy={isSubmitting}>
              <div>
                <label htmlFor="email" className="block text-sm font-medium leading-6 text-gray-900">Email address</label>
                <input
                  id="email" name="email" type="email" autoComplete="email" required
                  value={email} onChange={(event) => setEmail(event.target.value)} disabled={!ready || isSubmitting}
                  className="mt-2 block w-full rounded-md border-0 p-1.5 text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 focus:ring-2 focus:ring-indigo-600"
                />
              </div>
              {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
              <button
                type="submit" disabled={!ready || isSubmitting}
                className="flex w-full justify-center rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-semibold leading-6 text-white hover:bg-indigo-500 disabled:opacity-50"
              >
                {isSubmitting ? "Sending…" : "Send reset email"}
              </button>
            </form>
          )}
        </div>
        <p className="mt-8 text-center text-sm">
          <a href="/login" className="font-semibold text-indigo-600 hover:text-indigo-500">Back to sign in</a>
        </p>
      </div>
    </div>
  )
}
