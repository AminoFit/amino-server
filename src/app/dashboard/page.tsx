import { prisma } from "@/database/prisma"
import { getServerSession } from "next-auth"
import { authOptions } from "../api/auth/[...nextauth]/auth"
import { FoodLogHeader } from "./FoodLogHeader"
import { FoodTableDesktop } from "./FoodTableDesktop"
import { TableHeader } from "./TableHeader"
import { FoodTableMobile } from "./FoodTableMobile"
import { GraphCalorieChart } from "./GraphCalorieChart"
import { CalorieChart } from "./CalorieChart"
import { signOut } from "next-auth/react"
import { getNormalizedFoodValue } from "./utils/FoodHelper"
import moment from "moment-timezone"

async function getUser() {
  const session = await getServerSession(authOptions)

  if (session) {
    let user = await prisma.user.findUnique({
      where: {
        id: session.user.userId
      }
    })
    return user
  }
  return
}

async function getFoods() {
  const session = await getServerSession(authOptions)

  if (session) {
    let userFoods = await prisma.loggedFoodItem.findMany({
      where: {
        userId: session.user.userId
      },
      include: {
        FoodItem: {
          include: { FoodImage: true }
        }
      }
    })
    return userFoods
  }
  return []
}

export default async function FoodLog() {
  const foods = await getFoods()
  const user = await getUser()

  if (!user) {
    signOut({ redirect: true, callbackUrl: "/login" })
    return <>No user found</>
  }

  const dates: moment.Moment[] = []

  const selectedDate = moment().tz(user.tzIdentifier)

  const labels: string[] = []

  while (dates.length < 7) {
    dates.unshift(moment(selectedDate))
    if (labels.length === 0) {
      labels.unshift("Today")
    } else {
      labels.unshift(selectedDate.format("MMM D"))
    }
    selectedDate.subtract(1, "day")
  }

  const calories: number[] = [0, 0, 0, 0, 0, 0, 0]

  for (const food of foods) {
    const cals = Math.round(getNormalizedFoodValue(food, "kcalPerServing"))

    for (const day of dates) {
      if (moment(food.consumedOn).tz(user.tzIdentifier).isSame(day, "day")) {
        calories[dates.indexOf(day)] += cals
      }
    }
  }

  return (
    <>
      <div className="py-3">
        <div className="lg:flex lg:items-center lg:justify-between mb-10">
          <FoodLogHeader foods={foods} user={user} />
        </div>
        <div>
          {/* <div className="mb-4">
            <GraphCalorieChart calories={calories} labels={labels} />
          </div> */}

          <TableHeader user={user} />
          <FoodTableMobile foods={foods} user={user} />
          <div className="mt-8 flow-root">
            <div className="-mx-4 -my-2 overflow-x-auto sm:-mx-6 lg:-mx-8">
              <div className="inline-block min-w-full py-2 align-middle sm:px-6 lg:px-8">
                <div className="shadow ring-1 ring-black ring-opacity-5 sm:rounded-lg">
                  <FoodTableDesktop foods={foods} user={user} />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
