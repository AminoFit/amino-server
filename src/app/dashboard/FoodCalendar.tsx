"use client"

import { ChevronLeftIcon, ChevronRightIcon } from "@heroicons/react/20/solid"
import { LoggedFoodItem, User } from "@prisma/client"
import classNames from "classnames"
import moment from "moment-timezone"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { useState } from "react"

const meetings = [
  {
    id: 1,
    date: "January 10th, 2022",
    time: "5:00 PM",
    datetime: "2022-01-10T17:00",
    name: "Leslie Alexander",
    imageUrl:
      "https://images.unsplash.com/photo-1494790108377-be9c29b29330?ixlib=rb-1.2.1&ixid=eyJhcHBfaWQiOjEyMDd9&auto=format&fit=facearea&facepad=2&w=256&h=256&q=80",
    location: "Starbucks"
  }
  // More meetings...
]
const days = [
  { date: "2021-12-27" },
  { date: "2021-12-28" },
  { date: "2021-12-29" },
  { date: "2021-12-30" },
  { date: "2021-12-31" },
  { date: "2022-01-01", isCurrentMonth: true },
  { date: "2022-01-02", isCurrentMonth: true },
  { date: "2022-01-03", isCurrentMonth: true },
  { date: "2022-01-04", isCurrentMonth: true },
  { date: "2022-01-05", isCurrentMonth: true },
  { date: "2022-01-06", isCurrentMonth: true },
  { date: "2022-01-07", isCurrentMonth: true },
  { date: "2022-01-08", isCurrentMonth: true },
  { date: "2022-01-09", isCurrentMonth: true },
  { date: "2022-01-10", isCurrentMonth: true },
  { date: "2022-01-11", isCurrentMonth: true },
  { date: "2022-01-12", isCurrentMonth: true, isToday: true },
  { date: "2022-01-13", isCurrentMonth: true },
  { date: "2022-01-14", isCurrentMonth: true },
  { date: "2022-01-15", isCurrentMonth: true },
  { date: "2022-01-16", isCurrentMonth: true },
  { date: "2022-01-17", isCurrentMonth: true },
  { date: "2022-01-18", isCurrentMonth: true },
  { date: "2022-01-19", isCurrentMonth: true },
  { date: "2022-01-20", isCurrentMonth: true },
  { date: "2022-01-21", isCurrentMonth: true },
  { date: "2022-01-22", isCurrentMonth: true, isSelected: true },
  { date: "2022-01-23", isCurrentMonth: true },
  { date: "2022-01-24", isCurrentMonth: true },
  { date: "2022-01-25", isCurrentMonth: true },
  { date: "2022-01-26", isCurrentMonth: true },
  { date: "2022-01-27", isCurrentMonth: true },
  { date: "2022-01-28", isCurrentMonth: true },
  { date: "2022-01-29", isCurrentMonth: true },
  { date: "2022-01-30", isCurrentMonth: true },
  { date: "2022-01-31", isCurrentMonth: true },
  { date: "2022-02-01" },
  { date: "2022-02-02" },
  { date: "2022-02-03" },
  { date: "2022-02-04" },
  { date: "2022-02-05" },
  { date: "2022-02-06" }
]

export function FoodCalendar({
  foods,
  user
}: {
  foods: LoggedFoodItem[]
  user: User
}) {
  const [currentMonth, setCurrentMonth] = useState(
    moment().tz(user.tzIdentifier).month() + 1
  )
  const [currentYear, setCurrentYear] = useState(
    moment().tz(user.tzIdentifier).year()
  )

  const searchParams = useSearchParams()

  let selectedDate = moment().tz(user.tzIdentifier)
  if (searchParams.get("date") && moment(searchParams.get("date")).isValid()) {
    selectedDate = moment(searchParams.get("date"))
  }

  const router = useRouter()
  const pathname = usePathname()

  const handleNextMonth = () => {
    const curDate = moment(`${currentMonth} ${currentYear}`, "MM YYYY").utc(
      true
    )
    const nextMonthDate = curDate.clone().add(1, "month")

    setCurrentMonth(nextMonthDate.month() + 1)
    setCurrentYear(nextMonthDate.year())
  }
  const handlePreviousMonth = () => {
    const curDate = moment(`${currentMonth} ${currentYear}`, "MM YYYY").utc(
      true
    )
    const nextMonthDate = curDate.clone().subtract(1, "month")

    setCurrentMonth(nextMonthDate.month() + 1)
    setCurrentYear(nextMonthDate.year())
  }

  const days = getDaysForMonth(currentMonth, currentYear)

  const onClickDay = (day: moment.Moment) => {
    console.log(day.format("YYYY-MM-DD"))
    router.push(`${pathname}?date=${day.format("YYYY-MM-DD")}`)
  }

  return (
    <div className="text-center">
      <div className="flex items-center text-gray-900">
        <button
          type="button"
          onClick={handlePreviousMonth}
          className="-m-1.5 flex flex-none items-center justify-center p-1.5 text-gray-400 hover:text-gray-500"
        >
          <span className="sr-only">Previous month</span>
          <ChevronLeftIcon className="h-5 w-5" aria-hidden="true" />
        </button>
        <div className="flex-auto text-sm font-semibold">
          {moment(currentMonth, "M").format("MMMM")} {currentYear}
        </div>
        <button
          type="button"
          onClick={handleNextMonth}
          className="-m-1.5 flex flex-none items-center justify-center p-1.5 text-gray-400 hover:text-gray-500"
        >
          <span className="sr-only">Next month</span>
          <ChevronRightIcon className="h-5 w-5" aria-hidden="true" />
        </button>
      </div>
      <div className="mt-6 grid grid-cols-7 text-xs leading-6 text-gray-500">
        <div>S</div>
        <div>M</div>
        <div>T</div>
        <div>W</div>
        <div>T</div>
        <div>F</div>
        <div>S</div>
      </div>
      <div className="isolate mt-2 grid grid-cols-7 gap-px rounded-lg bg-gray-200 text-sm shadow ring-1 ring-gray-200">
        {days.map((day, index) => {
          const isCurrentMonth = moment(currentMonth, "M").isSame(day, "month")
          const isToday = moment().isSame(day, "day")
          const isSelected = moment(selectedDate).isSame(day, "day")

          const bgColor = getDarknessForFood(foods, day)

          return (
            <button
              key={day.format()}
              type="button"
              onClick={() => onClickDay(day)}
              className={classNames(
                "py-1.5 hover:bg-gray-100 focus:z-10",
                isCurrentMonth ? "bg-white" : "bg-gray-50",
                (isSelected || isToday) && "font-bold",
                isSelected && "bg-slate-700 hover:bg-slate-800 text-white",
                isToday &&
                  "outline outline-offset-1 outline-2 z-50 outline-blue-500",
                // !isSelected && isCurrentMonth && !isToday && "text-gray-900",
                // !isSelected && !isCurrentMonth && !isToday && "text-gray-400",
                // isToday && !isSelected && "text-indigo-600",
                index === 0 && "rounded-tl-lg",
                index === 6 && "rounded-tr-lg",
                index === days.length - 7 && "rounded-bl-lg",
                index === days.length - 1 && "rounded-br-lg"
              )}
            >
              <div
                className={classNames(
                  "mx-auto flex h-7 w-7 items-center justify-center rounded-full",
                  // isSelected && isToday && "bg-emerald-600",
                  // isSelected && !isToday && "bg-gray-900",
                  // isSelected && "bg-gray-900",
                  bgColor > 0 && `border-2 border-emerald-${bgColor}`
                )}
              >
                {day.date()}
                {/* {bgColor} */}
              </div>
            </button>

            // <div key={day.format()} className={`py-1 bg-sky-${bgColor.toString()}`}>
            //   {day.date()}
            // </div>
          )
        })}
      </div>
    </div>
  )
}

const colors = [
  "bg-emerald-100 bg-emerald-200 bg-emerald-300 bg-emerald-400 bg-emerald-500 bg-emerald-600 bg-emerald-700 bg-emerald-800 bg-emerald-900 ",
  "border-emerald-100 border-emerald-200 border-emerald-300 border-emerald-400 border-emerald-500 border-emerald-600 border-emerald-700 border-emerald-800 border-emerald-900 "
]

function getDaysForMonth(month: number, year: number) {
  let currentDay = moment(`${month} ${year}`, "MM YYYY")
  const days = []

  while (currentDay.weekday() !== 0) {
    currentDay = currentDay.subtract(1, "day")
    days.unshift(currentDay.clone())
  }

  currentDay = moment(`${month} ${year}`, "MM YYYY")

  while (currentDay.month() === month - 1) {
    days.push(currentDay.clone())
    currentDay = currentDay.add(1, "day")
  }

  while (currentDay.weekday() !== 0) {
    days.push(currentDay.clone())
    currentDay = currentDay.add(1, "day")
  }

  return days
}

function getDarknessForFood(foods: LoggedFoodItem[], day: moment.Moment) {
  const dayFoods = foods.filter((food) => {
    return moment(food.consumedOn).isSame(day, "day")
  })

  const totalCalories = dayFoods.reduce((acc, food) => {
    return acc + food.calories
  }, 0)

  return Math.round(Math.min(totalCalories / 3500, 1) * 10) * 100
}
