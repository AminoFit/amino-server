import { Dialog, Transition, Listbox, Disclosure } from "@headlessui/react"
import { Fragment, useState } from "react"

import { XMarkIcon, CheckIcon, ChevronUpDownIcon, ChevronUpIcon } from "@heroicons/react/24/outline"
import { Tables } from "types/supabase"

export default function GoalsDialog({
  isOpen,
  onRequestClose,
  user
}: {
  isOpen: boolean
  onRequestClose: (calorieGoal: number, fatGoal: number, carbsGoal: number, proteinGoal: number) => void
  user: Tables<"User">
}) {
  const [isSaving, setIsSaving] = useState(false)

  // fitness goal
  const fitnessGoal = [
    { id: 1, name: "Track food" },
    { id: 2, name: "Lose weight" },
    { id: 3, name: "Maintain weight" },
    { id: 4, name: "Gain weight" }
  ]
  const [goalSelected, setGoalSelected] = useState(user.fitnessGoal || fitnessGoal[0].name)

  const [calorieCheck, setCalorieCheck] = useState<{ isCorrect: boolean; expected: number }>({
    isCorrect: true,
    expected: 0
  })
  const [calorieGoal, setCalorieGoal] = useState((user.calorieGoal || "").toString())
  const [proteinGoal, setProteinGoal] = useState((user.proteinGoal || "").toString())
  const [carbsGoal, setCarbsGoal] = useState((user.carbsGoal || "").toString())
  const [fatGoal, setFatGoal] = useState((user.fatGoal || "").toString())

  function checkCalorieGoal(
    calorieGoal: number,
    proteinGoal: number,
    carbsGoal: number,
    fatGoal: number
  ): { isApproximatelyCorrect: boolean; expectedCalories: number } {
    const calculatedCalories = proteinGoal * 4 + carbsGoal * 4 + fatGoal * 9

    const tolerance = 0.05 // 10% tolerance
    const lowerBound = calculatedCalories * (1 - tolerance)
    const upperBound = calculatedCalories * (1 + tolerance)

    const isApproximatelyCorrect = calorieGoal >= lowerBound && calorieGoal <= upperBound

    return {
      isApproximatelyCorrect,
      expectedCalories: calculatedCalories
    }
  }

  const handleCalorieChange = (value: string) => {
    setCalorieGoal(value)

    const result = checkCalorieGoal(parseInt(value), parseInt(proteinGoal), parseInt(carbsGoal), parseInt(fatGoal))

    setCalorieCheck({ isCorrect: result.isApproximatelyCorrect, expected: result.expectedCalories })
  }

  const handleMacroChange = (protein: string, carbs: string, fats: string) => {
    const calorieCheckResult = checkCalorieGoal(
      parseInt(calorieGoal),
      parseInt(protein),
      parseInt(carbs),
      parseInt(fats)
    )
    setCalorieCheck({
      isCorrect: calorieCheckResult.isApproximatelyCorrect,
      expected: calorieCheckResult.expectedCalories
    })
  }

  const proteinPerWeight = () => {
    if (proteinGoal && user.weightKg) {
      if (user.unitPreference === "METRIC") {
        return parseFloat(proteinGoal) / user.weightKg
      } else {
        return parseFloat(proteinGoal) / (user.weightKg * 2.20462)
      }
    }
    return 0
  }

  const handleGoalSave = async () => {
    alert("Saving goals is not yet implemented")
    // setIsSaving(true);

    // const updatedSettings = {
    //   calorieGoal: parseInt(calorieGoal),
    //   proteinGoal: parseInt(proteinGoal),
    //   carbsGoal: parseInt(carbsGoal),
    //   fatGoal: parseInt(fatGoal),
    //   fitnessGoal: goalSelected
    // };

    // const updatedUser = await saveUserGoals(updatedSettings);

    // if (updatedUser) {
    //   console.log("Goals saved successfully");
    // } else {
    //   console.error("Failed to save goals");
    // }

    // setIsSaving(false);
  }

  return (
    <Transition appear show={isOpen} as={Fragment}>
      <Dialog
        as="div"
        className="relative z-10"
        onClose={() => {
          onRequestClose(
            Number(calorieGoal) || 0,
            Number(fatGoal) || 0,
            Number(carbsGoal) || 0,
            Number(proteinGoal) || 0
          )
        }}
      >
        <Transition.Child
          as={Fragment}
          enter="ease-out duration-300"
          enterFrom="opacity-0"
          enterTo="opacity-100"
          leave="ease-in duration-200"
          leaveFrom="opacity-100"
          leaveTo="opacity-0"
        >
          <div className="fixed inset-0 bg-black bg-opacity-25" />
        </Transition.Child>

        <div className="fixed inset-0 overflow-y-auto">
          <div className="flex min-h-full items-center justify-center p-4 text-center">
            <Transition.Child
              as={Fragment}
              enter="ease-out duration-300"
              enterFrom="opacity-0 scale-95"
              enterTo="opacity-100 scale-100"
              leave="ease-in duration-200"
              leaveFrom="opacity-100 scale-100"
              leaveTo="opacity-0 scale-95"
            >
              <Dialog.Panel className="relative w-full max-w-md transform overflow-hidden rounded-2xl bg-white p-6 text-left align-middle shadow-xl transition-all">
                <div className="absolute top-3 right-3">
                  <button
                    onClick={() => {
                      onRequestClose(
                        Number(calorieGoal) || 0,
                        Number(fatGoal) || 0,
                        Number(carbsGoal) || 0,
                        Number(proteinGoal) || 0
                      )
                    }}
                    className="focus:outline-none"
                  >
                    <XMarkIcon className="h-6 w-6" aria-hidden="true" />
                  </button>
                </div>
                <div>
                  <Dialog.Title as="h3" className="text-lg font-medium leading-6 text-gray-900">
                    Edit your goals
                  </Dialog.Title>
                </div>
                <div className="grid grid-cols-1 gap-4 mt-4">
                  <label className="text-xl font-semibold">Fitness Goal</label>
                  <Listbox value={goalSelected} onChange={setGoalSelected}>
                    <div className="relative mt-1">
                      <Listbox.Button className="relative w-full cursor-default rounded-lg border border-gray-200 bg-white py-2 pl-3 pr-10 text-left shadow-md focus:outline-none focus-visible:border-blue-500 focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-opacity-75 focus-visible:ring-offset-2 focus-visible:ring-offset-blue-300 sm:text-sm">
                        <span className="block truncate">{goalSelected}</span>
                        <span className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-2">
                          <ChevronUpDownIcon className="h-5 w-5 text-gray-400" aria-hidden="true" />
                        </span>
                      </Listbox.Button>
                      <Transition
                        as={Fragment}
                        leave="transition ease-in duration-100"
                        leaveFrom="opacity-100"
                        leaveTo="opacity-0"
                      >
                        <Listbox.Options className="absolute mt-1 max-h-60 w-full overflow-auto rounded-md bg-white py-1 text-base shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none sm:text-sm">
                          {fitnessGoal.map((goal, goalIdx) => (
                            <Listbox.Option
                              key={goalIdx}
                              className={({ active }) =>
                                `relative cursor-default select-none py-2 pl-10 pr-4 ${
                                  active ? "bg-blue-100 text-blue-900" : "text-gray-900"
                                }`
                              }
                              value={goal.name}
                            >
                              {({ selected }) => (
                                <>
                                  <span className={`block truncate ${selected ? "font-medium" : "font-normal"}`}>
                                    {goal.name}
                                  </span>
                                  {selected && (
                                    <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-blue-600">
                                      <CheckIcon className="h-5 w-5" aria-hidden="true" />
                                    </span>
                                  )}
                                </>
                              )}
                            </Listbox.Option>
                          ))}
                        </Listbox.Options>
                      </Transition>
                    </div>
                  </Listbox>

                  <label className="text-xl font-semibold">Nutrition Goal</label>
                  <label className="block text-sm font-medium text-gray-700">Calories</label>
                  <div className="grid grid-cols-3 gap-4 items-center">
                    <input
                      type="number"
                      placeholder="2200"
                      value={calorieGoal}
                      onChange={(e) => handleCalorieChange(e.target.value)}
                      className={`block col-span-1 w-full rounded-md border-0 py-1.5 text-gray-900 shadow-sm ring-1 ring-inset ${
                        calorieCheck.isCorrect ? "ring-gray-300" : "ring-red-500"
                      } placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-indigo-600 sm:text-sm sm:leading-6`}
                    />

                    {!calorieCheck.isCorrect && (
                      <div className="block col-span-2 text-xs text-amber-500">
                        Based on macros your calories should be
                        <span
                          className="underline cursor-pointer hover:text-amber-600"
                          onClick={() => {
                            const newCalorieGoal = calorieCheck.expected.toString()
                            setCalorieGoal(newCalorieGoal)
                            handleCalorieChange(newCalorieGoal)
                          }}
                        >
                          {" " + calorieCheck.expected} kcal.
                        </span>
                      </div>
                    )}
                  </div>
                  <div className="w-full">
                    <div className="mx-auto w-full max-w-md rounded-2xl bg-white">
                      <Disclosure>
                        {({ open }) => (
                          <>
                            <Disclosure.Button className="flex w-full justify-between rounded-lg bg-blue-100 px-4 py-2 text-left text-sm font-medium text-blue-900 hover:bg-blue-200 focus:outline-none focus-visible:ring focus-visible:ring-blue-500 focus-visible:ring-opacity-75">
                              <span>How does my calorie goal relate to macro goals?</span>
                              <ChevronUpIcon
                                className={`${open ? "rotate-180 transform" : ""} h-5 w-5 text-purple-500`}
                              />
                            </Disclosure.Button>
                            <Transition
                              enter="transition duration-100 ease-out"
                              enterFrom="transform scale-95 opacity-0"
                              enterTo="transform scale-100 opacity-100"
                              leave="transition duration-75 ease-out"
                              leaveFrom="transform scale-100 opacity-100"
                              leaveTo="transform scale-95 opacity-0"
                            >
                              <Disclosure.Panel className="px-4 pt-4 pb-2 text-sm text-gray-500">
                                Macronutrients provide a certain amount of calories per gram:
                                <ul className="mt-2 pl-5 list-disc">
                                  <li>
                                    <strong>Proteins:</strong> 4 calories per gram.
                                  </li>
                                  <li>
                                    <strong>Carbohydrates:</strong> 4 calories per gram.
                                  </li>
                                  <li>
                                    <strong>Fats:</strong> 9 calories per gram.
                                  </li>
                                </ul>
                                By setting your macro goals, you`re inherently defining the distribution of your total
                                calorie intake.
                              </Disclosure.Panel>
                            </Transition>
                          </>
                        )}
                      </Disclosure>
                    </div>
                  </div>

                  <label>Macro goal</label>
                  <div className="grid grid-cols-3 gap-4">
                    <label className="block text-sm font-medium text-gray-700">Protein</label>
                    <label className="block text-sm font-medium text-gray-700">Carbs</label>
                    <label className="block text-sm font-medium text-gray-700">Fats</label>
                    <input
                      type="number"
                      placeholder="150"
                      value={proteinGoal}
                      onChange={(e) => {
                        setProteinGoal(e.target.value)
                        handleMacroChange(e.target.value, carbsGoal, fatGoal)
                      }}
                      className="block w-full rounded-md border-0 py-1.5 text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-indigo-600 sm:text-sm sm:leading-6"
                    />
                    <input
                      type="number"
                      placeholder="130"
                      value={carbsGoal}
                      onChange={(e) => {
                        setCarbsGoal(e.target.value)
                        handleMacroChange(proteinGoal, e.target.value, fatGoal)
                      }}
                      className="block w-full rounded-md border-0 py-1.5 text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-indigo-600 sm:text-sm sm:leading-6"
                    />
                    <input
                      type="number"
                      placeholder="80"
                      value={fatGoal}
                      onChange={(e) => {
                        setFatGoal(e.target.value)
                        handleMacroChange(proteinGoal, carbsGoal, e.target.value)
                      }}
                      className="block w-full rounded-md border-0 py-1.5 text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-indigo-600 sm:text-sm sm:leading-6"
                    />
                  </div>
                  <p className="text-sm text-gray-500 mt-2">
                    {proteinGoal && user.weightKg
                      ? `You are consuming ${proteinPerWeight().toFixed(2)}g of protein per ${
                          (user.unitPreference || "METRIC") === "METRIC" ? "kg" : "lb"
                        } of body weight.`
                      : null}
                  </p>
                </div>
                <button
                  onClick={handleGoalSave}
                  disabled={!calorieCheck.isCorrect || isSaving}
                  className={`mt-4 w-full py-2 px-4 text-white rounded-md focus:outline-none transition-all 
              ${
                calorieCheck.isCorrect && !isSaving
                  ? "bg-indigo-600 hover:bg-indigo-700 focus:bg-indigo-700"
                  : "bg-gray-300 cursor-not-allowed"
              }`}
                >
                  {isSaving ? (
                    <span className="flex items-center justify-center w-full">
                      <svg
                        className="animate-spin -ml-1 mr-3 h-5 w-5"
                        xmlns="http://www.w3.org/2000/svg"
                        fill="none"
                        viewBox="0 0 24 24"
                      >
                        <circle
                          className="opacity-25"
                          cx="12"
                          cy="12"
                          r="10"
                          stroke="currentColor"
                          stroke-width="4"
                        ></circle>
                        <path
                          className="opacity-75"
                          fill="currentColor"
                          d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                        ></path>
                      </svg>
                      Save Goals
                    </span>
                  ) : (
                    "Save Goals"
                  )}
                </button>
              </Dialog.Panel>
            </Transition.Child>
          </div>
        </div>
      </Dialog>
    </Transition>
  )
}
