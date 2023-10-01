"use client"

import classNames from "classnames"
import { signIn } from "next-auth/react"
import { useState } from "react"

export default function Example() {
  const [email, setEmail] = useState("")
  const [error, setError] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [emailSent, setEmailSent] = useState(false)

  const handleSubmit = () => {
    console.log(email)
    if (!email) {
      setError("Please enter a valid email")
      return
    }
    setError("")
    setSubmitting(true)

    signIn("email", { email })
  }

  return (
    <>
      <div className="flex min-h-full flex-1 flex-col justify-center px-6 py-12 lg:px-8">
        <div className="sm:mx-auto sm:w-full sm:max-w-sm">
          <a href="/">
            <img className="mx-auto h-10 w-auto" src="/logos/logo-light.svg" alt="Amino logo" />
          </a>
          {emailSent ? (
            <>
              <h2 className="mt-10 text-center text-2xl font-bold leading-9 tracking-tight text-gray-900">
                We&apos;ve sent you a magic email link!
              </h2>
              <p className="mt-2 text-center text-sm text-gray-700">{"Check your email for a a link to login"}</p>
            </>
          ) : (
            <>
              <h2 className="mt-10 text-center text-2xl font-bold leading-9 tracking-tight text-gray-900">
                Sign in with a magic email link
              </h2>
              <p className="mt-2 text-center text-sm text-gray-700">
                {"We'll email you a magic link to sign in to your account."}
              </p>
            </>
          )}
        </div>

        <div className="mt-10 sm:mx-auto sm:w-full sm:max-w-sm">
          {!emailSent && (
            <form className="space-y-6" action="#" method="POST">
              <div>
                <label htmlFor="email" className="block text-sm font-medium leading-6 text-gray-900">
                  Email
                </label>
                <div className="mt-2">
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className={classNames(
                      "block w-full rounded-md border-0 px-4 py-3.5 ring-1 ring-inset placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-blue-600 sm:text-sm sm:leading-6",
                      {
                        "text-gray-900": !error,
                        "ring-gray-300": !error,
                        "text-pink-600": error.length > 0,
                        "ring-pink-600": error.length > 0
                      }
                    )}
                    placeholder="jack@gmail.com"
                    required
                  />
                </div>
                {error && <div className="text-pink-600 text-sm mt-2">{error}</div>}
              </div>

              <div>
                <button
                  type="submit"
                  onClick={handleSubmit}
                  disabled={submitting}
                  className={classNames(
                    "flex w-full justify-center rounded-md px-3 py-1.5 text-sm font-semibold leading-6 text-white shadow-sm hover:bg-blue-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600",
                    {
                      "bg-blue-600": !submitting,
                      "bg-blue-300": submitting
                    }
                  )}
                >
                  {submitting ? "Sending..." : "Get Magic Link"}
                </button>
              </div>
            </form>
          )}

          <p className="mt-10 text-center text-sm text-gray-500">
            {"Not a member? Enter your email here and we'll get you set up!"}
          </p>
        </div>
      </div>
    </>
  )
}
