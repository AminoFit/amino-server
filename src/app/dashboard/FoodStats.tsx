"use client"

import { LoggedFoodItem, FoodItem, User } from "@prisma/client"
import { GraphSemiCircle } from "./GraphSemiCircle"
import { FoodCalendar } from "./FoodCalendar"
import { useSearchParams } from "next/navigation"
import moment from "moment-timezone"
import {
  getNormalizedFoodValue,
  LoggedFoodItemWithFoodItem
} from "./utils/FoodHelper"
import { useState } from "react"
import GoalsDialog from "./EditUserGoals"

export default function FoodStats({
  foods,
  user
}: {
  foods: LoggedFoodItemWithFoodItem[]
  user: User
}) {
  // set up modal state
  const [goalModalOpen, setGoalModalOpen] = useState(false)

  const searchParams = useSearchParams()
  let selectedDate = moment().tz(user.tzIdentifier)

  if (searchParams.get("date") && moment(searchParams.get("date")).isValid()) {
    selectedDate = moment(searchParams.get("date"))
  }

  const filteredFood = foods.filter((food) => {
    return moment(food.consumedOn).isSame(selectedDate, "date")
  })

  const totalCalories = filteredFood.reduce(
    (a, b) => a + getNormalizedFoodValue(b, "kcalPerServing"),
    0
  )
  const totalCarbs = filteredFood.reduce(
    (a, b) => a + getNormalizedFoodValue(b, "carbPerServing"),
    0
  )
  const totalFats = filteredFood.reduce(
    (a, b) => a + getNormalizedFoodValue(b, "totalFatPerServing"),
    0
  )
  const totalProtein = filteredFood.reduce(
    (a, b) => a + getNormalizedFoodValue(b, "proteinPerServing"),
    0
  )
  const goalCalories = 3500
  const goalFats = 250
  const goalCarbs = 250
  const goalProtein = 250

  const cardClasses =
    "row-span-1 overflow-hidden rounded-lg bg-white p-3 shadow"
  return (
    <div>
      <dl className="grid grid-cols-6 gap-6 mt-5">
        <div className={cardClasses}>
          <div className="text-lg font-bold text-pink-500">Calories</div>
          <div className="text-sm text-gray-500">
            {totalCalories.toLocaleString("en-us")}/
            {goalCalories.toLocaleString("en-us")}
          </div>
          <GraphSemiCircle
            percentage={(totalCalories / goalCalories) * 100}
            color="#EC4899"
            label={"Calories"}
          />
        </div>
        <div className={cardClasses}>
          <div className="text-lg font-bold text-emerald-500">Fats</div>
          <div className="text-sm text-gray-500">
            {totalFats.toLocaleString("en-us")}/
            {goalFats.toLocaleString("en-us")}
          </div>
          <GraphSemiCircle
            percentage={(totalFats / goalFats) * 100}
            color="#11B981"
            label={"Fats"}
          />
        </div>
        <div className={cardClasses}>
          <div className="text-lg font-bold text-sky-500">Carbs</div>
          <div className="text-sm text-gray-500">
            {totalCarbs.toLocaleString("en-us")}/
            {goalCarbs.toLocaleString("en-us")}
          </div>
          <GraphSemiCircle
            percentage={(totalCarbs / goalCarbs) * 100}
            color="#0BA5E9"
            label={"Carbs"}
          />
        </div>
        <div className={cardClasses}>
          <div className="text-lg font-bold text-purple-500">Protein</div>
          <div className="text-sm text-gray-500">
            {totalProtein.toLocaleString("en-us")}/
            {goalProtein.toLocaleString("en-us")}
          </div>
          <GraphSemiCircle
            percentage={(totalProtein / goalProtein) * 100}
            color="#A755F7"
            label={"Protein"}
          />
        </div>

        <div className="row-span-2 col-span-2">
          <FoodCalendar foods={foods} user={user} />
        </div>

        <div
          className={
            "col-span-4 overflow-hidden rounded-lg bg-white p-3 shadow relative"
          }
        >
          <div className="absolute top-3 right-3">
            <button
              className="absolute top-3 right-3 text-indigo-600 hover:text-indigo-900 text-sm font-medium"
              onClick={(e) => {
                e.preventDefault()
                console.log("Edit goals button clicked!"); // Console log for debugging
                setGoalModalOpen(true);
              }}
            >
              Edit
            </button>
          </div>
          <div className="text-lg font-bold text-slate-500">Your goals</div>
          <div className="text-sm text-gray-500"></div>
        </div>
      </dl>
      <GoalsDialog
        isOpen={goalModalOpen}
        onRequestClose={() => setGoalModalOpen(false)}
      />
    </div>
  )
}
