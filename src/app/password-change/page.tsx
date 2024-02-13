"use client"

import { createClientComponentClient } from "@supabase/auth-helpers-nextjs"
import { useRouter, useSearchParams } from "next/navigation"
import { useEffect, useState } from "react"
import { Database } from "types/supabase-generated.types"

export default function PasswordChange() {
  const [password, setPassword] = useState("")
  const [success, setSuccess] = useState("")
  const [error, setError] = useState("")
  const [isSubmitting, setSubmitting] = useState(false)
  const router = useRouter()
  const supabase = createClientComponentClient<Database>()

  const origin = typeof window !== "undefined" ? window.location.origin : ""

  console.log("Using redirect:", `${origin}/auth/callback`)

  // useEffect(() => {
  //   if (error_description) {
  //     setError(error_description)
  //     return
  //   }
  //   ;(async () => {
  //     const { data, error } = await supabase.auth.getUser()

  //     if (data && data.user) {
  //       // setSuccess("Password reset email sent. Go check your email and follow the instructions.")
  //     } else {
  //       if (error_description) setError(error_description)
  //     }
  //   })()
  // }, [error_description])

  const updatePasswordFromHash = async () => {
    var hashParams = parseHashParams(window.location.hash)
    const access_token = hashParams.get("access_token")
    const refresh_token = hashParams.get("refresh_token")
    if (!access_token || !refresh_token) {
      setError("Missing access token or refresh token")
      return
    }
    const { data, error } = await supabase.auth.setSession({
      access_token,
      refresh_token
    })
  }
  const updatePasswordFromExistingSession = async () => {
    const { data, error } = await supabase.auth.updateUser({ password })

    if (data && data.user) {
      setSuccess("Your password has been updated")
    } else {
      if (error) {
        setError(error.message)
      } else {
        setError("Error updating password")
      }
    }
  }

  const handleRequestUpdatePassword = async () => {
    setSubmitting(true)
    const { data, error } = await supabase.auth.getSession()

    if (data && data.session) {
      await updatePasswordFromExistingSession()
    } else {
      await updatePasswordFromHash()
      await updatePasswordFromExistingSession()
    }
    setSubmitting(false)
  }

  const renderError = () => {
    return (
      <div className="bg-gray-50 sm:rounded-lg">
        <div className="px-4 py-5 sm:p-6">
          <h3 className="text-base font-semibold leading-6 text-gray-900">Something went wrong</h3>
          <div className="mt-2 max-w-xl text-sm text-gray-500">
            <p>{error}</p>
          </div>
          <div className="mt-3 text-sm leading-6">
            <a href="/password-reset" className="font-semibold text-indigo-600 hover:text-indigo-500">
              Request new password reset
            </a>
          </div>
        </div>
      </div>
    )
  }

  const renderSuccess = () => {
    return (
      <div className="bg-gray-50 sm:rounded-lg">
        <div className="px-4 py-5 sm:p-6">
          <h3 className="text-base font-semibold leading-6 text-gray-900">Success</h3>
          <div className="mt-2 max-w-xl text-sm text-gray-500">
            <p>{success}</p>
          </div>
        </div>
      </div>
    )
  }

  const renderForm = () => {
    return (
      <div className="space-y-6">
        <div>
          <div className="flex items-center justify-between">
            <label htmlFor="password" className="block text-sm font-medium leading-6 text-gray-900">
              Password
            </label>
          </div>
          <div className="mt-2">
            <input
              id="password"
              name="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              required
              className="block w-full rounded-md border-0 p-1.5 text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-indigo-600 sm:text-sm sm:leading-6"
            />
          </div>
        </div>
        <div>
          <button
            type="submit"
            disabled={isSubmitting}
            onClick={handleRequestUpdatePassword}
            className="flex w-full justify-center rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-semibold leading-6 text-white shadow-sm hover:bg-indigo-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600"
          >
            {isSubmitting ? "Sending..." : "Update Password"}
          </button>
        </div>
      </div>
    )
  }

  return (
    <>
      <div className="flex min-h-full flex-1 flex-col justify-center px-6 py-12 lg:px-8">
        <div className="sm:mx-auto sm:w-full sm:max-w-sm">
          <img
            className="mx-auto h-10 w-auto"
            src="https://tailwindui.com/img/logos/mark.svg?color=indigo&shade=600"
            alt="Your Company"
          />
          <h2 className="mt-10 text-center text-2xl font-bold leading-9 tracking-tight text-gray-900">
            Set your new password
          </h2>
        </div>

        <div className="mt-10 sm:mx-auto sm:w-full sm:max-w-sm">
          {success ? renderSuccess() : error ? renderError() : renderForm()}
        </div>

        <div className="mt-10 sm:mx-auto sm:w-full sm:max-w-sm">
          <p className="mt-10 text-center text-sm text-gray-500">
            Don't have Amino?{" "}
            <a href="/" className="font-semibold leading-6 text-indigo-600 hover:text-indigo-500">
              Download in the Apple App Store
            </a>
          </p>
        </div>
      </div>
    </>
  )
}

// Function to parse hash parameters into an object
function parseHashParams(hash: string) {
  var params = new Map<string, string>()
  // Remove the "#" character
  var queryString = hash.substring(1)
  // Split into key-value pairs
  var queries = queryString.split("&")
  // Iterate over each pair
  queries.forEach((query) => {
    var pair = query.split("=")
    params.set(decodeURIComponent(pair[0]), decodeURIComponent(pair[1] || ""))
  })
  return params
}
