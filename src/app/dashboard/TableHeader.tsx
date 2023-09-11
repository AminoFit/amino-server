"use client"
import { ChevronLeftIcon, ChevronRightIcon } from "@heroicons/react/24/outline"
import moment from "moment-timezone"
import { usePathname, useRouter, useSearchParams } from "next/navigation"

export function TableHeader() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const pathname = usePathname()

  let selectedDate = moment()

  if (searchParams.get("date") && moment(searchParams.get("date")).isValid()) {
    const now = moment()
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
    const todayDate = moment()
    router.push(`${pathname}?date=${todayDate.format("YYYY-MM-DD")}`)
  }

  const renderTimeText = () => {
    if (selectedDate.isSame(moment(), "day")) {
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
        <div className="font-display text-2xl tracking-tight text-slate-900 sm:text-4xl">
          Daily Food Overview
        </div>
        <div className="text-lg tracking-tight text-slate-700">
          {moment(selectedDate).format("dddd, MMMM Do")}
        </div>
        <div className="text-sm font-medium text-slate-600 mb-4">
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
