"use client";

import { PatternFormat } from "react-number-format";

import { Fragment, useState } from "react";
import classNames from "classnames";
import { Dialog, Transition } from "@headlessui/react";
import { CheckIcon } from "@heroicons/react/24/outline";

export function PhoneForm() {
  const [phoneNumber, setPhoneNumber] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [modalOpen, setModalOpen] = useState(true);

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

    fetch("/api/post-new-customer", {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ phone: parsedPhone }),
    })
      .then(async (res) => {
        setSubmitting(false);
        if (res.status !== 200) {
          const json = await res.json();
          setError(
            json.error ||
              "There was an error processing your request. Please try again later."
          );
          return;
        }
        
        // Success
        setError("");
        setModalOpen(true);
      })
      .catch((err) => {
        setError(
          "There was an error processing your request. Please try again later."
        );
      });
  };

  return (
    <div>
      <label
        htmlFor="phone-number"
        className="block text-sm font-medium leading-6 text-gray-900 mt-8"
      >
        Get Started With Your Phone Number
      </label>
      <div>
        <div className="relative mt-2 rounded-md shadow-sm">
          <PatternFormat
            type="tel"
            format="+1 (###) ###-####"
            mask="_"
            onValueChange={(value) => setPhoneNumber(value.formattedValue)}
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
      <div className="mt-5 flex items-center gap-x-6">
        <button
          onClick={handleSubmit}
          disabled={submitting}
          className="rounded-md bg-blue-600 px-3.5 py-2.5 text-sm font-semibold text-white shadow-sm disabled:bg-blue-300 hover:bg-blue-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
        >
          {submitting ? "Sending..." : "Get started"}
        </button>
      </div>

      {/* Complete Modal */}
      <Transition.Root show={modalOpen} as={Fragment}>
        <Dialog as="div" className="relative z-10" onClose={setModalOpen}>
          <Transition.Child
            as={Fragment}
            enter="ease-out duration-300"
            enterFrom="opacity-0"
            enterTo="opacity-100"
            leave="ease-in duration-200"
            leaveFrom="opacity-100"
            leaveTo="opacity-0"
          >
            <div className="fixed inset-0 bg-gray-500 bg-opacity-75 transition-opacity" />
          </Transition.Child>

          <div className="fixed inset-0 z-10 overflow-y-auto">
            <div className="flex min-h-full items-end justify-center p-4 text-center sm:items-center sm:p-0">
              <Transition.Child
                as={Fragment}
                enter="ease-out duration-300"
                enterFrom="opacity-0 translate-y-4 sm:translate-y-0 sm:scale-95"
                enterTo="opacity-100 translate-y-0 sm:scale-100"
                leave="ease-in duration-200"
                leaveFrom="opacity-100 translate-y-0 sm:scale-100"
                leaveTo="opacity-0 translate-y-4 sm:translate-y-0 sm:scale-95"
              >
                <Dialog.Panel className="relative transform overflow-hidden rounded-lg bg-white px-4 pb-4 pt-5 text-left shadow-xl transition-all sm:my-8 sm:w-full sm:max-w-sm sm:p-6">
                  <div>
                    <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-green-100">
                      <CheckIcon
                        className="h-6 w-6 text-green-600"
                        aria-hidden="true"
                      />
                    </div>
                    <div className="mt-3 text-center sm:mt-5">
                      <Dialog.Title
                        as="h3"
                        className="text-base font-semibold leading-6 text-gray-900"
                      >
                        Welcome to Amino!
                      </Dialog.Title>
                      <div className="mt-2">
                        <p className="text-sm text-gray-500">
                          We sent you a text message. Please follow the
                          instructions to get started.
                        </p>
                      </div>
                    </div>
                  </div>
                  <div className="mt-5 sm:mt-6">
                    <button
                      type="button"
                      className="inline-flex w-full justify-center rounded-md bg-indigo-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600"
                      onClick={() => setModalOpen(false)}
                    >
                      Close
                    </button>
                  </div>
                </Dialog.Panel>
              </Transition.Child>
            </div>
          </div>
        </Dialog>
      </Transition.Root>
    </div>
  );
}
