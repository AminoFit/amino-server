"use client"

import moment from "moment-timezone"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { LoggedFoodItemWithFoodItem, getNormalizedFoodValue } from "./utils/FoodHelper"

import { ArrowPathIcon, PencilIcon } from "@heroicons/react/24/outline"
import { useQuery } from "@tanstack/react-query"
import axios from "axios"
import { useState } from "react"
import _ from "underscore"
import DeleteFoodModal from "./DeleteFoodModal"
import EditFoodModal from "./EditFoodModal"
import { deleteSavedFood } from "./utils/DeleteLoggedFoodHelper"

// import { getAccessToken } from "@auth0/nextjs-auth0"

export function FoodTable() {
  const searchParams = useSearchParams()
  const [copyYesterdayError, setCopyYesterdayError] = useState("")

  let selectedDate = moment()
  if (searchParams.get("date") && moment(searchParams.get("date")).isValid()) {
    selectedDate = moment(searchParams.get("date"))
  }

  const formattedDate = selectedDate.format("YYYY-MM-DD")

  const {
    isLoading,
    error,
    data: foods,
    isFetching,
    refetch
  } = useQuery({
    queryKey: ["foodData", formattedDate],
    queryFn: () => axios.get("/api/user/get-foods-on-date/" + formattedDate).then((res) => res.data),
    refetchIntervalInBackground: true,
    refetchInterval: 1000 * 15
  })

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

  const meals = ["breakfast", "lunch", "dinner"]

  const totalCalories = _.chain(foods || [])
    .reduce((memo, food) => {
      return memo + getNormalizedFoodValue(food, "kcalPerServing")
    }, 0)
    .value()

  const totalCarbs = _.chain(foods || [])
    .reduce((memo, food) => {
      return memo + getNormalizedFoodValue(food, "carbPerServing")
    }, 0)
    .value()

  const totalFats = _.chain(foods || [])
    .reduce((memo, food) => {
      return memo + getNormalizedFoodValue(food, "totalFatPerServing")
    }, 0)
    .value()

  const totalProtein = _.chain(foods || [])
    .reduce((memo, food) => {
      return memo + getNormalizedFoodValue(food, "proteinPerServing")
    }, 0)
    .value()

  const copyYesterday = async (meal: string, today: string) => {
    console.log("copy yesterday", meal, today)
    const yesterday = moment(selectedDate).subtract(1, "day")
    const yesterdayFormatted = yesterday.format("YYYY-MM-DD")

    const { data } = await axios.get("/api/user/copy-meal/", {
      params: {
        fromDate: yesterdayFormatted,
        toDate: moment(selectedDate).format("YYYY-MM-DD"),
        meal
      }
    })
    console.log("data", data)
    if (!data || data.length === 0) {
      setCopyYesterdayError("No food logged yesterday.")
      return
    }
    refetch()
  }

  const renderMealSections = () => {
    if (isLoading) return <FoodRowLoading />
    return (
      <>
        <div className="mb-2 grid  grid-cols-7 gap-2">
          <div className="col-span-3"></div>
          <div className="bg-amino-200 rounded-t-md p-2 text-center">
            <div className="font-bold">
              <span className="hidden md:inline">Calories</span>
              <span className="md:hidden">Cals</span>
            </div>
            <div className="text-sm text-zinc-600">
              <span className="hidden md:inline">cals</span>
              <span className="md:hidden"></span>
            </div>
          </div>
          <div className="bg-amino-200 rounded-t-md p-2 text-center">
            <div className="font-bold">
              <span className="hidden md:inline">Carbs</span>
              <span className="md:hidden">C</span>
            </div>
            <div className="text-sm text-zinc-600">
              <span className="hidden md:inline">grams</span>
              <span className="md:hidden">g</span>
            </div>
          </div>
          <div className="bg-amino-200 rounded-t-md p-2 text-center">
            <div className="font-bold">
              <span className="hidden md:inline">Fat</span>
              <span className="md:hidden">F</span>
            </div>
            <div className="text-sm text-zinc-600">
              <span className="hidden md:inline">grams</span>
              <span className="md:hidden">g</span>
            </div>
          </div>
          <div className="bg-amino-200 rounded-t-md p-2 text-center">
            <div className="font-bold">
              <span className="hidden md:inline">Protein</span>
              <span className="md:hidden">P</span>
            </div>
            <div className="text-sm text-zinc-600">
              <span className="hidden md:inline">grams</span>
              <span className="md:hidden">g</span>
            </div>
          </div>
        </div>
        {meals.map((meal) => {
          // if (!groups[foodGroup]) return null
          return (
            <div key={meal} className="mb-2">
              <h2 className="text-sm font-bold leading-7 text-zinc-800">{meal.toUpperCase()}</h2>
              <div className="">
                {!!groups[meal] ? (
                  (groups[meal] || []).map((foodItem) => <FoodRow foodItem={foodItem} key={foodItem.id} />)
                ) : (
                  <div className="ml-text-sm text-gray-500 text-zinc-700">
                    <div className="pl-5">No food logged for this meal.</div>
                    {/* <button
                      type="button"
                      className="rounded bg-white px-2 py-1 text-xs font-semibold text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 hover:bg-gray-50"
                      onClick={() => copyYesterday(meal, formattedDate)}
                    >
                      Copy Yesterday
                    </button> */}
                  </div>
                )}
              </div>
            </div>
          )
        })}
        <div className="mb-2 grid  grid-cols-7 gap-2">
          <div className="col-span-3"></div>
          <div className="bg-amino-200 rounded-b-md p-2 text-center">
            <div className="font-bold">
              <span className="hidden md:inline">Total</span>
              <span className="md:hidden">Cals</span>
            </div>
            <div className="text-sm text-zinc-600">
              {Math.round(totalCalories).toLocaleString()}
              <span className="hidden md:inline"> cals</span>
              <span className="md:hidden"></span>
            </div>
          </div>
          <div className="bg-amino-200 rounded-b-md p-2 text-center">
            <div className="font-bold">
              <span className="hidden md:inline">Carb</span>
              <span className="md:hidden">C</span>
            </div>
            <div className="text-sm text-zinc-600">
              {Math.round(totalCarbs).toLocaleString()}
              <span className="hidden md:inline"> grams</span>
              <span className="md:hidden">g</span>
            </div>
          </div>
          <div className="bg-amino-200 rounded-b-md p-2 text-center">
            <div className="font-bold">
              <span className="hidden md:inline">Fat</span>
              <span className="md:hidden">F</span>
            </div>
            <div className="text-sm text-zinc-600">
              {Math.round(totalFats).toLocaleString()} <span className="hidden md:inline"> grams</span>
              <span className="md:hidden">g</span>
            </div>
          </div>
          <div className="bg-amino-200 rounded-b-md p-2 text-center">
            <div className="font-bold">
              <span className="hidden md:inline">Protein</span>
              <span className="md:hidden">P</span>
            </div>
            <div className="text-sm text-zinc-600">
              {Math.round(totalProtein).toLocaleString()} <span className="hidden md:inline"> grams</span>
              <span className="md:hidden">g</span>
            </div>
          </div>
        </div>
      </>
    )
  }

  return <div className="px-2">{renderMealSections()}</div>
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
    (foodItem.extendedOpenAiData?.valueOf() as any)?.food_database_search_name ||
    "Loading..."

  const subtext = isLoading
    ? "Looking up nutrition info..."
    : Math.round(getNormalizedFoodValue(foodItem, "kcalPerServing")).toLocaleString() + " kcals"

  const calories = isLoading
    ? "Loading..."
    : Math.round(getNormalizedFoodValue(foodItem, "kcalPerServing")).toLocaleString()

  const servingSubtext = isLoading
    ? (foodItem.extendedOpenAiData?.valueOf() as any)?.serving?.serving_amount +
        " " +
        (foodItem.extendedOpenAiData?.valueOf() as any)?.serving?.serving_name || "Unknown Amount"
    : foodItem.servingAmount + " " + foodItem.loggedUnit

  const reprocessFood = async () => {
    console.log("FoodRow reprocessFood2")

    await axios
      .post("/api/user/reprocess-food", `${foodItem.id}`)
      .then((res) => {
        console.log("Reprocessing food")
      })
      .catch((err) => {
        console.log("Error reprocessing food", err)
      })
  }

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

      <div className="mb-1 grid grid-cols-7 gap-2 border-y-2">
        <div className="col-span-3 pl-5">
          <div className="capitalize">
            {name}{" "}
            {isLoading ? (
              <ArrowPathIcon className="h-3 w-3 inline cursor-pointer text-zinc-300" onClick={reprocessFood} />
            ) : (
              <PencilIcon
                className="h-3 w-3 inline cursor-pointer text-zinc-300"
                onClick={() => {
                  setFoodEditModalOpen(true)
                }}
              />
            )}
          </div>
          <div className="text-sm text-zinc-600">{servingSubtext}</div>
        </div>
        <div className="p-2 text-center bg-zinc-100">
          <div className="">{calories}</div>
        </div>
        <div className="m-2 text-center">
          <div className="">{Math.round(getNormalizedFoodValue(foodItem, "carbPerServing")).toLocaleString()}</div>
        </div>
        <div className="rounded-md p-2 text-center">
          <div className="">{Math.round(getNormalizedFoodValue(foodItem, "totalFatPerServing")).toLocaleString()}</div>
        </div>
        <div className="rounded-md p-2 text-center">
          <div className="">{Math.round(getNormalizedFoodValue(foodItem, "proteinPerServing")).toLocaleString()}</div>
        </div>
      </div>

      {/*<div className="rounded-lg bg-zinc-100 overflow-hidden flex mb-2">
        <div className="inline capitalize">{name}</div>
        <div className="inline">{subtext}</div>
        <div className="">
          <XMarkIcon
            className="h-4 w-4 inline cursor-pointer"
            onClick={() => {
              setDeleteModalOpen(true)
            }}
          />
        </div>

        <div className="">{servingSubtext}</div>
        <div className="flex">
          <div className="">
            <div className="">
              <div className="">Carbs</div>
              <div className="">
                <span className="">
                  {Math.round(getNormalizedFoodValue(foodItem, "carbPerServing")).toLocaleString()}
                </span>
                g
              </div>
            </div>
            <div className="">
              <div className="">Fats</div>
              <div className="">
                <span className="">
                  {Math.round(getNormalizedFoodValue(foodItem, "totalFatPerServing")).toLocaleString()}
                </span>
                g
              </div>
            </div>
            <div className="">
              <div className="">Protein</div>
              <div className="">
                <span className="">
                  {Math.round(getNormalizedFoodValue(foodItem, "proteinPerServing")).toLocaleString()}
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
      <div className="whitespace-nowrap px-3 py-16 text-sm text-gray-500">
        <div className="text-zinc-800">No food logged for this day. Use the Quick Log above to start logging!</div>
      </div>
    </div>
  )
}
function FoodRowLoading() {
  return (
    <div className="col-span-3 whitespace-nowrap px-3 py-16 text-sm text-gray-500 text-center text-zinc-700 rounded-md bg-black/10">
      Loading food for this day...
    </div>
  )
}
