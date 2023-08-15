"use client"

import { sendMessage } from "@/components/chat/actions"
import { Dialog, Transition } from "@headlessui/react"
import { CheckIcon, ExclamationTriangleIcon, UserPlusIcon } from "@heroicons/react/24/outline"
import { FormEventHandler, Fragment, useRef, useState } from "react"

enum RequestStatus {
  IDLE,
  PENDING,
  SUCCESS,
  ERROR
}

export default function QuickLogFood() {
  const [modalOpen, setModalOpen] = useState(false)
  const [quickLogInput, setQuickLogInput] = useState("")
  const [requestStatus, setRequestStatus] = useState(RequestStatus.IDLE)
  const [requestMessage, setRequestMessage] = useState("")

  const handleSubmit = async (event: any) => {
    event && event.preventDefault()
    console.log("submit")
    setRequestMessage("Please wait...")
    setRequestStatus(RequestStatus.PENDING)
    setModalOpen(true)
    const result = await sendMessage(quickLogInput)
    if (result.error) {
      setRequestMessage(result.error)
      setRequestStatus(RequestStatus.ERROR)
    }
    if (result.message) {
      setRequestMessage(result.message.toString())
      setRequestStatus(RequestStatus.SUCCESS)
    }
    setQuickLogInput("")
  }

  const renderTitle = () => {
    switch (requestStatus) {
      case RequestStatus.PENDING:
        return "Sending..."
      case RequestStatus.SUCCESS:
        return "Logged Your Food!"
      case RequestStatus.ERROR:
        return "Error Logging Request"
      default:
        return "Quick Log Food"
    }
  }
  const renderIcon = () => {
    switch (requestStatus) {
      case RequestStatus.PENDING:
        return (
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-yellow-100">
            <svg
              className="animate-spin h-5 w-5 text-white"
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
            >
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="black"
                stroke-width="4"
              ></circle>
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
              ></path>
            </svg>
          </div>
        )
      case RequestStatus.SUCCESS:
        return (
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-green-100">
            <CheckIcon className="h-6 w-6 text-green-600" aria-hidden="true" />
          </div>
        )
      default:
        return (
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-red-100">
            <ExclamationTriangleIcon className="h-6 w-6 text-red-600" aria-hidden="true" />
          </div>
        )
    }
  }

  return (
    <>
      <form onSubmit={handleSubmit}>
        <label htmlFor="quick-log" className="sr-only">
          Quick log food
        </label>
        <div className="relative">
          <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
            <UserPlusIcon
              className="h-5 w-5 text-gray-400"
              aria-hidden="true"
            />
          </div>
          <input
            id="quick-log"
            name="quick-log"
            className="block w-full rounded-md border-0 bg-[#19191A] py-1.5 pl-10 pr-3 text-gray-200 ring-1 ring-inset ring-zinc-800 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-zinc-600 sm:text-sm sm:leading-6"
            placeholder="Quick Log Food"
            value={quickLogInput}
            onChange={(e) => setQuickLogInput(e.target.value)}
          />
        </div>
      </form>

      <Transition.Root show={modalOpen} as={Fragment}>
        <Dialog
          as="div"
          className="relative z-10"
          onClose={() => setModalOpen(false)}
        >
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
                <Dialog.Panel className="relative transform overflow-hidden rounded-lg bg-zinc-800 px-4 pb-4 pt-5 text-left shadow-xl transition-all sm:my-8 sm:w-full sm:max-w-lg sm:p-6">
                  <div>
                    {renderIcon()}
                    <div className="mt-3 text-center sm:mt-5">
                      <Dialog.Title
                        as="h3"
                        className="text-base font-semibold leading-6 text-gray-200"
                      >
                        {renderTitle()}
                      </Dialog.Title>
                      <div className="mt-2">
                        <p className="text-sm text-gray-400">
                          {requestMessage}
                        </p>
                      </div>
                    </div>
                  </div>
                  <div className="mt-5 sm:mt-6">
                    <button
                      type="button"
                      className="inline-flex w-full justify-center rounded-md bg-amino-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-amino-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amino-600 sm:col-start-2"
                      onClick={() => setModalOpen(false)}
                    >
                      Ok
                    </button>
                  </div>
                </Dialog.Panel>
              </Transition.Child>
            </div>
          </div>
        </Dialog>
      </Transition.Root>
    </>
  )
}

function LoadingSpinner() {
  return (
    <svg
      className="animate-spin h-5 w-5 text-white"
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
    >
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        stroke-width="4"
      ></circle>
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
      ></path>
    </svg>
  )
}
