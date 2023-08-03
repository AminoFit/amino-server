"use client"
import { CalendarDaysIcon } from "@heroicons/react/24/outline"
import { User } from "@prisma/client"
import moment from "moment-timezone"
import { useSearchParams } from "next/navigation"

export function TableHeader({ user }: { user: User }) {
  const searchParams = useSearchParams()
  let selectedDate = moment().tz(user.tzIdentifier)

  if (searchParams.get("date") && moment(searchParams.get("date")).isValid()) {
    selectedDate = moment(searchParams.get("date"))
  }

  return (
    <div className="flex justify-center text-center">
      <div>
        <h2 className="text-md font-bold leading-7 text-gray-900">
          {moment(selectedDate).tz(user.tzIdentifier).format("dddd, MMMM Do")}
        </h2>
        <div className="text-sm font-light text-gray-500 mb-4">
          Daily Food Overview
        </div>
      </div>
    </div>
  )
}
