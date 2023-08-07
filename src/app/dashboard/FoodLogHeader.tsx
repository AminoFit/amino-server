import { LoggedFoodItem, FoodItem, User } from "@prisma/client"

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
            <div className="text-sm font-light text-amino-400">
              Good Morning
            </div>
            <h2 className="text-2xl font-bold leading-7 text-zinc-50 sm:truncate sm:text-3xl sm:tracking-tight">
              Chris
            </h2>
          </div>
        </div>

        <div>{/* <FoodStats foods={foods} user={user} /> */}</div>
      </div>
    </>
  )
}
