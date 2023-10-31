"use client"
import { useQuery } from "@tanstack/react-query"
import axios from "axios"
import moment from "moment-timezone"
import { useSearchParams } from "next/navigation"
import { FoodLogHeader } from "./FoodLogHeader"
import { FoodTable } from "./FoodTable"
import { TableHeader } from "./TableHeader"

export default function FoodLog() {
  const searchParams = useSearchParams()

  const { isLoading: isUserLoading, data: user } = useQuery({
    queryKey: ["user"],
    queryFn: () => axios.get("/api/user/get-user").then((res) => res.data)
  })

  let selectedDate = user ? moment().tz(user.tzIdentifier) : moment()

  if (searchParams.get("date") && moment(searchParams.get("date")).isValid()) {
    selectedDate = moment(searchParams.get("date"))
  }

  return (
    <>
      <div className="py-3">
        <FoodLogHeader foods={[]} user={user} />
        <div className="px-0 sm:px-6 lg:px-0 mb-8">
          {/* <TableHeader /> */}
          <FoodTable />
        </div>
      </div>
    </>
  )
}
