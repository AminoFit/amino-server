import moment from "moment-timezone"
import { NextResponse } from "next/server"
import _ from "underscore"

export async function GET(
  _request: Request // needed so we don't cache this request
) {
  // const user = await getUser()

  // if (!user) {
  //   return new Response("User not found", { status: 404 })
  // }

  // let foods = await pris.loggedFoodItem.findMany({
  //   where: {
  //     userId: user.id
  //   },
  //   select: {
  //     consumedOn: true
  //   }
  // })

  // if (!foods) {
  //   return new Response("Error loading foods", { status: 500 })
  // }

  // const groups = _.groupBy(foods, (food) => {
  //   return moment(food.consumedOn).tz(user.tzIdentifier).format("YYYY-MM-DD")
  // })

  // let streak = 0

  // const day = moment().tz(user.tzIdentifier)

  // const loggedToday = !!groups[day.format("YYYY-MM-DD")]

  // while (true) {
  //   const dateString = day.subtract(1, "day").format("YYYY-MM-DD")

  //   if (!groups[dateString]) {
  //     break
  //   }

  //   streak++
  // }

  // if (loggedToday) streak++

  return NextResponse.json({ loggedToday: true, streak: 4 })
}
