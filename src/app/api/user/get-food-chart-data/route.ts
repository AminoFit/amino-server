import { getUser } from "@/app/dashboard/settings/actions"
import {
  LoggedFoodItemWithFoodItem,
  getNormalizedFoodValue
} from "@/app/dashboard/utils/FoodHelper"
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

  const yesterday = moment().tz(user.tzIdentifier).subtract(1, "day")

  let foods = (await prisma.loggedFoodItem.findMany({
    where: {
      userId: user.id,
      consumedOn: {
        gte: yesterday.startOf("day").toDate(),
        lt: yesterday.startOf("day").toDate()
      }
    },
    include: {
      FoodItem: true
    }
  })) as LoggedFoodItemWithFoodItem[]

  if (!foods) {
    return new Response("Error loading foods", { status: 500 })
  }

  const groups = _.groupBy(foods, (food) => {
    return moment(food.consumedOn).tz(user.tzIdentifier).format("YYYY-MM-DD")
  })

  let metricsToday = {
    calories: 0,
    carbs: 0,
    fats: 0,
    protein: 0
  }
  let metricsYesterday = {
    calories: 0,
    carbs: 0,
    fats: 0,
    protein: 0
  }

  const todayGroup =
    groups[moment().tz(user.tzIdentifier).format("YYYY-MM-DD")] || []

  for (const foodItem of todayGroup) {
    metricsToday.calories += Math.round(
      getNormalizedFoodValue(foodItem, "kcalPerServing")
    )
    metricsToday.carbs += Math.round(
      getNormalizedFoodValue(foodItem, "carbPerServing")
    )
    metricsToday.fats += Math.round(
      getNormalizedFoodValue(foodItem, "totalFatPerServing")
    )
    metricsToday.protein += Math.round(
      getNormalizedFoodValue(foodItem, "proteinPerServing")
    )
  }
  const yesterdayGroup =
    groups[
      moment().tz(user.tzIdentifier).subtract(1, "day").format("YYYY-MM-DD")
    ] || []

  for (const foodItem of yesterdayGroup) {
    metricsYesterday.calories += Math.round(
      getNormalizedFoodValue(foodItem, "kcalPerServing")
    )
    metricsYesterday.carbs += Math.round(
      getNormalizedFoodValue(foodItem, "carbPerServing")
    )
    metricsYesterday.fats += Math.round(
      getNormalizedFoodValue(foodItem, "totalFatPerServing")
    )
    metricsYesterday.protein += Math.round(
      getNormalizedFoodValue(foodItem, "proteinPerServing")
    )
  }

  const userGoals = {
    calories: user.calorieGoal,
    carbs: user.carbsGoal,
    fats: user.fatGoal,
    protein: user.proteinGoal
  }

  return NextResponse.json({ metricsToday, metricsYesterday, userGoals })
}
