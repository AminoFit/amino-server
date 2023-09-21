"use client"

export default function VerifyRequest() {
  return (
    <>
      <div className="flex min-h-full flex-1 flex-col justify-center px-6 py-12 lg:px-8">
        <div className="sm:mx-auto sm:w-full sm:max-w-sm">
          <a href="/">
            <img className="mx-auto h-10 w-auto" src="/logos/logo-light.svg" alt="Amino logo" />
          </a>
          <>
            <h2 className="mt-10 text-center text-2xl font-bold leading-9 tracking-tight text-gray-900">
              We&apos;ve sent you a magic email link!
            </h2>
            <p className="mt-2 text-center text-sm text-gray-700">{"Check your email for a a link to login"}</p>
          </>
        </div>
      </div>
    </>
  )
}
