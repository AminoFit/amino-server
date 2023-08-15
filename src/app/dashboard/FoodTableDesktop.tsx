"use client"

import { User } from "@prisma/client"
import moment from "moment-timezone"
import Image from "next/image"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import {
  getNormalizedFoodValue,
  LoggedFoodItemWithFoodItem
} from "./utils/FoodHelper"

import _ from "underscore"
import React, { useState } from "react"
import EditFoodModal from "./EditFoodModal"
import DeleteFoodModal from "./DeleteFoodModal"
import { deleteSavedFood } from "./utils/DeleteLoggedFoodHelper"

export function FoodTableDesktop({
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

  const filteredFood = _.filter(foods, (food) => {
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

  const groups = _.chain(filteredFood)
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
    <table className="hidden lg:table min-w-full">
      <thead className="bg-zinc-500/50 text-zinc-200 font-semibold text-sm text-left">
        <tr>
          <th scope="col"></th>
          <th
            scope="col"
            className="py-3.5 pl-4 pr-3 text-center sm:pl-6"
          >
            Time
          </th>
          <th
            scope="col"
            className="py-3.5 pl-4 pr-3 sm:pl-6"
          >
            Name
          </th>
          <th
            scope="col"
            className="px-3 py-3.5 "
          >
            Fat
          </th>
          <th
            scope="col"
            className="px-3 py-3.5 "
          >
            Carbohydrates
          </th>
          <th
            scope="col"
            className="px-3 py-3.5"
          >
            Protein
          </th>
          <th
            scope="col"
            className="px-3 py-3.5"
          >
            Calories
          </th>
          <th scope="col" className="relative py-3.5 pl-3 pr-4 sm:pr-6">
            <span className="sr-only">Edit</span>
          </th>
        </tr>
      </thead>
      <tbody className="divide-y divide-zinc-800 bg-zinc-800/50">
        {filteredFood.length === 0 && <FoodRowEmpty />}
        {foodGroups.map((foodGroup) => {
          if (!groups[foodGroup]) return null
          return (
            <React.Fragment key={foodGroup}>
              <tr className="">
                <th
                  colSpan={8}
                  scope="colgroup"
                  className="bg-slate-100 py-1 pl-4 pr-3 sm:pl-6 text-center text-xs font-bold text-zinc-300 bg-zinc-900"
                >
                  {foodGroup.toUpperCase()}
                </th>
              </tr>
              {groups[foodGroup].map((foodItem) => (
                <FoodRow foodItem={foodItem} user={user} key={foodItem.id} />
              ))}
            </React.Fragment>
          )
        })}
        {filteredFood.length !== 0 && (
          <tr className="border-t border-zinc-300 bg-zinc-500/50 text-zinc-200 font-semibold text-sm text-left">
            <th className="px-4 py-3.5  "></th>
            <th className="px-4 py-3.5 "></th>
            <th className="px-4 py-3.5 "></th>
            <th className="px-3 py-3.5 ">
              {filteredFood
                .reduce(
                  (a, b) => a + getNormalizedFoodValue(b, "totalFatPerServing"),
                  0
                )
                .toLocaleString()}
              g Fat
            </th>
            <th className="px-3 py-3.5 ">
              {filteredFood
                .reduce(
                  (a, b) => a + getNormalizedFoodValue(b, "carbPerServing"),
                  0
                )
                .toLocaleString()}
              g Carbs
            </th>
            <th className="px-3 py-3.5 ">
              {filteredFood
                .reduce(
                  (a, b) => a + getNormalizedFoodValue(b, "proteinPerServing"),
                  0
                )
                .toLocaleString()}
              g Protein
            </th>
            <th className="px-3 py-3.5">
              {filteredFood
                .reduce(
                  (a, b) => a + getNormalizedFoodValue(b, "kcalPerServing"),
                  0
                )
                .toLocaleString()}
              g Calories
            </th>
            <th className="px-3 py-3.5"></th>
          </tr>
        )}
      </tbody>
    </table>
  )
}

function FoodRow({
  foodItem,
  user
}: {
  foodItem: LoggedFoodItemWithFoodItem
  user: User
}) {
  const [deleteModalOpen, setDeleteModalOpen] = useState(false)
  const [foodEditModalOpen, setFoodEditModalOpen] = useState(false)

  const router = useRouter()
  const path = usePathname()

  return (
    <>
      <tr key={foodItem.id} className="text-zinc-200">
        <td className="whitespace-nowrap px-3 py-4 text-sm text-zinc-500 text-right">
        </td>
        <td className="whitespace-nowrap px-3 py-4 text-sm text-center">
          <div className="text-zinc-200">
            {moment(foodItem.consumedOn).tz(user.tzIdentifier).format("h:mm a")}
          </div>
          <div className="text-zinc-500 text-xs">
            {moment(foodItem.consumedOn).tz(user.tzIdentifier).fromNow()}
          </div>
        </td>
        <td className="whitespace-nowrap py-4 pl-4 pr-3 sm:pl-6">
          <div className="text-xs font-light text-zinc-500">
            {foodItem.servingAmount} {foodItem.loggedUnit}
          </div>
          <div className="text-md font-medium text-zinc-200 capitalize">
            {foodItem.FoodItem?.name}
          </div>
        </td>
        <td className="whitespace-nowrap px-3 py-4 text-sm">
          {Math.round(
            getNormalizedFoodValue(foodItem, "totalFatPerServing")
          ).toLocaleString()}
          g Fat
        </td>
        <td className="whitespace-nowrap px-3 py-4 text-sm">
          {Math.round(
            getNormalizedFoodValue(foodItem, "carbPerServing")
          ).toLocaleString()}
          g Carb
        </td>
        <td className="whitespace-nowrap px-3 py-4 text-sm">
          {Math.round(
            getNormalizedFoodValue(foodItem, "proteinPerServing")
          ).toLocaleString()}
          g Protein
        </td>
        <td className="whitespace-nowrap px-3 py-4 text-sm">
          {Math.round(
            getNormalizedFoodValue(foodItem, "kcalPerServing")
          ).toLocaleString()}{" "}
          Calories
        </td>
        <td className="relative whitespace-nowrap py-4 pl-3 pr-4 text-right text-sm font-medium sm:pr-6">
          <span
            className="text-amino-logo/50 cursor-pointer"
          onClick={() => setFoodEditModalOpen(true)}
          >
            Edit<span className="sr-only">, {foodItem.FoodItem?.name}</span>
          </span>
          <span
            className="ml-3 text-amino-logo hover:text-amino-logo/70 cursor-pointer"
            onClick={() => setDeleteModalOpen(true)}
          >
            Delete<span className="sr-only">, {foodItem.FoodItem?.name}</span>
          </span>
        </td>
      </tr>
      <EditFoodModal
        isOpen={foodEditModalOpen}
        onRequestClose={() => {
          setFoodEditModalOpen(false)
        }}
        food={foodItem}
        user={user}
      />
      <DeleteFoodModal
        food={foodItem}
        isOpen={deleteModalOpen}
        setOpen={setDeleteModalOpen}
        confirmDelete={async () => {
          console.log("Delete confirmed")
          setDeleteModalOpen(false)
          await deleteSavedFood(foodItem.id)
          router.replace(path)
        }}
      />
    </>
  )
}

function FoodRowEmpty() {
  return (
    <tr>
      <td
        className="whitespace-nowrap px-3 py-16 text-sm text-gray-500 text-center"
        colSpan={8}
      >
        <div className="text-gray-700">No food logged for this day</div>
      </td>
    </tr>
  )
}
