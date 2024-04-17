"use client"

import {
  ChevronRightIcon
} from "@heroicons/react/20/solid"
import {
  MicrophoneIcon as MicrophoneOutlineIcon,
  PhotoIcon as PhotoOutlineIcon,
  ChatBubbleBottomCenterTextIcon as ChatBubbleOutlineIcon,
  SparklesIcon as SparklesOutlineIcon
} from "@heroicons/react/24/outline";
import Footer from "./Footer"
import MarketingNav, { AppleLogo } from "./MarketingNav"

import { Disclosure } from '@headlessui/react'
import { sendGAEvent } from '@next/third-parties/google'

const features = [
  {
    name: 'AI-Powered Logging',
    description:
      `Stop searching endless lists of foods. Amino handles inputs such as 'half an avocado' or 'one cup of fat free milk' and will find the correct nutritional info.`,
    icon: SparklesOutlineIcon,
  },
  {
    name: 'Photo Input',
    description:
      'Tired of typing? Simply snap a photo of your meal and our AI will analyze it to log nutritional information automatically.',
    icon: PhotoOutlineIcon,
  },
  {
    name: 'Voice Input',
    description:
      'Photo not practical? Just say what you ate and Amino will handle the rest.',
    icon: MicrophoneOutlineIcon,
  },
  {
    name: 'Text Input',
    description:
      'Alternatively just enter a description of your meal such as "two an apples" or "one venti latte from starbucks".',
    icon: ChatBubbleOutlineIcon,
  }
];

function FeaturesSection() {
  return (
    <section className="bg-white py-12">
      <div className="mx-auto max-w-4xl px-6 text-center">
        <h2 className="text-2xl font-bold text-gray-900 sm:text-3xl">
          Amino is the easiest way to log food
        </h2>
        <dl className="mt-10 grid grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-4">
          {features.map((feature) => (
            <div key={feature.name} className="flex flex-col items-center text-center">
              <feature.icon className="h-12 w-12 text-indigo-500" aria-hidden="true" />
              <dt className="mt-6 text-lg font-semibold text-gray-900">
                {feature.name}
              </dt>
              <dd className="mt-2 text-base text-gray-500">
                {feature.description}
              </dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}

const faqs = [
  {
    question: "What is Amino?",
    answer: (
      <span>
        Amino is an AI-powered food-logging app that allows you to log your food intake using text, voice, or a picture. Unlike other apps, you don&apos;t need to search many lists or spend hours trying to figure out how to calculate your portion size.
      </span>
    ),
  },
  {
    question: "Do I need a subscription?",
    answer: (
      <span>
        Each Amino user gets a free week trial after which a monthly subscription is required.
      </span>
    ),
  },
  {
    question: "How can we provide feedback?",
    answer: (
      <span>
        We&apos;d love to hear your feedback! You can reach out to us at <a href="mailto:info@amino.fit" className="underline hover:text-blue-600 text-blue-500">info@amino.fit</a> or submit feedback on our <a href="https://aminofit.featurebase.app" className="underline hover:text-blue-600 text-blue-500">Featurebase</a>.
      </span>
    ),
  }
];

function FAQSection() {
  return (<section className="bg-gray-50 py-12">
    <div className="mx-auto max-w-4xl px-6 text-center">
      <h2 className="text-2xl font-bold text-gray-900 sm:text-3xl">
        Frequently Asked Questions
      </h2>
      <dl className="mt-10 space-y-6 divide-y divide-gray-200">
        {faqs.map((faq) => (
          <Disclosure as="div" key={faq.question} defaultOpen={true} className="pt-6">
            {({ open }) => (
              <>
                <dt>
                  <Disclosure.Button className="flex w-full items-start justify-between text-left text-gray-900">
                    <span className="text-base font-semibold leading-7">{faq.question}</span>
                    <span className="ml-6 flex h-7 items-center">
                      <ChevronRightIcon className={`h-5 w-5 transform transition-transform duration-200 ${open ? 'rotate-90' : ''}`} aria-hidden="true" />
                    </span>
                  </Disclosure.Button>
                </dt>
                <Disclosure.Panel as="dd" className="mt-2 pr-12 text-left transition-opacity duration-500 ease-in-out">
                  <p className={`text-base leading-7 text-gray-500 transition-opacity duration-700 ease-in-out ${open ? 'opacity-100' : 'opacity-0'}`}>
                    {faq.answer}
                  </p>
                </Disclosure.Panel>
              </>
            )}
          </Disclosure>
        ))}
      </dl>

    </div>
  </section>)
}



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
            <div className="mx-auto max-w-7xl px-6 pt-10 lg:flex lg:px-8 lg:py-20">
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
                  Food logging doesn&apos;t have to be complicated
                </h1>
                <p className="mt-6 text-lg leading-8 text-gray-600">
                  Amino&apos;AI makes food logging a breeze by allowing you to snap a picture or just tell it what you ate. That&apos;s it. Track your daily intake and get a better understanding of your diet.
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
                />
              </div>
            </div>
          </div>
          <FeaturesSection />
          {/* Frequently Asked Questions Section */}
          <FAQSection />
        </main>

        <Footer />
      </div>
    </>
  )
}
