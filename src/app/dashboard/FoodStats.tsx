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
import { PencilSquareIcon } from "@heroicons/react/24/outline"

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
  const [goalCalories, setGoalCalories] = useState(user.calorieGoal || 3500)
  const [goalFats, setGoalFats] = useState(user.fatGoal || 250)
  const [goalCarbs, setGoalCarbs] = useState(user.carbsGoal || 250)
  const [goalProtein, setGoalProtein] = useState(user.proteinGoal || 250)

  const cardClasses =
    "row-span-1 overflow-hidden rounded-lg bg-white p-3 shadow"
  return (
    <div>
      <dl className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-6 mt-5">
        <div className={cardClasses}>
          <div className="flex justify-between">
            <div className="text-lg font-bold" style={{ color: "#ef470c" }}>
              Calories
            </div>
            <div>
              <a
                href="#"
                onClick={(e) => {
                  e.preventDefault()
                  console.log("Edit goals button clicked!") // Console log for debugging
                  setGoalModalOpen(true)
                }}
              >
                <PencilSquareIcon className="mt-1 h-4 w-4 text-stone-700/50" />
              </a>
            </div>
          </div>

          <div className="text-sm text-gray-500">
            {totalCalories.toLocaleString("en-us")}/
            {goalCalories.toLocaleString("en-us")}
          </div>
          <GraphSemiCircle
            percentage={(totalCalories / goalCalories) * 100}
            color="#ef470c"
            label={"Calories"}
          />
        </div>
        <div className={cardClasses}>
          <div className="flex justify-between">
            <div className="text-lg font-bold" style={{ color: "#92ba3a" }}>
              Fats
            </div>
            <div>
              <a
                href="#"
                onClick={(e) => {
                  e.preventDefault()
                  console.log("Edit goals button clicked!") // Console log for debugging
                  setGoalModalOpen(true)
                }}
              >
                <PencilSquareIcon className="mt-1 h-4 w-4 text-stone-700/50" />
              </a>
            </div>
          </div>
          <div className="text-sm text-gray-500">
            {totalFats.toLocaleString("en-us")}/
            {goalFats.toLocaleString("en-us")}
          </div>
          <GraphSemiCircle
            percentage={(totalFats / goalFats) * 100}
            color="#92ba3a"
            label={"Fats"}
          />
        </div>
        <div className={cardClasses}>
          <div className="flex justify-between">
            <div className="text-lg font-bold" style={{ color: "#384147" }}>
              Carbs
            </div>
            <div>
              <a
                href="#"
                onClick={(e) => {
                  e.preventDefault()
                  console.log("Edit goals button clicked!") // Console log for debugging
                  setGoalModalOpen(true)
                }}
              >
                <PencilSquareIcon className="mt-1 h-4 w-4 text-stone-700/50" />
              </a>
            </div>
          </div>

          <div className="text-sm text-gray-500">
            {totalCarbs.toLocaleString("en-us")}/
            {goalCarbs.toLocaleString("en-us")}
          </div>
          <GraphSemiCircle
            percentage={(totalCarbs / goalCarbs) * 100}
            color="#384147"
            label={"Carbs"}
          />
        </div>
        <div className={cardClasses}>
          <div className="flex justify-between">
            <div className="text-lg font-bold" style={{ color: "#899384" }}>
              Protein
            </div>
            <div>
              <a
                href="#"
                onClick={(e) => {
                  e.preventDefault()
                  console.log("Edit goals button clicked!") // Console log for debugging
                  setGoalModalOpen(true)
                }}
              >
                <PencilSquareIcon className="mt-1 h-4 w-4 text-stone-700/50" />
              </a>
            </div>
          </div>

          <div className="text-sm text-gray-500">
            {totalProtein.toLocaleString("en-us")}/
            {goalProtein.toLocaleString("en-us")}
          </div>
          <GraphSemiCircle
            percentage={(totalProtein / goalProtein) * 100}
            color="#899384"
            label={"Protein"}
          />
        </div>

        <div className="hidden lg:block lg:row-span-2 lg:col-span-2">
          <FoodCalendar foods={foods} user={user} />
        </div>

        <div className={"hidden lg:block col-span-2 md:col-span-4 overflow-hidden rounded-lg bg-white"}>
          <div className="flex text-sm leading-7 text-gray-600">
            Current Goal{" "}
            <a
              className="ml-2"
              href="#"
              onClick={(e) => {
                e.preventDefault()
                console.log("Edit goals button clicked!") // Console log for debugging
                setGoalModalOpen(true)
              }}
            >
              <PencilSquareIcon className="mt-1 h-4 w-4 text-stone-700/50" />
            </a>
          </div>
          <div className="text-2xl font-bold leading-9 tracking-tight text-gray-900">
            {user.fitnessGoal}
          </div>
        </div>
      </dl>
      <GoalsDialog
        isOpen={goalModalOpen}
        onRequestClose={(
          calorieGoal: number,
          fatGoal: number,
          carbsGoal: number,
          proteinGoal: number
        ) => {
          setGoalModalOpen(false)
          setGoalCalories(calorieGoal || 3500)
          setGoalFats(fatGoal || 250)
          setGoalCarbs(carbsGoal || 250)
          setGoalProtein(proteinGoal || 250)
        }}
        user={user}
      />
    </div>
  )
}
