"use client";

import classNames from "classnames";
import { useState } from "react";
import { PatternFormat } from "react-number-format";

export default function Example() {
  const [phoneNumber, setPhoneNumber] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);

  const handleSubmit = () => {
    console.log(phoneNumber);
    if (!phoneNumber) {
      setError("Please enter a valid phone number");
      return;
    }
    const parsedPhone = phoneNumber
      .replaceAll("_", "")
      .replaceAll("-", "")
      .replaceAll("(", "")
      .replaceAll(")", "")
      .replaceAll(" ", "");
    console.log("parsedPhone", parsedPhone);
    if (parsedPhone.length !== 12) {
      setError("A complete phone number is required");
      return;
    }
    setError("");
    setSubmitting(true);

    // fetch("/api/post-new-customer", {
    //   method: "POST",
    //   headers: {
    //     Accept: "application/json",
    //     "Content-Type": "application/json",
    //   },
    //   body: JSON.stringify({ phone: parsedPhone }),
    // })
    //   .then(async (res) => {
    //     setSubmitting(false);
    //     if (res.status !== 200) {
    //       const json = await res.json();
    //       setError(
    //         json.error ||
    //           "There was an error processing your request. Please try again later."
    //       );
    //       return;
    //     }

    //     // Success
    //     setError("");
    //     setModalOpen(true);
    //   })
    //   .catch((err) => {
    //     setError(
    //       "There was an error processing your request. Please try again later."
    //     );
    //   });
  };

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
            Sign in with a magic link
          </h2>
          <p className="mt-2 text-center text-sm text-gray-700">
            {"We'll text you a link to sign in to your account."}
          </p>
        </div>

        <div className="mt-10 sm:mx-auto sm:w-full sm:max-w-sm">
          <form className="space-y-6" action="#" method="POST">
            <div>
              <label
                htmlFor="email"
                className="block text-sm font-medium leading-6 text-gray-900"
              >
                Phone number
              </label>
              <div className="mt-2">
                <PatternFormat
                  type="tel"
                  format="+1 (###) ###-####"
                  mask="_"
                  value={phoneNumber}
                  onValueChange={(value) =>
                    setPhoneNumber(value.formattedValue)
                  }
                  className={classNames(
                    "block w-full rounded-md border-0 px-4 py-3.5 ring-1 ring-inset placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-blue-600 sm:text-sm sm:leading-6",
                    {
                      "text-gray-900": !error,
                      "ring-gray-300": !error,
                      "text-pink-600": error.length > 0,
                      "ring-pink-600": error.length > 0,
                    }
                  )}
                  placeholder="+1 (555) 987-6543"
                  required
                />
              </div>
              {error && <div className="text-pink-600 text-sm mt-2">{error}</div>}
            </div>

            <div>
              <button
                type="submit"
                onClick={handleSubmit}
                className="flex w-full justify-center rounded-md bg-blue-600 px-3 py-1.5 text-sm font-semibold leading-6 text-white shadow-sm hover:bg-blue-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
              >
                Get Magic Link
              </button>
            </div>
          </form>

          <p className="mt-10 text-center text-sm text-gray-500">
            Not a member?{" "}
            <a
              href="/"
              className="font-semibold leading-6 text-blue-600 hover:text-blue-500"
            >
              Sign up from our homepage
            </a>
          </p>
        </div>
      </div>
    </>
  );
}
