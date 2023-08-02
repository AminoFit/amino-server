import { Dialog, Transition, Listbox } from "@headlessui/react"
import { User } from "@prisma/client"
import { Fragment, useState } from "react"
import { saveUserGoals } from "./utils/UserGoalHelper"

import {
  XMarkIcon,
  CheckIcon,
  ChevronUpDownIcon
} from "@heroicons/react/24/outline"

export default function GoalsDialog({ isOpen, onRequestClose, user }: { isOpen: boolean, onRequestClose: () => void, user: User }) {
  // fitness goal
  const fitnessGoal = [
    { id: 1, name: "Track food" },
    { id: 2, name: "Lose weight" },
    { id: 3, name: "Maintain weight" },
    { id: 4, name: "Gain weight" }
  ]
  const [goalSelected, setGoalSelected] = useState(fitnessGoal[0].name)

  const [calorieGoal, setCalorieGoal] = useState("")
  const [proteinGoal, setProteinGoal] = useState("")
  const [carbsGoal, setCarbsGoal] = useState("")
  const [fatGoal, setFatGoal] = useState("")

  const proteinPerWeight = () => {
    if (proteinGoal && user.weightKg) {
      if (user.unitPreference === 'METRIC') {
        return parseFloat(proteinGoal) / user.weightKg;
      } else {
        return parseFloat(proteinGoal) / (user.weightKg * 2.20462);
      }
    }
    return 0;
  }

  const handleGoalSave = async () => {
    const updatedSettings = {
      calorieGoal: parseInt(calorieGoal),
      proteinGoal: parseInt(proteinGoal),
      carbsGoal: parseInt(carbsGoal),
      fatGoal: parseInt(fatGoal),
      fitnessGoal: goalSelected
    };

    const updatedUser = await saveUserGoals(updatedSettings);
    if (updatedUser) {
      console.log("Goals saved successfully");
    } else {
      console.error("Failed to save goals");
    }
  }


  return (
    <Transition appear show={isOpen} as={Fragment}>
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
                    onClick={onRequestClose}
                    className="focus:outline-none"
                  >
                    <XMarkIcon className="h-6 w-6" aria-hidden="true" />
                  </button>
                </div>
                <div>
                  <Dialog.Title
                    as="h3"
                    className="text-lg font-medium leading-6 text-gray-900"
                  >
                    Edit your goals
                  </Dialog.Title>
                </div>
                <div className="grid grid-cols-1 gap-4 mt-4">
                  <label className="text-xl font-semibold">Fitness Goal</label>
                  <Listbox value={goalSelected} onChange={setGoalSelected}>
                    <div className="relative mt-1">
                      <Listbox.Button className="relative w-full cursor-default rounded-lg bg-white py-2 pl-3 pr-10 text-left shadow-md focus:outline-none focus-visible:border-blue-500 focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-opacity-75 focus-visible:ring-offset-2 focus-visible:ring-offset-blue-300 sm:text-sm">
                        <span className="block truncate">{goalSelected}</span>
                        <span className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-2">
                          <ChevronUpDownIcon
                            className="h-5 w-5 text-gray-400"
                            aria-hidden="true"
                          />
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
                                `relative cursor-default select-none py-2 pl-10 pr-4 ${active
                                  ? "bg-blue-100 text-blue-900"
                                  : "text-gray-900"
                                }`
                              }
                              value={goal.name}
                            >
                              {({ selected }) => (
                                <>
                                  <span
                                    className={`block truncate ${selected ? "font-medium" : "font-normal"
                                      }`}
                                  >
                                    {goal.name}
                                  </span>
                                  {selected && (
                                    <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-blue-600">
                                      <CheckIcon
                                        className="h-5 w-5"
                                        aria-hidden="true"
                                      />
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
                  <input
                    type="number"
                    placeholder="2200"
                    value={calorieGoal}
                    onChange={(e) => setCalorieGoal(e.target.value)}
                    className="block w-full rounded-md border-0 py-1.5 text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-indigo-600 sm:text-sm sm:leading-6"
                  />
                  <label>Macro goal</label>
                  <div className="grid grid-cols-3 gap-4">
                    <label className="block text-sm font-medium text-gray-700">Protein</label>
                    <label className="block text-sm font-medium text-gray-700">Carbs</label>
                    <label className="block text-sm font-medium text-gray-700">Fats</label>
                    <input
                      type="number"
                      placeholder="150"
                      value={proteinGoal}
                      onChange={(e) => setProteinGoal(e.target.value)}
                      className="block w-full rounded-md border-0 py-1.5 text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-indigo-600 sm:text-sm sm:leading-6"
                    />
                    <input
                      type="number"
                      placeholder="130"
                      value={carbsGoal}
                      onChange={(e) => setCarbsGoal(e.target.value)}
                      className="block w-full rounded-md border-0 py-1.5 text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-indigo-600 sm:text-sm sm:leading-6"
                    />
                    <input
                      type="number"
                      placeholder="80"
                      value={fatGoal}
                      onChange={(e) => setFatGoal(e.target.value)}
                      className="block w-full rounded-md border-0 py-1.5 text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-indigo-600 sm:text-sm sm:leading-6"
                    />
                  </div>
                  <p className="text-sm text-gray-500 mt-2">
                    {(proteinGoal && user.weightKg) ?
                      `You are consuming ${proteinPerWeight().toFixed(2)}g of protein per ${(user.unitPreference || 'METRIC') === 'METRIC' ? "kg" : "lb"} of body weight.`
                      : null}
                  </p>
                </div>
                <button
                  onClick={handleGoalSave}
                  className="mt-4 w-full py-2 px-4 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 focus:outline-none focus:bg-indigo-700"
                >
                  Save Goals
                </button>
              </Dialog.Panel>
            </Transition.Child>
          </div>
        </div>
      </Dialog>
    </Transition>
  )
}
