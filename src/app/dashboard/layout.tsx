import SideNav from "./SideNav"
import { getUser } from "./settings/actions"

import { TimeZoneBanner } from "./TimeZoneBanner"
import DashNav from "@/components/DashNav"

import foodBackground from "@/images/backgrounds/food-icon-bg.png"

export default async function Example({
  children
}: {
  children: React.ReactNode
}) {
  const user = await getUser()

  if (!user) {
    return <div className="">No user found</div>
  }

  return (
    <div className="relative isolate bg-white px-1 md:px-6">
      <div
        className="absolute inset-x-0 -top-3 -z-10 transform-gpu overflow-hidden px-36 blur-3xl"
        aria-hidden="true"
      >
        <div
          className="mx-auto aspect-[1155/678] w-[72.1875rem] bg-gradient-to-tr from-[#80ffa7] to-[#fcb489] opacity-30"
          style={{
            clipPath:
              "polygon(74.1% 44.1%, 100% 61.6%, 97.5% 26.9%, 85.5% 0.1%, 80.7% 2%, 72.5% 32.5%, 60.2% 62.4%, 52.4% 68.1%, 47.5% 58.3%, 45.2% 34.5%, 27.5% 76.7%, 0.1% 64.9%, 17.9% 100%, 27.6% 76.8%, 76.1% 97.7%, 74.1% 44.1%)"
          }}
        />
      </div>
      <DashNav />

      <div className="mx-auto max-w-7xl px-0 lg:px-8">
        {/* We've used 3xl here, but feel free to try other max-widths based on your needs */}
        <div className="">{children}</div>
      </div>
      <TimeZoneBanner user={user} />
    </div>
  )
}
