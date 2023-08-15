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
    (foodItem.FoodItem?.FoodImage &&
      foodItem.FoodItem.FoodImage.length &&
      foodItem.FoodItem.FoodImage[0].pathToImage) ||
    "https://cdn.discordapp.com/attachments/1107010584907612172/1138668812414242856/coudron_food_photography_of_an_empty_wooden_table_top-down_shot_6976cf67-5513-4a6b-9479-d13752b6b494.png"

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

      <div className="mb-2 rounded-lg bg-zinc-900 relative z-10 overflow-hidden">
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
          <div className="">
            <div className="inline capitalize font-bold text-2xl">
              {foodItem.FoodItem?.name}
            </div>
            <div className="inline text-xs text-zinc-400 ms-2">
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
        <div className="p-4 flex text-white z-30 relative justify-between text-center">
          <div className="border-b border-l rounded-bl-md border-amino-500/20">
            <div className="px-2 text-xs text-amino-500 rounded-full">
              Carbs
            </div>
            <div className="px-2 pb-1">
              <span className="text-xl font-bold">
                {Math.round(
                  getNormalizedFoodValue(foodItem, "carbPerServing")
                ).toLocaleString()}
              </span>
              g
            </div>
          </div>
          <div className="border-b border-l rounded-bl-md border-amino-500/20">
            <div className="px-2 text-xs text-amino-500 rounded-full">Fats</div>
            <div className="px-2 pb-1">
              <span className="text-xl font-bold">
                {Math.round(
                  getNormalizedFoodValue(foodItem, "totalFatPerServing")
                ).toLocaleString()}
              </span>
              g
            </div>
          </div>
          <div className="border-b border-l rounded-bl-md border-amino-500/20">
            <div className="px-2 text-xs text-amino-500 rounded-full">
              Protein
            </div>
            <div className="px-2 pb-1">
              <span className="text-xl font-bold">
                {Math.round(
                  getNormalizedFoodValue(foodItem, "proteinPerServing")
                ).toLocaleString()}
              </span>
              g
            </div>
          </div>
        </div>
      </div>
      {/* <div className="text-gray-600 text-sm mb-3 text-right ">
        {moment(foodItem.consumedOn).tz(user.tzIdentifier).format("h:mm a")}
      </div> */}
    </>
  )
}

function FoodRowEmpty() {
  return (
    <div>
      <div className="whitespace-nowrap px-3 py-16 text-sm text-gray-500 text-center">
        <div className="text-gray-700">No food logged for this day</div>
      </div>
    </div>
  )
}
