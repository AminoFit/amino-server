"use client"

import { createClientComponentClient } from "@supabase/auth-helpers-nextjs"
import { useRouter, useSearchParams } from "next/navigation"
import { Suspense, useState } from "react"
import { Database } from "types/supabase-generated.types"

export default function ForgotPassword() {
  const [email, setEmail] = useState("")
  const [success, setSuccess] = useState("")
  const [error, setError] = useState("")
  const router = useRouter()
  const supabase = createClientComponentClient<Database>()

  const origin = typeof window !== "undefined" ? window.location.origin : ""

  console.log("Using redirect:", `${origin}/auth/callback`)

  function UseSearchParamsComponent() {
    const searchParams = useSearchParams();
    const expiresAt = searchParams.get("expires_at");
    const access_token = searchParams.get("access_token");
    const refresh_token = searchParams.get("refresh_token");
    const error_description = searchParams.get("error_description");
    const error_code = searchParams.get("error_code");
  
    console.log("error_description", error_description);
  
    // You can return these values or use them directly within this component.
    return null; // Adjust based on your use case
  }

  const handleRequestPasswordReset = async () => {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${process.env.NEXT_PUBLIC_VERCEL_URL
          ? "https://" + process.env.NEXT_PUBLIC_VERCEL_URL + "/password-change"
          : "http://localhost:3000/password-change"
        }`
    })

    if (error) {
      setError(error.message)
    } else {
      setSuccess("Password reset email sent. Go check your email and follow the instructions.")
    }
  }

  const renderError = () => {
    return (
      <div className="bg-gray-50 sm:rounded-lg">
        <div className="px-4 py-5 sm:p-6">
          <h3 className="text-base font-semibold leading-6 text-gray-900">Error</h3>
          <div className="mt-2 max-w-xl text-sm text-gray-500">
            <p>{error}</p>
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
      <form className="space-y-6" action="#" method="POST">
        <div>
          <label htmlFor="email" className="block text-sm font-medium leading-6 text-gray-900">
            Email address
          </label>
          <div className="mt-2">
            <input
              id="email"
              name="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              placeholder="jack@amino.com"
              required
              className="block w-full rounded-md border-0 p-1.5 text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-indigo-600 sm:text-sm sm:leading-6"
            />
          </div>
        </div>
        <div>
          <button
            type="submit"
            onClick={handleRequestPasswordReset}
            className="flex w-full justify-center rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-semibold leading-6 text-white shadow-sm hover:bg-indigo-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600"
          >
            Update Password
          </button>
        </div>
      </form>
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
            Need to reset your password?
          </h2>
        </div>

        <div className="mt-10 sm:mx-auto sm:w-full sm:max-w-sm">
            {success ? renderSuccess() : error ? renderError() : renderForm()}
        </div>


        <Suspense fallback={<div>Loading...</div>}>
          <UseSearchParamsComponent />
        </Suspense>

        <div className="mt-10 sm:mx-auto sm:w-full sm:max-w-sm">
          <p className="mt-10 text-center text-sm text-gray-500">
            Don{"'"}t have Amino?{" "}
            <a href="/" className="font-semibold leading-6 text-indigo-600 hover:text-indigo-500">
              Download in the Apple App Store
            </a>
          </p>
        </div>
      </div>
    </>
  )
}
