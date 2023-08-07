import SideNav from "./SideNav"
import { getUser } from "./settings/actions"

import { TimeZoneBanner } from "./TimeZoneBanner"
import DashNav from "@/components/DashNav"

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
    <>
      <DashNav />

      <div className="mx-auto max-w-7xl px-3 sm:px-4 lg:px-8 bg-[#19191A]">
        {/* We've used 3xl here, but feel free to try other max-widths based on your needs */}
        <div className="">{children}</div>
      </div>
      <TimeZoneBanner user={user} />
    </>
  )
}
