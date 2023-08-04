"use client"
import {
  CalendarDaysIcon,
  ChevronLeftIcon,
  ChevronRightIcon
} from "@heroicons/react/24/outline"
import { User } from "@prisma/client"
import moment from "moment-timezone"
import { usePathname, useRouter, useSearchParams } from "next/navigation"

export function TableHeader({ user }: { user: User }) {
  const searchParams = useSearchParams()
  const router = useRouter()
  const pathname = usePathname()

  let selectedDate = moment().tz(user.tzIdentifier)

  if (searchParams.get("date") && moment(searchParams.get("date")).isValid()) {
    const now = moment().tz(user.tzIdentifier)
    selectedDate = moment(searchParams.get("date"))
    selectedDate.set({
      hour: now.hour(),
      minute: now.minute(),
      second: now.second()
    })
  }

  const handleClickPreviousDay = () => {
    const newDate = selectedDate.clone().subtract(1, "day")
    router.push(`${pathname}?date=${newDate.format("YYYY-MM-DD")}`)
  }
  const handleClickNextDay = () => {
    const newDate = selectedDate.clone().add(1, "day")
    router.push(`${pathname}?date=${newDate.format("YYYY-MM-DD")}`)
  }
  const handleClickToday = () => {
    const todayDate = moment().tz(user.tzIdentifier)
    router.push(`${pathname}?date=${todayDate.format("YYYY-MM-DD")}`)
  }

  const renderTimeText = () => {
    if (selectedDate.isSame(moment().tz(user.tzIdentifier), "day")) {
      return "Today"
    }
    return selectedDate.fromNow()
  }

  return (
    <div className="flex justify-center text-center">
      <div className="grow flex justify-center">
        <button
          type="button"
          onClick={handleClickPreviousDay}
          className="flex flex-none items-center justify-center p-2 text-gray-400 hover:text-gray-500"
        >
          <span className="sr-only">Previous day</span>
          <ChevronLeftIcon className="h-5 w-5" aria-hidden="true" />
        </button>
      </div>
      <div onClick={handleClickToday}>
        <h2 className="text-md font-bold leading-7 text-gray-900">
          {moment(selectedDate).tz(user.tzIdentifier).format("dddd, MMMM Do")}
        </h2>
        <div className="text-sm font-light text-gray-500">
          Daily Food Overview
        </div>
        <div className="text-xs font-light text-gray-500/70 mb-4">
          {renderTimeText()}
        </div>
      </div>
      <div className="grow flex justify-center">
        <button
          type="button"
          onClick={handleClickNextDay}
          className="flex flex-none items-center justify-center p-2 text-gray-400 hover:text-gray-500"
        >
          <span className="sr-only">Next day</span>
          <ChevronRightIcon className="h-5 w-5" aria-hidden="true" />
        </button>
      </div>
    </div>
  )
}
