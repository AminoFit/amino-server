import { LoggedFoodItem, FoodItem, User } from "@prisma/client"

import FoodStats from "./FoodStats"
import {
  ChevronRightIcon,
  FireIcon,
  TagIcon
} from "@heroicons/react/24/outline"
import { LoggedFoodItemWithFoodItem } from "./utils/FoodHelper"


export function FoodLogHeader({
  foods,
  user
}: {
  foods: LoggedFoodItemWithFoodItem[]
  user: User
}) {
  return (
    <>
      <div className="">
        <div className="mt-5 flex mb-4">
          <div>
            {user.firstName && (
              <div className="text-sm font-light text-amino-logo">
                Welcome Back
              </div>
            )}
            <h2 className="mb-5 text-4xl font-bold leading-7 text-zinc-50 sm:truncate sm:text-3xl sm:tracking-tight">
              {user.firstName || "Welcome Back"}
            </h2>
            <h2 className="mb-5 text-2xl font-bold leading-7 text-zinc-50">
              You're on track to meet your goals today!
            </h2>
          </div>
        </div>

        <div className="flex items-center py-3 px-4 bg-amino-logo text-zinc-900 rounded-xl">
          <div className="mr-3">
            <FireIcon className="h-6 w-6" />
          </div>
          <div className="grow">
            <div className="text-xs uppercase">YOUR GOAL</div>
            <div className="text-xl uppercase tracking-tighter">
              {user.fitnessGoal}
            </div>
          </div>
          <div>
            <ChevronRightIcon className="h-6 w-6" />
          </div>
        </div>

        <div>{/* <FoodStats foods={foods} user={user} /> */}</div>
      </div>
    </>
  )
}
