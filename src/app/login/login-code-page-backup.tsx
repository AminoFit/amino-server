"use client";

import classNames from "classnames";
import { PatternFormat } from "react-number-format";
import useSWR from "swr";

import { useSearchParams } from "next/navigation";
import { useState } from "react";

const fetcher = (url: string) =>
  fetch(url)
    .then((r) => r.json())
    .then((json) => {
      console.log("Got json", json);
      return json;
    });

export default function SignInCode() {
  console.log("Render");
  const searchParams = useSearchParams();

  const [codeInput, setCodeInput] = useState(searchParams.get("code") || "");

  const { data, error, isLoading } = useSWR("/api/auth/csrf", fetcher);

  const onSubmit = () => {
    console.log("Submitting");

    const details = {
      csrfToken: data.csrfToken || "",
      email: "cc",
      password: "cc",
    };

    const body = `csrfToken=${details.csrfToken}&user=${encodeURIComponent(
      details.email
    )}&password=${encodeURIComponent(details.password)}`;

    fetch("/api/auth/callback/credentials", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
      },
      body,
    })
      .then((res) => {
        console.log("checking text", res);
        res.text().then((text) => {
          console.log("text Result", text);
        });
      })
      .catch((err) => {
        console.log("Some err", err);
      });
  };

  if (error) return <div>failed to load</div>;
  if (isLoading) return <div>loading...</div>;

  return (
    <>
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

          <div className="mt-10 sm:mx-auto sm:w-full sm:max-w-sm">
            <form className="space-y-6" action="#" method="POST">
              <div>
                <label
                  htmlFor="code"
                  className="block text-sm font-medium leading-6 text-gray-900"
                >
                  Enter SMS Code
                </label>
                <div className="mt-2">
                  <input
                    id="code"
                    name="code"
                    type="string"
                    autoComplete="code"
                    value={codeInput}
                    onChange={(e) => setCodeInput(e.target.value)}
                    required
                    className="block w-full rounded-md border-0 px-4 py-3.5 text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-indigo-600 sm:text-sm sm:leading-6"
                  />
                </div>
                {error && (
                  <div className="text-pink-600 text-sm mt-2">{error}</div>
                )}
              </div>

              <div>
                <button
                  type="submit"
                  onClick={onSubmit}
                  className="flex w-full justify-center rounded-md bg-blue-600 px-3 py-1.5 text-sm font-semibold leading-6 text-white shadow-sm hover:bg-blue-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
                >
                  Submit Code
                </button>
              </div>
            </form>

            <p className="mt-10 text-center text-sm text-gray-500">
              Don't have a code yet?{" "}
              <a
                href="/"
                className="font-semibold leading-6 text-blue-600 hover:text-blue-500"
              >
                Get one on the login page
              </a>
            </p>
          </div>
        </div>
      </>
    </>
  );
}
