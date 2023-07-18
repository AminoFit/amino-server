"use client"

import { LoggedFoodItem, FoodItem, User } from "@prisma/client"
import moment from "moment-timezone"
import { useSearchParams } from "next/navigation"

import _ from "underscore"

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

export function FoodTable({
  foods,
  user
}: {
  foods: LoggedFoodItemWithFoodItem[]
  user: User
}) {
  const searchParams = useSearchParams()

  //filter foods by date
  let selectedDate = moment().tz(user.tzIdentifier)
  if (searchParams.get("date") && moment(searchParams.get("date")).isValid()) {
    selectedDate = moment(searchParams.get("date"))
  }

  // make object that only has for the selected date
  const foodsFiltered = (foods || []).filter((food) => {
    const consumptionTime = moment(food.consumedOn).tz(user.tzIdentifier)
    return consumptionTime.isSame(selectedDate, "day")
  })

  const groups = _.chain(foodsFiltered)
    .filter((food) => {
      const consumptionTime = moment(food.consumedOn).tz(user.tzIdentifier)

      let selectedDate = moment().tz(user.tzIdentifier)
      if (
        searchParams.get("date") &&
        moment(searchParams.get("date")).isValid()
      ) {
        selectedDate = moment(searchParams.get("date"))
      }

      return consumptionTime.isSame(selectedDate, "day")
    })
    .groupBy((food) => {
      const consumptionTime = moment(food.consumedOn).tz(user.tzIdentifier)
      if (consumptionTime.hour() < 5 || consumptionTime.hour() > 22) {
        return "midnight snack"
      }
      if (consumptionTime.hour() < 11) {
        return "breakfast"
      }
      if (consumptionTime.hour() < 15) {
        return "lunch"
      }
      return "dinner"
    })
    .value()

  const foodGroups = ["breakfast", "lunch", "dinner", "midnight snack"]

  return (
    <table className="min-w-full divide-y divide-gray-300">
      <thead className="bg-gray-50">
        <tr>
          <th
            scope="col"
            className="py-3.5 pl-4 pr-3 text-left text-sm font-semibold text-gray-900 sm:pl-6"
          >
            Time
          </th>
          <th
            scope="col"
            className="py-3.5 pl-4 pr-3 text-left text-sm font-semibold text-gray-900 sm:pl-6"
          >
            Name
          </th>
          <th
            scope="col"
            className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900"
          >
            Fat
          </th>
          <th
            scope="col"
            className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900"
          >
            Carbohydrates
          </th>
          <th
            scope="col"
            className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900"
          >
            Protein
          </th>
          <th
            scope="col"
            className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900"
          >
            Calories
          </th>
          <th scope="col" className="relative py-3.5 pl-3 pr-4 sm:pr-6">
            <span className="sr-only">Edit</span>
          </th>
        </tr>
      </thead>
      <tbody className="divide-y divide-gray-200 bg-white">
        {foodGroups.map((foodGroup) => {
          if (!groups[foodGroup]) return null
          return (
            <>
              <tr className="border-t border-gray-200 ">
                <th
                  colSpan={7}
                  scope="colgroup"
                  className="bg-slate-300 py-1 pl-4 pr-3 sm:pl-6 text-center text-xs font-bold text-slate-800"
                >
                  {foodGroup.toUpperCase()}
                </th>
              </tr>
              {groups[foodGroup].map((foodItem) => (
                <FoodRow foodItem={foodItem} user={user} key={foodItem.id} />
              ))}
            </>
          )
        })}
        <tr className="border-t border-gray-200 text-left bg-gray-50 ">
          <th className="px-4 py-3.5 text-sm font-semibold text-gray-900"></th>
          <th className="px-4 py-3.5 text-sm font-semibold text-gray-900"></th>
          <th className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">
            {foodsFiltered
              .reduce(
                (a, b) => a + getNormalizedValue(b, "totalFatPerServing"),
                0
              )
              .toLocaleString()}
            g Fat
          </th>
          <th className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">
            {foodsFiltered.reduce((a, b) => a + getNormalizedValue(b, "carbPerServing"), 0).toLocaleString()}sg Carbs
          </th>
          <th className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">
            {foodsFiltered.reduce((a, b) => a + getNormalizedValue(b, "proteinPerServing"),0).toLocaleString()}g Protein
          </th>
          <th className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">
            {foodsFiltered.reduce((a, b) => a + getNormalizedValue(b, "kcalPerServing"), 0).toLocaleString()}
            g Calories
          </th>
          <th className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900"></th>
        </tr>
      </tbody>
    </table>
  )
}

export function FoodRow({
  foodItem,
  user
}: {
  foodItem: LoggedFoodItemWithFoodItem
  user: User
}) {
  return (
    <tr key={foodItem.id}>
      <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500 text-right">
        <div className="text-gray-700">
          {moment(foodItem.consumedOn).tz(user.tzIdentifier).format("h:mm a")}
        </div>
        <div className="text-xs">
          {moment(foodItem.consumedOn).tz(user.tzIdentifier).fromNow()}
        </div>
      </td>
      <td className="whitespace-nowrap py-4 pl-4 pr-3 sm:pl-6">
        <div className="text-xs font-light text-gray-500">
          {foodItem.servingAmount} {foodItem.loggedUnit}
        </div>
        <div className="text-md font-medium text-gray-900 capitalize">
          {foodItem.FoodItem.name}
        </div>
      </td>
      <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500">
        {Math.round(getNormalizedValue(foodItem, "totalFatPerServing")).toLocaleString()}g
        Fat
      </td>
      <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500">
        {Math.round(getNormalizedValue(foodItem, "carbPerServing")).toLocaleString()}g Carb
      </td>
      <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500">
        {Math.round(getNormalizedValue(foodItem, "proteinPerServing")).toLocaleString()}g
        Protein
      </td>
      <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500">
        {Math.round(getNormalizedValue(foodItem, "kcalPerServing")).toLocaleString()}{" "}
        Calories
      </td>
      <td className="relative whitespace-nowrap py-4 pl-3 pr-4 text-right text-sm font-medium sm:pr-6">
        <a href="#" className="text-indigo-600 hover:text-indigo-900">
          Edit<span className="sr-only">, {foodItem.FoodItem.name}</span>
        </a>
      </td>
    </tr>
  )
}
