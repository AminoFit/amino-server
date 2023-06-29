"use client";

import { signIn } from "next-auth/react";
import useSWR from "swr";
import * as Yup from "yup";

import { ErrorMessage, Field, Formik } from "formik";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { render } from "@headlessui/react/dist/utils/render";

const jsonFetcher = (url: string) =>
  fetch(url)
    .then((r) => r.json())
    .then((json) => {
      console.log("Got json", json);
      return json;
    });

export default function SignInCode() {
  console.log("Render");
  const searchParams = useSearchParams();

  const [errorMessage, setErrorMessage] = useState<string | null>();
  const router = useRouter();

  const {
    data: csrfData,
    error,
    isLoading,
  } = useSWR("/api/auth/csrf", jsonFetcher);

  const renderLoading = () => {
    return (
      <div className="mt-10 sm:mx-auto sm:w-full sm:max-w-sm text-center">
        <div className="block text-sm font-small leading-6 text-gray-900">
          Loading info from server...
        </div>
      </div>
    );
  };

  const renderError = () => {
    return (
      <div className="mt-10 sm:mx-auto sm:w-full sm:max-w-sm text-center">
        <div className="block text-sm font-small leading-6 text-gray-900">
          {error}
        </div>
      </div>
    );
  };

  const renderForm = () => {
    return (
      <div className="mt-10 sm:mx-auto sm:w-full sm:max-w-sm">
        <Formik
          initialValues={{ code: searchParams.get("code") || "" }}
          validationSchema={Yup.object({
            code: Yup.string()
              .required("Please enter your code")
              .min(8, "Must be 8 characters")
              .max(8, "Must be 8 characters"),
          })}
          onSubmit={async (values, { setSubmitting }) => {
            const res = await signIn("credentials", {
              redirect: false,
              code: values.code,
              callbackUrl: `${window.location.origin}`,
            });
            if (res?.error) {
              setErrorMessage(res.error);
            } else {
              setErrorMessage(undefined);
            }
            if (res?.url) router.push(res.url);
            setSubmitting(false);
          }}
        >
          {(formik) => (
            <form onSubmit={formik.handleSubmit} className="space-y-6">
              <input
                name="csrfToken"
                type="hidden"
                defaultValue={csrfData.csrfToken}
              />

              <div>
                <label
                  htmlFor="code"
                  className="block text-sm font-medium leading-6 text-gray-900"
                >
                  Enter SMS Code
                </label>
                <div className="mt-2">
                  <Field
                    name="code"
                    aria-label="Enter your sms code"
                    aria-required="true"
                    type="text"
                    placeholder="12345678"
                    className="block w-full rounded-md border-0 px-4 py-3.5 text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-indigo-600 sm:text-sm sm:leading-6"
                  />
                </div>
                <div className="text-pink-600 text-sm mt-2">
                  <ErrorMessage name="code" />
                </div>
              </div>

              <div>
                <button
                  type="submit"
                  className="flex w-full justify-center rounded-md bg-blue-600 px-3 py-1.5 text-sm font-semibold leading-6 text-white shadow-sm hover:bg-blue-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
                >
                  {formik.isSubmitting ? "Please wait..." : "Submit Code"}
                </button>
              </div>
            </form>
          )}
        </Formik>
      </div>
    );
  };

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

          {error ? renderError() : isLoading ? renderLoading() : renderForm()}

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
      </>
    </>
  );
}
