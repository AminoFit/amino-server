"use client"

import { useUser } from "@auth0/nextjs-auth0/client"
import { Dialog } from "@headlessui/react"
import { Bars3Icon, XMarkIcon } from "@heroicons/react/24/outline"
import classNames from "classnames"
import { useSession } from "next-auth/react"

import { useState } from "react"

const navigation = [
  { name: "Amino", href: "/" },
  // { name: "Features", href: "#" },
  { name: "Pricing", href: "/pricing" }
]

export default function MarketingNav() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [bannerOpen, setBannerOpen] = useState(false)

  const { user, error, isLoading } = useUser()

  if (isLoading) return <div>Loading...</div>
  if (error) return <div>{error.message}</div>

  const renderLogin = () => {
    if (isLoading) {
      return (
        <a href="#" className="text-sm font-semibold leading-6 text-gray-900">
          Loading...
        </a>
      )
    }
    if (user) {
      return (
        <a href="/dashboard" className="text-sm font-semibold leading-6 text-gray-900">
          My Dashboard ({user.name})
        </a>
      )
    }

    return (
      <a href="/api/auth/login" className="text-sm font-semibold leading-6 text-gray-900">
        Log in&nbsp;<span aria-hidden="true">&rarr;</span>
      </a>
    )
  }

  return (
    <>
      {/* Banner */}
      {bannerOpen && (
        <div className="flex items-center gap-x-6 bg-gray-900 px-6 py-2.5 sm:px-3.5 sm:before:flex-1">
          <p className="text-sm leading-6 text-white">
            <strong className="font-semibold">{"We're still in Beta!"}</strong>
            <svg viewBox="0 0 2 2" className="mx-2 inline h-0.5 w-0.5 fill-current" aria-hidden="true">
              <circle cx={1} cy={1} r={1} />
            </svg>
            {`Amino is just getting off the ground. We're testing cool new stuff,
            but there might be some bugs.`}
          </p>
          <div className="flex flex-1 justify-end">
            <button
              type="button"
              className="-m-3 p-3 focus-visible:outline-offset-[-4px]"
              onClick={() => setBannerOpen(false)}
            >
              <span className="sr-only">Dismiss</span>
              <XMarkIcon className="h-5 w-5 text-white" aria-hidden="true" />
            </button>
          </div>
        </div>
      )}

      {/* Nav portion */}
      <header
        className={classNames("absolute inset-x-0 z-50", {
          "top-10": bannerOpen,
          "top-0": !bannerOpen
        })}
      >
        <nav className="flex items-center justify-between p-6 lg:px-8" aria-label="Global">
          <div className="flex lg:flex-1">
            <a href="/dashboard" className="-m-1.5 p-1.5">
              <span className="sr-only">Your Company</span>
              <img className="h-8 w-auto" src="logos/logo-light.svg" alt="Amino Logo" />
            </a>
          </div>
          <div className="flex lg:hidden">
            <button
              type="button"
              className="-m-2.5 inline-flex items-center justify-center rounded-md p-2.5 text-gray-700"
              onClick={() => setMobileMenuOpen(true)}
            >
              <span className="sr-only">Open main menu</span>
              <Bars3Icon className="h-6 w-6" aria-hidden="true" />
            </button>
          </div>
          <div className="hidden lg:flex lg:gap-x-12">
            {navigation.map((item) => (
              <a key={item.name} href={item.href} className="text-sm font-semibold leading-6 text-gray-900">
                {item.name}
              </a>
            ))}
          </div>
          <div className="hidden lg:flex lg:flex-1 lg:justify-end">{renderLogin()}</div>
        </nav>
        <Dialog as="div" className="lg:hidden" open={mobileMenuOpen} onClose={setMobileMenuOpen}>
          <div className="fixed inset-0 z-50" />
          <Dialog.Panel className="fixed inset-y-0 right-0 z-50 w-full overflow-y-auto bg-white px-6 py-6 sm:max-w-sm sm:ring-1 sm:ring-gray-900/10">
            <div className="flex items-center justify-between">
              <a href="#" className="-m-1.5 p-1.5">
                <span className="sr-only">Your Company</span>
                <img className="h-8 w-auto" src="logos/logo-light.svg" alt="Amino Logo" />
              </a>
              <button
                type="button"
                className="-m-2.5 rounded-md p-2.5 text-gray-700"
                onClick={() => setMobileMenuOpen(false)}
              >
                <span className="sr-only">Close menu</span>
                <XMarkIcon className="h-6 w-6" aria-hidden="true" />
              </button>
            </div>
            <div className="mt-6 flow-root">
              <div className="-my-6 divide-y divide-gray-500/10">
                <div className="space-y-2 py-6">
                  {navigation.map((item) => (
                    <a
                      key={item.name}
                      href={item.href}
                      className="-mx-3 block rounded-lg px-3 py-2 text-base font-semibold leading-7 text-gray-900 hover:bg-gray-50"
                    >
                      {item.name}
                    </a>
                  ))}
                </div>
                <div className="py-6">{renderLogin()}</div>
              </div>
            </div>
          </Dialog.Panel>
        </Dialog>
      </header>
    </>
  )
}
