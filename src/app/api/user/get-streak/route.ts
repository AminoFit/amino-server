
import { getUser } from "@/app/dashboard/settings/actions"
import { prisma } from "@/database/prisma"
import moment from "moment-timezone"
import { NextResponse } from "next/server"
import _ from "underscore"

export async function GET(
  _request: Request // needed so we don't cache this request
) {
  const user = await getUser()

  if (!user) {
    return new Response("User not found", { status: 404 })
  }

  const today = moment().tz(user.tzIdentifier)

  let foods = await prisma.loggedFoodItem.findMany({
    where: {
      userId: user.id
    },
    select: {
      consumedOn: true
    }
  })

  if (!foods) {
    return new Response("Error loading foods", { status: 500 })
  }

  const groups = _.groupBy(foods, (food) => {
    return moment(food.consumedOn).tz(user.tzIdentifier).format("YYYY-MM-DD")
  })

  let streak = 0

  const loggedToday = !!groups[today.format("YYYY-MM-DD")]

  while (true) {
    const date = today.subtract(1, "day").format("YYYY-MM-DD")

    if (!groups[date]) {
      break
    }

    streak++
  }

  if (loggedToday) streak++

  return NextResponse.json({ loggedToday, streak })
}
