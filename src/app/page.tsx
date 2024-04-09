"use client"

import { ChevronRightIcon } from "@heroicons/react/20/solid"
import Footer from "./Footer"
import MarketingNav, { AppleLogo } from "./MarketingNav"
import { sendGAEvent } from '@next/third-parties/google'

export default function Example() {
  const trackAppLinkClick = () => {
    sendGAEvent({
      event: 'conversion',
      value: 'app_store_link_click',
    });
  };

  return (
    <>
    <div className="bg-white">
      {/* Header */}
      <MarketingNav />
      <main>
        {/* Hero section */}
        <div className="relative isolate overflow-hidden bg-white">
          <div className="mx-auto max-w-7xl px-6 pb-24 pt-10 sm:pb-32 lg:flex lg:px-8 lg:py-40">
            <div className="mx-auto max-w-2xl lg:mx-0 lg:max-w-xl lg:flex-shrink-0 lg:pt-8 lg:ml-12">
              <div className="mt-24 sm:mt-32 lg:mt-16">
                <a href="#" className="inline-flex space-x-6">
                  <span className="rounded-full bg-indigo-600/10 px-3 py-1 text-sm font-semibold leading-6 text-indigo-600 ring-1 ring-inset ring-indigo-600/10">
                    {"What's new"}
                  </span>
                  <span className="inline-flex items-center space-x-2 text-sm font-medium leading-6 text-gray-600">
                    <span>Just shipped v1.0</span>
                    <ChevronRightIcon className="h-5 w-5 text-gray-400" aria-hidden="true" />
                  </span>
                </a>
              </div>
              <h1 className="mt-10 text-4xl font-bold tracking-tight text-gray-900 sm:text-6xl">
                Track your diet with confidence
              </h1>
              <p className="mt-6 text-lg leading-8 text-gray-600">
                Quick and easy food logging with simple text input. Refine the results to match your meal, and track
                your progress over time.
              </p>
              <div className="mt-10 flex items-center gap-x-6">
                <a
                  type="button"
                  target="_blank"
                  rel="noopener noreferrer"
                  href="https://apps.apple.com/us/app/amino-fitness/id6472242486"
                  className=" flex items-center align-middle rounded-md bg-gray-900 px-5 py-3 text-sm font-semibold text-white hover:bg-gray-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600"
                  onClick={trackAppLinkClick}
                >
                  <AppleLogo /> Download App
                </a>
              </div>
            </div>
            <div className="mx-auto mt-16 flex justify-center max-w-2xl sm:mt-24 lg:ml-10 lg:mr-0 lg:mt-0 lg:max-w-none lg:flex-none xl:ml-32">
              <img
                src="/amino-app.png"
                alt="App screenshot"
                width={340}
                // height={894}
                // className="w-[76rem] rounded-md shadow-2xl ring-1 ring-gray-900/10"
              />
            </div>
          </div>
        </div>
      </main>

      <Footer />
    </div>
    </>
  )
}
