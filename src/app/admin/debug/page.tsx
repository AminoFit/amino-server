import { createAdminSupabase } from "@/utils/supabase/serverAdmin"
import { createClient } from "@/utils/supabase/server"
import { redirect } from "next/navigation"
import {
  PhotoIcon as PhotoOutlineIcon,
  MicrophoneIcon as MicrophoneOutlineIcon,
  TrashIcon as TrashOutlineIcon
} from "@heroicons/react/24/outline"
import { Fragment, useState } from "react"
import { Tables } from "types/supabase"

// Define types for the tables
type MessageType = Tables<"Message">
type FoodItemType = Tables<"FoodItem">

// Define a custom type for the nested logged food item with food item details
interface LoggedFoodItemWithDetails extends Tables<"LoggedFoodItem"> {
  FoodItem: FoodItemType | null
}

const allowedUserIds = ["2cf908ed-90a2-4ecd-a5f3-14b3a28fb05b", "6b005b82-88a5-457b-a1aa-60ecb1e90e21"]

export default async function PrivatePage() {
  const supabase = createAdminSupabase()
  const anonSupabase = createClient()

  const { data, error } = await anonSupabase.auth.getUser()
  const [currentPage, setCurrentPage] = useState(1)


  if (error || !data?.user) {
    console.log("(PrivatePage)Error getting user:", error)
    redirect("/login")
    return null
  }

  if (!allowedUserIds.includes(data.user.id)) {
    console.log("User not allowed to access this page:", data.user.id)
    redirect("/access-denied")
    return null
  }

  const { data: messages, error: messagesError } = (await supabase.from("Message").select(`
      id,
      createdAt,
      consumedOn,
      content,
      hasimages,
      isAudio,
      deletedAt
    `)) as { data: MessageType[]; error: any }

  if (messagesError) {
    console.error(messagesError)
    return <p>Error loading messages</p>
  }

  const { data: loggedFoodItems, error: loggedFoodItemsError } = (await supabase.from("LoggedFoodItem").select(`
  id,
  consumedOn,
  deletedAt,
  grams,
  servingAmount,
  extendedOpenAiData,
  loggedUnit,
  messageId,
  FoodItem (
    name,
    brand,
    kcalPerServing,
    defaultServingWeightGram
  )
`)) as { data: LoggedFoodItemWithDetails[]; error: any }

  if (loggedFoodItemsError) {
    console.error(loggedFoodItemsError)
    return <p>Error loading logged food items</p>
  }

  // Group logged food items by messageId
  const loggedFoodItemsByMessage = loggedFoodItems.reduce<Record<string, LoggedFoodItemWithDetails[]>>((acc, item) => {
    const key = item.messageId ?? "null"
    if (!acc[key]) {
      acc[key] = []
    }
    acc[key].push(item)
    return acc
  }, {})

  function classNames(...classes: any[]) {
    return classes.filter(Boolean).join(" ")
  }
  const items = [{ id: 1 }]
  return (
    <div className="p-4">
      <ul role="list" className="space-y-3">
        {messages.map((message) => (
          <li
            key={message.id}
            className={classNames(
              "overflow-hidden rounded-md px-6 py-4 shadow-md outline outline-1 outline-slate-300",
              message.deletedAt ? "bg-red-100" : "bg-slate-100"
            )}
          >
            <div className="flex space-x-4 items-center">
              <div className="flex space-x-2 w-10">
                {message.deletedAt && <TrashOutlineIcon className="h-5 w-5 text-red-500" />}
                {message.hasimages && <PhotoOutlineIcon className="h-5 w-5 text-gray-500" />}
                {message.isAudio && <MicrophoneOutlineIcon className="h-5 w-5 text-gray-500" />}
              </div>
              <div className="flex-none w-40 text-sm">{new Date(message.createdAt).toLocaleString()}</div>
              <div className="flex-none w-40 text-sm">
                {message.consumedOn ? new Date(message.consumedOn).toLocaleString() : "N/A"}
              </div>
              <div className="flex-grow max-w-xl break-words">{message.content}</div>
            </div>
            <div className="mt-4">
              {loggedFoodItemsByMessage[message.id]?.map((loggedFoodItem) => {
                const calories = loggedFoodItem.FoodItem
                  ? (
                      (loggedFoodItem.grams / (loggedFoodItem.FoodItem?.defaultServingWeightGram || 1)) *
                      (loggedFoodItem.FoodItem?.kcalPerServing || 0)
                    ).toFixed(0)
                  : ""
                const carbs = loggedFoodItem.FoodItem
                  ? (
                      (loggedFoodItem.grams / (loggedFoodItem.FoodItem?.defaultServingWeightGram || 1)) *
                      (loggedFoodItem.FoodItem?.carbPerServing || 0)
                    ).toFixed(0)
                  : ""
                const protein = loggedFoodItem.FoodItem
                  ? (
                      (loggedFoodItem.grams / (loggedFoodItem.FoodItem?.defaultServingWeightGram || 1)) *
                      (loggedFoodItem.FoodItem?.proteinPerServing || 0)
                    ).toFixed(0)
                  : ""
                const fat = loggedFoodItem.FoodItem
                  ? (
                      (loggedFoodItem.grams / (loggedFoodItem.FoodItem?.defaultServingWeightGram || 1)) *
                      (loggedFoodItem.FoodItem?.totalFatPerServing || 0)
                    ).toFixed(0)
                  : ""

                return (
                  <div
                    key={loggedFoodItem.id}
                    className={`flex items-center space-x-2 py-1 px-4 border border-gray-300 rounded-md mb-1 ${
                      loggedFoodItem.deletedAt ? "bg-rose-100" : "bg-zinc-50"
                    }`}
                  >
                    <div className="w-6">
                      {loggedFoodItem.deletedAt && <TrashOutlineIcon className="h-5 w-5 text-red-500" />}
                    </div>
                    <div className="flex-grow text-sm break-words">
                      {loggedFoodItem.FoodItem?.name || "Unknown"}
                      {loggedFoodItem.FoodItem?.brand && ` (${loggedFoodItem.FoodItem.brand})`} -
                      {loggedFoodItem.servingAmount || 1} {loggedFoodItem.loggedUnit} ({loggedFoodItem.grams}g)
                    </div>
                    <div className="flex-none text-sm">
                      <textarea
                        defaultValue={
                          loggedFoodItem.extendedOpenAiData ? JSON.stringify(loggedFoodItem.extendedOpenAiData) : ""
                        }
                        className="w-full p-1 text-xs border rounded-md resize"
                      />
                    </div>
                    <div className="flex-none text-sm">
                      {calories} kcal
                      {calories && `, ${carbs}g Carbs, ${protein}g Protein, ${fat}g Fat`}
                    </div>
                  </div>
                )
              })}
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}
