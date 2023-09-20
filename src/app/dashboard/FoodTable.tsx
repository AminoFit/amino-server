"use client"

import { User } from "@prisma/client"
import moment from "moment-timezone"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import {
  LoggedFoodItemWithFoodItem,
  getNormalizedFoodValue
} from "./utils/FoodHelper"

import { PencilIcon, XMarkIcon } from "@heroicons/react/24/outline"
import { useState } from "react"
import _ from "underscore"
import DeleteFoodModal from "./DeleteFoodModal"
import EditFoodModal from "./EditFoodModal"
import { deleteSavedFood } from "./utils/DeleteLoggedFoodHelper"
import { useQuery } from "@tanstack/react-query"
import axios from "axios"

export function FoodTable() {
  const searchParams = useSearchParams()

  let selectedDate = moment()
  if (searchParams.get("date") && moment(searchParams.get("date")).isValid()) {
    selectedDate = moment(searchParams.get("date"))
  }

  const formattedDate = selectedDate.format("YYYY-MM-DD")

  const {
    isLoading,
    error,
    data: foods,
    isFetching
  } = useQuery({
    queryKey: ["foodData", formattedDate],
    queryFn: () =>
      axios
        .get("/api/user/get-foods-on-date/" + formattedDate)
        .then((res) => res.data),
    refetchIntervalInBackground: true,
    refetchInterval: 1000 * 15
  })

  console.log("foods", foods)
  const groups = _.chain(foods || [])
    .groupBy((food) => {
      const consumptionTime = moment(food.consumedOn)
      if (consumptionTime.hour() < 10) {
        return "breakfast"
      }
      if (consumptionTime.hour() < 15) {
        return "lunch"
      }
      return "dinner"
    })
    .value()

  console.log("groups", groups)

  const foodGroups = ["breakfast", "lunch", "dinner"]

  const renderMealSections = () => {
    if (isLoading) return <FoodRowLoading />
    return (
      <>
        {foodGroups.map((foodGroup) => {
          // if (!groups[foodGroup]) return null
          return (
            <div key={foodGroup} className="rounded-md bg-black/10 px-3 pb-2">
              <h2 className="text-sm font-bold text-center leading-7 text-zinc-800 py-3">
                {foodGroup.toUpperCase()}
              </h2>
              <div className="grid grid-cols-1 gap-2">
                {!!groups[foodGroup] ? (
                  (groups[foodGroup] || []).map((foodItem) => (
                    <FoodRow foodItem={foodItem} key={foodItem} />
                  ))
                ) : (
                  <div className="py-12 text-sm text-gray-500 text-center text-zinc-700">
                    No food logged for this meal.
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </>
    )
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-2 px-2">
      {renderMealSections()}
    </div>
  )
}

function FoodRow({ foodItem }: { foodItem: LoggedFoodItemWithFoodItem }) {
  const [deleteModalOpen, setDeleteModalOpen] = useState(false)
  const [foodEditModalOpen, setFoodEditModalOpen] = useState(false)

  const router = useRouter()
  const path = usePathname()

  const backgroundImage =
    (foodItem.FoodItem?.FoodImage &&
      foodItem.FoodItem.FoodImage.length &&
      foodItem.FoodItem.FoodImage[0].pathToImage) ||
    "https://cdn.discordapp.com/ephemeral-attachments/1107010584907612172/1141797943712690206/coudron_food_photography_of_cutting_board_on_a_wooden_table_top_bcc64dcd-7a9a-4595-8f41-0b394b6c5033.png"

  const isLoading = foodItem.status === "Needs Processing"

  const name =
    foodItem.FoodItem?.name ||
    (foodItem.extendedOpenAiData?.valueOf() as any)?.food_full_name ||
    "Loading..."

  const subtext = isLoading
    ? "Looking up nutrition info..."
    : Math.round(
        getNormalizedFoodValue(foodItem, "kcalPerServing")
      ).toLocaleString() + " kcals"

  const servingSubtext = isLoading
    ? (foodItem.extendedOpenAiData?.valueOf() as any)?.serving?.serving_amount +
        " " +
        (foodItem.extendedOpenAiData?.valueOf() as any)?.serving
          ?.serving_name || "Unknown Amount"
    : foodItem.servingAmount + " " + foodItem.loggedUnit

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

      <EditFoodModal
        isOpen={foodEditModalOpen}
        onRequestClose={() => {
          setFoodEditModalOpen(false)
        }}
        food={foodItem}
      />

      <div
        className="rounded-lg bg-zinc-900 overflow-hidden"
        style={{
          backgroundImage: `linear-gradient(rgba(46, 46, 46, 0.95), rgba(46, 46, 46, 0.95)), url('${backgroundImage}')`,
          backgroundPosition: "center",
          backgroundSize: "cover"
          // opacity: 0.0
        }}
      >
        <div className="p-4 flex-column text-white">
          <div className="flex">
            <div>
              <div className="inline capitalize font-bold text-lg">{name}</div>
              <div className="inline text-xs text-zinc-400 ml-1">{subtext}</div>
            </div>
            <div className="text-zinc-400 text-right grow">
              <XMarkIcon
                className="h-4 w-4 inline cursor-pointer"
                onClick={() => {
                  setDeleteModalOpen(true)
                }}
              />
            </div>
          </div>

          <div className="text-xs text-zinc-400">{servingSubtext}</div>
        </div>
        {!isLoading && (
          <div className="flex">
            <div className="px-4 pb-4 flex text-white text-center">
              <div className="border-b border-l rounded-bl-md border-amino-500/20 mr-3">
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
              <div className="border-b border-l rounded-bl-md border-amino-500/20 mr-3">
                <div className="px-2 text-xs text-amino-500 rounded-full">
                  Fats
                </div>
                <div className="px-2 pb-1">
                  <span className="text-xl font-bold">
                    {Math.round(
                      getNormalizedFoodValue(foodItem, "totalFatPerServing")
                    ).toLocaleString()}
                  </span>
                  g
                </div>
              </div>
              <div className="border-b border-l rounded-bl-md border-amino-500/20 mr-3">
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
            <div className="text-zinc-400 text-right self-end grow pb-4 px-4">
              <PencilIcon
                className="h-4 w-4 inline cursor-pointer"
                onClick={() => {
                  setFoodEditModalOpen(true)
                }}
              />
            </div>
          </div>
        )}
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
        <div className="text-zinc-800">
          No food logged for this day. Use the Quick Log above to start logging!
        </div>
      </div>
    </div>
  )
}
function FoodRowLoading() {
  return (
    <div>
      <div className="whitespace-nowrap px-3 py-16 text-sm text-gray-500 text-center">
        <div className="text-zinc-200">Loading food for this day...</div>
      </div>
    </div>
  )
}
