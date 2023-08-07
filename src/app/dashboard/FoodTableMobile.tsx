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

export function FoodTableMobile({
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
    <div className="lg:hidden">
      {filteredFood.length === 0 && <FoodRowEmpty />}
      {foodGroups.map((foodGroup) => {
        if (!groups[foodGroup]) return null
        return (
          <React.Fragment key={foodGroup}>
            <h2 className="text-sm font-bold text-center leading-7 text-zinc-200">
              {foodGroup.toUpperCase()}
            </h2>
            {groups[foodGroup].map((foodItem) => (
              <FoodRow foodItem={foodItem} user={user} key={foodItem.id} />
            ))}
          </React.Fragment>
        )
      })}
    </div>
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
  const [editModalOpen, setEditModalOpen] = useState(false)

  const router = useRouter()
  const path = usePathname()

  const backgroundImage =
    (foodItem.FoodItem.FoodImage &&
      foodItem.FoodItem.FoodImage.length &&
      foodItem.FoodItem.FoodImage[0].pathToImage) ||
    "https://cdn.discordapp.com/attachments/1107010584907612172/1137859696741589072/coudron_food_photography_of_Poke_Bowl_on_a_wooden_table_top-dow_d66a2bc6-009f-4177-91e9-203329f31dbd.png"

  return (
    <>
      {/* Mobile View */}
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

      <div className="mb-3 rounded-lg bg-zinc-900 relative z-10 overflow-hidden">
        <div
          className="absolute top-0 right-0 bottom-0 left-0 z-20"
          style={{
            backgroundImage: `url('${backgroundImage}')`,
            backgroundPosition: "center",
            backgroundSize: "cover",
            opacity: 0.2
          }}
        ></div>
        <div className="p-4 flex-column text-white z-30 relative">
          <div className="flex">
            <h2 className="capitalize font-bold text-xl">
              {foodItem.FoodItem.name}
            </h2>
            <div className="text-xs text-zinc-400 grow text-right">
              {Math.round(
                getNormalizedFoodValue(foodItem, "kcalPerServing")
              ).toLocaleString()}
              {" kcals"}
            </div>
          </div>

          <div className="text-xs text-zinc-400">
            {foodItem.servingAmount} {foodItem.loggedUnit}
          </div>
        </div>
        <div className="p-4 flex mb-3 text-white z-30 relative justify-between text-center">
          <div>
            <div className="text-sm text-red-500">Carbs</div>
            <div>
              <span className="text-xl font-bold">
                {Math.round(
                  getNormalizedFoodValue(foodItem, "carbPerServing")
                ).toLocaleString()}
              </span>
              g
            </div>
          </div>
          <div>
            <div className="text-sm text-yellow-600">Fats</div>
            <div>
              <span className="text-xl font-bold">
                {Math.round(
                  getNormalizedFoodValue(foodItem, "totalFatPerServing")
                ).toLocaleString()}
              </span>
              g
            </div>
          </div>
          <div>
            <div className="text-sm text-blue-500">Protein</div>
            <div>
              <span className="text-xl font-bold">
                {Math.round(
                  getNormalizedFoodValue(foodItem, "proteinPerServing")
                ).toLocaleString()}
              </span>
              g
            </div>
          </div>
        </div>
        {/* <div className="flex justify-between">
          <div className="ml-4">
            <div className="text-xs text-gray-800">
              {foodItem.servingAmount} {foodItem.loggedUnit}
            </div>
            <h3 className="capitalize font-bold">{foodItem.FoodItem.name}</h3>
            <div className="text-sm text-gray-500">
              {Math.round(
                getNormalizedFoodValue(foodItem, "kcalPerServing")
              ).toLocaleString()}
              {"kcals"}
            </div>
          </div>
        </div>
        <div className="flex justify-between text-center">
          <div>
            <div className="text-sm text-red-500">Carbs</div>
            <div>
              <span className="text-xl font-bold">
                {Math.round(
                  getNormalizedFoodValue(foodItem, "carbPerServing")
                ).toLocaleString()}
              </span>
              g
            </div>
          </div>
          <div>
            <div className="text-sm text-yellow-600">Fats</div>
            <div>
              <span className="text-xl font-bold">
                {Math.round(
                  getNormalizedFoodValue(foodItem, "totalFatPerServing")
                ).toLocaleString()}
              </span>
              g
            </div>
          </div>
          <div>
            <div className="text-sm text-blue-500">Protein</div>
            <div>
              <span className="text-xl font-bold">
                {Math.round(
                  getNormalizedFoodValue(foodItem, "proteinPerServing")
                ).toLocaleString()}
              </span>
              g
            </div>
          </div>
        </div> */}
      </div>
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
