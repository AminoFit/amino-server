"use client"

import { LoggedFoodItem, FoodItem, User } from "@prisma/client"
import { GraphSemiCircle } from "./GraphSemiCircle"
import { FoodCalendar } from "./FoodCalendar"
import { useSearchParams } from "next/navigation"
import moment from "moment-timezone"

type LoggedFoodItemWithFoodItem = LoggedFoodItem & { FoodItem: FoodItem }

function getNormalizedValue(
  LoggedFoodItem: LoggedFoodItemWithFoodItem,
  value: string
) {
  const nutrientPerServing =
    (LoggedFoodItem.FoodItem[
      value as keyof typeof LoggedFoodItem.FoodItem
    ] as number) || 0
  const gramsPerServing = LoggedFoodItem.FoodItem.defaultServingWeightGram || 1
  const grams = LoggedFoodItem.grams || 1
  return (nutrientPerServing / gramsPerServing) * grams
}

export default function FoodStats({
  foods,
  user
}: {
  foods: LoggedFoodItemWithFoodItem[]
  user: User
}) {
  const searchParams = useSearchParams()
  let selectedDate = moment().tz(user.tzIdentifier)

  if (searchParams.get("date") && moment(searchParams.get("date")).isValid()) {
    selectedDate = moment(searchParams.get("date"))
  }

  const filteredFood = foods.filter((food) => {
    return moment(food.consumedOn).isSame(selectedDate, "date")
  })

  const totalCalories = filteredFood.reduce((a, b) => a + getNormalizedValue(b, 'kcalPerServing'), 0)
  const totalCarbs = filteredFood.reduce((a, b) => a + getNormalizedValue(b, 'carbPerServing'), 0)
  const totalFats = filteredFood.reduce((a, b) => a + getNormalizedValue(b, 'totalFatPerServing'), 0)
  const totalProtein = filteredFood.reduce((a, b) => a + getNormalizedValue(b, 'proteinPerServing'), 0)
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
            "col-span-4 overflow-hidden rounded-lg bg-white p-3 shadow"
          }
        >
          <div className="text-lg font-bold text-slate-500">
            Some other info here
          </div>
          <div className="text-sm text-gray-500">
            {totalCarbs.toLocaleString("en-us")}/
            {goalCarbs.toLocaleString("en-us")}
          </div>
        </div>
      </dl>
    </div>
  )
}
