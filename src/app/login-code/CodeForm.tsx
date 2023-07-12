"use client";

import classNames from "classnames";
import {
  ErrorMessage,
  Field,
  Form,
  Formik,
  FormikValues,
  useFormikContext
} from "formik";
import { signIn } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import * as Yup from "yup";

export function CodeForm({ csrfToken }: { csrfToken: string }) {
  const [errorMessage, setErrorMessage] = useState<string | null>();
  const router = useRouter();
  const searchParams = useSearchParams();

  const onSubmit = async (values: FormikValues, { setSubmitting }: any) => {
    const res = await signIn("credentials", {
      redirect: false,
      code: values.code,
      callbackUrl: `${window.location.origin}/dashboard`,
    });
    if (res?.error) {
      setErrorMessage(res.error);
    } else {
      setErrorMessage(undefined);
    }
    if (res?.url) router.push(res.url);
    setSubmitting(false);
  };

  return (
    <div className="mt-10 sm:mx-auto sm:w-full sm:max-w-sm">
      <Formik
        initialValues={{ code: searchParams.get("code") || "" }}
        validationSchema={Yup.object({
          code: Yup.string()
            .required("Please enter your code")
            .min(12, "Must be 12 characters")
            .max(12, "Must be 12 characters"),
        })}
        onSubmit={onSubmit}
      >
        {(formik) => (
          <Form onSubmit={formik.handleSubmit} className="space-y-6">
            <AutoSubmit initCode={searchParams.get("code") || ""} />
            <input name="csrfToken" type="hidden" defaultValue={csrfToken} />

            <div>
              <label
                htmlFor="code"
                className="block text-sm font-medium text-center leading-6 text-gray-900"
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
                  className="block w-full rounded-md border-0 px-4 py-3.5 text-center text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-indigo-600 sm:text-sm sm:leading-6"
                />
              </div>
              <div className="text-pink-600 text-sm text-center mt-2">
                <ErrorMessage name="code" />
              </div>
            </div>

            <div>
              <button
                type="submit"
                className={classNames(
                  "flex w-full justify-center rounded-md bg-blue-600 px-3 py-1.5 text-sm font-semibold leading-6 text-white shadow-sm hover:bg-blue-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600",
                  { "opacity-50": formik.isSubmitting }
                )}
              >
                {formik.isSubmitting ? "Please wait..." : "Submit Code"}
              </button>
            </div>

            {errorMessage && (
              <div className="text-pink-600 text-sm text-center mt-2">
                {errorMessage}
              </div>
            )}
          </Form>
        )}
      </Formik>
    </div>
  );
}

function AutoSubmit({ initCode }: { initCode: string }) {
  const { submitForm } = useFormikContext();

  useEffect(() => {
    if (initCode) {
      submitForm();
    }
  }, []);

  return <></>;
}
