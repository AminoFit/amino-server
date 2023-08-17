import { Fragment, useState, useEffect } from "react"
import { Dialog, Transition } from "@headlessui/react"
import {
  ScaleIcon,
  XMarkIcon,
  FireIcon,
  CheckCircleIcon
} from "@heroicons/react/24/outline"
import { LoggedFoodItemWithFoodItem } from "./utils/FoodHelper"
import {
  Accordion,
  AccordionHeader,
  AccordionBody,
  Button,
  Divider,
  NumberInput,
  SearchSelect,
  SearchSelectItem,
  DatePicker
} from "@tremor/react"
import { getNormalizedFoodValue } from "./utils/FoodHelper"
import moment from "moment-timezone"
import { FoodItem, User } from "@prisma/client"
import { TimePicker } from "@/components/timePicker/timePicker"
import { updateLoggedFoodItem } from "./utils/LoggedFoodEditHelper"
import { queryClient } from "../providers"

const renderSmallNutrientRow = (
  nutrientKey: keyof FoodItem,
  label: string,
  food: LoggedFoodItemWithFoodItem
) => {
  if (food.FoodItem && food.FoodItem[nutrientKey] != null) {
    // Added null-check for food.FoodItem
    return (
      <>
        <Divider className="pl-4 my-1 h-px" color="text-zinc-600" />
        <div className="pl-4 flex justify-between items-end">
          <span className="font-extralight text-zinc-100">{label}</span>
          <span className="font-extralight text-s">
            {Math.round(
              getNormalizedFoodValue(food, nutrientKey)
            ).toLocaleString() + " "}
            g
          </span>
        </div>
      </>
    )
  }
  return null
}

export default function EditFoodModal({
  isOpen,
  onRequestClose,
  food
}: {
  isOpen: boolean
  onRequestClose: () => void
  food: LoggedFoodItemWithFoodItem
}) {
  // Extract necessary fields
  let foodName = ""
  let brand = ""

  if (food.FoodItem) {
    foodName = food.FoodItem.name
    brand = food.FoodItem.brand || ""
  }
  const consumedOnMoment = moment(food.consumedOn)

  const timeEaten = {
    hours: consumedOnMoment.format("h"),
    minutes: consumedOnMoment.format("mm"), // This will be a string with a leading zero if needed
    ampm: consumedOnMoment.format("a")
  }

  const defaultDate = consumedOnMoment.toDate()
  // Define a state variable to store the selected date
  const [selectedDate, setSelectedDate] = useState(defaultDate)
  const [selectedTime, setSelectedTime] = useState<{
    hours: string
    minutes: string
    ampm: string
  }>(timeEaten)
  const [servingWeightGramsValue, setServingGramsValue] = useState(
    food.grams / (food.servingAmount || 1) || 0
  )
  const [servingValue, setServingValue] = useState(food.loggedUnit || "")
  const [portionAmount, setPortionAmount] = useState(food.servingAmount ?? 0)
  const [isSaving, setIsSaving] = useState(false)

  const handleServingChange = (value: string) => {
    if (food.FoodItem) {
      const selectedServing = food.FoodItem.Servings.find(
        (serving) => serving.servingName === value
      )
      if (selectedServing) {
        setServingValue(value)
        setServingGramsValue(selectedServing.servingWeightGram)
      }
    }
  }

  const handlePortionChange = (value: number) => {
    setPortionAmount(value)
  }

  const handleTimeChange = (time: {
    hours: string
    minutes: string
    ampm: string
  }) => {
    setSelectedTime(time)
  }

  // Define a callback to handle changes to the date
  const handleDateChange = (value: Date | undefined) => {
    if (value) {
      setSelectedDate(value)
      // Additional logic for handling date changes (e.g., saving to a server) can be added here
    }
  }

  const handleSaveFoodItem = async () => {
    setIsSaving(true)

    let hours24Format = parseInt(selectedTime.hours)
    if (selectedTime.ampm === "pm" && hours24Format < 12) {
      hours24Format += 12
    } else if (selectedTime.ampm === "am" && hours24Format === 12) {
      hours24Format = 0
    }

    const localMoment = moment(selectedDate).tz(moment.tz.guess())
    localMoment.hour(hours24Format).minute(parseInt(selectedTime.minutes))

    const consumedOn = localMoment.toDate()

    const foodData = {
      consumedOn: consumedOn,
      grams: servingWeightGramsValue * portionAmount,
      servingAmount: portionAmount,
      loggedUnit: servingValue
    }

    const updatedFoodItem = await updateLoggedFoodItem(food.id, foodData)

    if (updatedFoodItem) {
      console.log("Food item updated successfully")
    } else {
      console.error("Failed to update food item")
    }
    setIsSaving(false)
    queryClient.invalidateQueries({ queryKey: ["foodData"] })
  }

  return (
    <Transition.Root show={isOpen} as={Fragment}>
      <Dialog as="div" className="relative z-10" onClose={onRequestClose}>
        <Transition.Child
          as={Fragment}
          enter="ease-out duration-300"
          enterFrom="opacity-0"
          enterTo="opacity-100"
          leave="ease-in duration-200"
          leaveFrom="opacity-100"
          leaveTo="opacity-0"
        >
          <div className="fixed inset-0 bg-gray-500 bg-opacity-75 transition-opacity" />
        </Transition.Child>

        <div className="fixed inset-0 z-10 overflow-y-auto">
          <div className="flex min-h-full items-end justify-center p-4 text-center sm:items-center sm:p-0">
            <Transition.Child
              as={Fragment}
              enter="ease-out duration-300"
              enterFrom="opacity-0 tranzinc-y-4 sm:tranzinc-y-0 sm:scale-95"
              enterTo="opacity-100 tranzinc-y-0 sm:scale-100"
              leave="ease-in duration-200"
              leaveFrom="opacity-100 tranzinc-y-0 sm:scale-100"
              leaveTo="opacity-0 tranzinc-y-4 sm:tranzinc-y-0 sm:scale-95"
            >
              <Dialog.Panel className="relative transform rounded-lg bg-zinc-700 text-left shadow-xl transition-all sm:my-4 sm:w-full sm:max-w-lg divide-zinc-600 divide-y">
                <div>
                  <div className="flex justify-between items-center px-4 py-5 pt-5">
                    <div className="text-center sm:text-left">
                      <Dialog.Title
                        as="h2"
                        className="text-lg font-semibold leading-4 text-white capitalize"
                      >
                        {brand ? `${foodName} by ${brand}` : foodName}{" "}
                        {food.FoodItem?.verified && (
                          <CheckCircleIcon className="h-4 w-4 inline-block" />
                        )}
                      </Dialog.Title>
                    </div>
                    <button
                      type="button"
                      className="rounded-md bg-zinc-600 text-gray-400 hover:text-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
                      onClick={() => onRequestClose()}
                    >
                      <span className="sr-only">Close</span>
                      <XMarkIcon className="h-6 w-6" aria-hidden="true" />
                    </button>
                  </div>
                  <div className="px-4 pb-2">
                    <Accordion className="bg-red-600 border-zinc-700">
                      <AccordionHeader>
                        <div className="grid grid-cols-5 gap-x-6 gap-y-8 flex-1 text-zinc-200">
                          <div className="inline-flex col-span-1 min-w-100">
                            <FireIcon className="h-6 w-6" aria-hidden="true" />
                            {Math.round(
                              getNormalizedFoodValue(food, "kcalPerServing")
                            ).toLocaleString()}
                          </div>
                          <div className="inline-flex col-span-1 min-w-100">
                            <ScaleIcon className="h-6 w-6" aria-hidden="true" />
                            {food.grams}g
                          </div>
                          <div className="inline-flex col-span-1 min-w-100">
                            {"P "}
                            {Math.round(
                              getNormalizedFoodValue(food, "proteinPerServing")
                            ).toLocaleString()}
                            g
                          </div>
                          <div className="inline-flex col-span-1 min-w-100">
                            {"C "}
                            {Math.round(
                              getNormalizedFoodValue(food, "carbPerServing")
                            ).toLocaleString()}
                            g
                          </div>
                          <div className="inline-flex col-span-1 min-w-100">
                            {"F "}
                            {Math.round(
                              getNormalizedFoodValue(food, "totalFatPerServing")
                            ).toLocaleString()}
                            g
                          </div>
                        </div>
                      </AccordionHeader>
                      <AccordionBody className="text-zinc-200 flex-1">
                        <div className="flex justify-between items-end">
                          <span className="text-zinc-100 text-xl">
                            Calories
                          </span>
                          <span className="text-base">
                            {Math.round(
                              getNormalizedFoodValue(food, "kcalPerServing")
                            ).toLocaleString()}
                            kcal
                          </span>
                        </div>
                        <Divider className="my-1" color="text-zinc-600" />
                        <div className="flex justify-between items-end">
                          <span className="font-light text-zinc-100 text-lg">
                            Total Fat
                          </span>
                          <span className="font-light text-base">
                            {Math.round(
                              getNormalizedFoodValue(food, "totalFatPerServing")
                            ).toLocaleString() + " "}
                            g
                          </span>
                        </div>
                        {renderSmallNutrientRow(
                          "transFatPerServing",
                          "Trans Fat",
                          food
                        )}
                        {renderSmallNutrientRow(
                          "satFatPerServing",
                          "Saturated Fat",
                          food
                        )}
                        <Divider
                          className="pl-4 my-1 h-px"
                          color="text-zinc-600"
                        />
                        <div className="flex justify-between items-end">
                          <span className="font-light text-zinc-100 text-lg">
                            Total Carbohydrates
                          </span>
                          <span className="font-light text-base">
                            {Math.round(
                              getNormalizedFoodValue(food, "carbPerServing")
                            ).toLocaleString() + " "}
                            g
                          </span>
                        </div>
                        {renderSmallNutrientRow(
                          "sugarPerServing",
                          "Sugar",
                          food
                        )}
                        <Divider className="my-1 h-px" color="text-zinc-600" />
                        <div className="flex justify-between items-end">
                          <span className="font-light text-zinc-100 text-lg">
                            Protein
                          </span>
                          <span className="font-light text-base">
                            {Math.round(
                              getNormalizedFoodValue(food, "proteinPerServing")
                            ).toLocaleString() + " "}
                            g
                          </span>
                        </div>
                      </AccordionBody>
                    </Accordion>
                  </div>
                </div>
                <div className="bg-zinc-800 px-4 pb-4 pt-2">
                  {" "}
                  {/* Portion Section with Grey Background */}
                  <p className="text-lg text-zinc-100 font-light py-2">
                    Portion
                  </p>
                  <div className="grid grid-cols-4 gap-x-6 gap-y-8 sm:max-w-xl sm:grid-cols-4">
                    <div className="col-span-2">
                      <NumberInput
                        defaultValue={portionAmount}
                        onValueChange={handlePortionChange}
                      />
                    </div>
                    <div className="text-aligned text-lg col-span-2 self-center text-zinc-100">
                      {/*
                      {food.loggedUnit} <span className="text-zinc-200 text-base font-extralight">({food.grams}g)</span>
                            */}
                      <SearchSelect
                        placeholder={
                          servingValue + " (" + servingWeightGramsValue + " g)"
                        }
                        value={servingValue}
                        onValueChange={handleServingChange}
                      >
                        {food.FoodItem ? (
                          food.FoodItem.Servings.map((serving) => (
                            <SearchSelectItem
                              key={serving.id}
                              value={serving.servingName}
                            >
                              {serving.servingName} ({serving.servingWeightGram}
                              g)
                            </SearchSelectItem>
                          ))
                        ) : (
                          <></>
                        )}
                      </SearchSelect>
                    </div>
                  </div>
                  <p className="text-xs text-zinc-100 font-light pt-2">
                    Total weight: {servingWeightGramsValue * portionAmount} g
                  </p>
                </div>
                <div className="bg-zinc-700 px-4 pb-4 pt-2">
                  <p className="text-lg text-zinc-100 font-light py-2">
                    Time eaten
                  </p>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="inset-0 z-50 overflow-visible">
                      <DatePicker
                        className="max-w-sm mx-auto"
                        value={selectedDate}
                        onValueChange={handleDateChange}
                        enableClear={false}
                        enableYearNavigation={false}
                      />
                    </div>
                    <TimePicker
                      onChange={handleTimeChange}
                      defaultValue={timeEaten}
                    />
                  </div>
                </div>
                <div className="bg-zinc-800 px-4 py-4 rounded-b-lg flex justify-end">
                  <Button
                    onClick={handleSaveFoodItem}
                    className="bg-amino-600 hover:bg-amino-500 py-1 px-4 text-zinc-900 rounded-md"
                    loading={isSaving} // Using the loading prop to indicate saving state
                    loadingText="Saving" // Optional text to display while loading
                    color="zinc" // You can adjust the color as per the Tremor color props
                  >
                    Save
                  </Button>
                </div>
              </Dialog.Panel>
            </Transition.Child>
          </div>
        </div>
      </Dialog>
    </Transition.Root>
  )
}
