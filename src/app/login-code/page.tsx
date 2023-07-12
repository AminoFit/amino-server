import { getCsrfToken } from "next-auth/react";
import { CodeForm } from "./CodeForm";

export default async function SignInWithCode() {
  const csrfToken = await getCsrfToken();

  return (
    <>
      <div className="flex min-h-full flex-1 flex-col justify-center px-6 py-12 lg:px-8">
        <div className="sm:mx-auto sm:w-full sm:max-w-sm">
          <img
            className="mx-auto h-10 w-auto"
            src="/logos/logo.svg"
            alt="Amino logo"
          />
          <h2 className="mt-10 text-center text-2xl font-bold leading-9 tracking-tight text-gray-900">
            Sign in with a magic text link
          </h2>
          <p className="mt-2 text-center text-sm text-gray-700">
            {"We'll text you a link to sign in to your account."}
          </p>
        </div>

        <CodeForm csrfToken={csrfToken || ""} />

        <p className="mt-10 text-center text-sm text-gray-500">
          {"Don't have a code yet? "}
          <a
            href="/"
            className="font-semibold leading-6 text-blue-600 hover:text-blue-500"
          >
            Get one on the login page
          </a>
        </p>
      </div>
    </>
  );
}
