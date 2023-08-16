import { User } from "@prisma/client"

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
      <div className="px-4 sm:px-6 lg:px-0">
        <div className="mt-5 flex justify-between mb-4">
          <div>
            {user.firstName && (
              <div className="text-sm font-light text-amino-logo">
                Welcome Back
              </div>
            )}
            <h2 className="mb-3 text-4xl font-bold leading-7 text-zinc-50 sm:truncate sm:text-3xl sm:tracking-tight">
              {user.firstName || "Welcome Back"}
            </h2>
          </div>
          <div className="p-3 rounded-lg bg-[#ffffff]/10 backdrop-blur-sm flex flex-col text-white text-center">
            <div className="text-4xl sm:text-5xl font-bold">3,200</div>
            <div className="text-xs uppercase">Calories Remaining</div>
          </div>
          <div className="p-3 rounded-lg bg-[#ffffff]/10 backdrop-blur-sm flex flex-col text-white text-center">
            <div className="text-4xl sm:text-5xl font-bold">5</div>
            <div className="text-xs">DAY STREAK</div>
          </div>
        </div>

        {/* <div className="flex items-center py-3 px-4 bg-amino-logo text-zinc-900 rounded-xl">
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
        </div> */}

        <div>{/* <FoodStats foods={foods} user={user} /> */}</div>
      </div>
    </>
  )
}
