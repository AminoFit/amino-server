export const dynamic = "force-dynamic"

import { getUser } from "@/app/dashboard/settings/actions"
import { prisma } from "@/database/prisma"
import moment from "moment-timezone"
import { NextResponse } from "next/server"

export async function GET(
  request: Request // needed so we don't cache this request
) {
  console.log("COPY MEAL")
  // console.log("params", params)
  // console.log("request", request)
  const url = new URL(request.url)

  const fromDate = url.searchParams.get("fromDate")
  const toDate = url.searchParams.get("toDate")
  const meal = url.searchParams.get("meal") || ""

  const user = await getUser()

  // Validate user
  if (!user) {
    return new Response("User not found", { status: 404 })
  }

  // Validate fromDate
  if (!fromDate) {
    return new Response("No fromDate provided", { status: 400 })
  }

  const parsedFromDate = moment.tz(fromDate, "YYYY-MM-DD", user.tzIdentifier)

  if (!parsedFromDate.isValid()) {
    return new Response(
      "Provided fromDate is invalid. Must be in YYYY-MM-DD format",
      { status: 400 }
    )
  }

  // Validate toDate
  if (!toDate) {
    return new Response("No toDate provided", { status: 400 })
  }

  const parsedToDate = moment.tz(toDate, "YYYY-MM-DD", user.tzIdentifier)

  if (!parsedToDate.isValid()) {
    return new Response(
      "Provided toDate is invalid. Must be in YYYY-MM-DD format",
      { status: 400 }
    )
  }

  // Validate meal

  const meals = ["breakfast", "lunch", "dinner"]

  if (!meals.includes(meal)) {
    return new Response(
      "Provided meal is invalid. Must be one of breakfast, lunch, or dinner",
      { status: 400 }
    )
  }

  let fromHour = 0
  let toHour = 0

  switch (meal) {
    case "breakfast":
      fromHour = 0
      toHour = 10
      break
    case "lunch":
      fromHour = 10
      toHour = 15
      break
    case "dinner":
      fromHour = 15
      toHour = 24
      break
  }

  console.log("fromHour", fromHour)

  // Get all logged food items for the user on the provided date at the provided meal
  let foods = await prisma.loggedFoodItem.findMany({
    where: {
      userId: user.id,
      consumedOn: {
        gte: parsedFromDate
          .startOf("day")
          .clone()
          .add(fromHour, "hours")
          .toDate(),
        lt: parsedFromDate.startOf("day").clone().add(toHour, "hours").toDate()
      }
    },
    include: {
      FoodItem: {
        include: { Servings: true, FoodImage: true }
      }
    }
  })

  for (const yesterdayFoodItem of foods) {
    const consumedOn = moment(yesterdayFoodItem.consumedOn)
      .set("year", parsedToDate.year())
      .set("month", parsedToDate.month())
      .set("date", parsedToDate.date())
      .toDate()
    // Create a new logged food item for the user on the provided date at the provided meal
    await prisma.loggedFoodItem.create({
      data: {
        userId: user.id,
        consumedOn,
        foodItemId: yesterdayFoodItem.foodItemId,
        servingId: yesterdayFoodItem.servingId,
        grams: yesterdayFoodItem.grams,
        status: yesterdayFoodItem.status,
        servingAmount: yesterdayFoodItem.servingAmount,
        loggedUnit: yesterdayFoodItem.loggedUnit,
      }
    })
  }

  return NextResponse.json(foods)
}
