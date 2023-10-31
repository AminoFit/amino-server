import { User } from "@prisma/client"

import { LoggedFoodItemWithFoodItem } from "./utils/FoodHelper"
import { useQuery } from "@tanstack/react-query"
import axios from "axios"
import CalOverviewCard from "./CalOverviewCard"

export function FoodLogHeader({
  foods,
  user
}: {
  foods: LoggedFoodItemWithFoodItem[]
  user: User | undefined
}) {
  return (
    <>
      <div className="px-4 sm:px-6 lg:px-0 mb-8">
        <div className="mt-5 flex justify-between mb-4">
          <div>
            {user?.firstName && (
              <div className="text-sm font-light text-amino-600">
                Welcome Back
              </div>
            )}
            <h2 className="mb-3 text-4xl font-bold leading-7 text-zinc-800 sm:truncate sm:text-3xl sm:tracking-tight">
              {user?.firstName || "Welcome Back"}
            </h2>
          </div>
          {/* <FoodLogStreak /> */}
        </div>
        <div>
          {/* <CalOverviewCard /> */}
        </div>
      </div>
    </>
  )
}

function FoodLogStreak() {
  const { isLoading, error, data } = useQuery({
    queryKey: ["foodLogStreak"],
    queryFn: () => axios.get("/api/user/get-streak").then((res) => res.data)
  })

  return (
    <div className="p-3 rounded-lg bg-[#ffffff]/10 backdrop-blur-sm flex flex-col text-white text-center">
      {isLoading ? (
        <div className="text-sm py-4 opacity-20">Loading</div>
      ) : (
        <div className="text-4xl sm:text-5xl font-bold">{data.streak}</div>
      )}
      <div className="text-xs">DAY STREAK</div>
    </div>
  )
}
