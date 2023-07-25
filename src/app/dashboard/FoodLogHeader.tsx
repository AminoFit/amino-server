import { LoggedFoodItem,FoodItem, User } from "@prisma/client"

import FoodStats from "./FoodStats"

type LoggedFoodItemWithFoodItem = LoggedFoodItem & { FoodItem: FoodItem }

export function FoodLogHeader({
  foods,
  user
}: {
  foods: LoggedFoodItemWithFoodItem[]
  user: User
}) {
  return (
    <>
      <div className="min-w-0 flex-1">
        <div className="flex">
          <div>
            <h2 className="text-2xl font-bold leading-7 text-gray-900 sm:truncate sm:text-3xl sm:tracking-tight">
              Dashboard
            </h2>
            <div className="text-sm font-light text-gray-500 mb-4">
              Overview of your food and nutrition
            </div>
          </div>
        </div>

        <div>
          <FoodStats foods={foods} user={user} />
        </div>
      </div>
    </>
  )
}
