// src/app/admin/debug/page.tsx
"use client"

import { useState, useEffect } from "react"
import { fetchMessages } from "./actions"
import { MessageType, LoggedFoodItemWithDetailsType } from "./actions"
import {
  PhotoIcon as PhotoOutlineIcon,
  MicrophoneIcon as MicrophoneOutlineIcon,
  TrashIcon as TrashOutlineIcon
} from "@heroicons/react/24/outline"
import classNames from "classnames"
import Pagination from "@/components/pagination/pagination"

const ITEMS_PER_PAGE = 10
const MAX_VISIBLE_PAGES = 10

const MessagesOverview = () => {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [messages, setMessages] = useState<MessageType[]>([])
  const [loggedFoodItemsByMessage, setLoggedFoodItemsByMessage] = useState<
    Record<string, LoggedFoodItemWithDetailsType[]>
  >({})
  const [currentPage, setCurrentPage] = useState(1)
  const [totalMessages, setTotalMessages] = useState(0)

  const [showDeleted, setShowDeleted] = useState("all")
  const [userId, setUserId] = useState("")
  const [hasImage, setHasImage] = useState("all")
  const [messageStatus, setMessageStatus] = useState("all")

  const handleApply = (e: any) => {
    e.preventDefault()
    setCurrentPage(1) // Reset to first page on filter apply
    fetchData()
  }

  const handleClear = () => {
    setShowDeleted("all")
    setUserId("")
    setHasImage("all")
    setMessageStatus("all")
    setCurrentPage(1) // Reset to first page on filter clear
    fetchData()
  }

  const fetchData = async () => {
    setLoading(true)
    setError(null)
    console.log("Fetching messages for page", currentPage)
    const response = await fetchMessages(currentPage, ITEMS_PER_PAGE, showDeleted, userId, hasImage, messageStatus)
    if (response.error) {
      setError(response.error)
      setLoading(false)
      return
    }
    if (!response.messages || !response.loggedFoodItemsByMessage) {
      setError("Invalid response")
      setLoading(false)
      return
    }
    setMessages(response.messages)
    setLoggedFoodItemsByMessage(response.loggedFoodItemsByMessage)
    setTotalMessages(response.totalMessages || 0)
    setLoading(false)
  }

  useEffect(() => {
    fetchData()
  }, [currentPage])

  return (
    <div className="flex">
      <aside className="w-64 p-4 border-r border-gray-200">
        <h2 className="text-lg font-medium text-gray-900 mb-4">Filters</h2>
        <form className="space-y-4" onSubmit={handleApply}>
          <div>
            <label htmlFor="show-deleted" className="block text-sm font-medium text-gray-700">
              Show Deleted
            </label>
            <select
              id="show-deleted"
              name="show-deleted"
              value={showDeleted}
              onChange={(e) => setShowDeleted(e.target.value)}
              className="block w-full mt-1 rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
            >
              <option value="all">All</option>
              <option value="deleted">Deleted</option>
              <option value="not-deleted">Not Deleted</option>
            </select>
          </div>

          <div>
            <label htmlFor="user-id" className="block text-sm font-medium text-gray-700">
              User ID
            </label>
            <input
              type="text"
              id="user-id"
              name="user-id"
              value={userId}
              onChange={(e) => setUserId(e.target.value)}
              className="block w-full mt-1 rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
            />
          </div>

          <div>
            <label htmlFor="has-image" className="block text-sm font-medium text-gray-700">
              Has Image
            </label>
            <select
              id="has-image"
              name="has-image"
              value={hasImage}
              onChange={(e) => setHasImage(e.target.value)}
              className="block w-full mt-1 rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
            >
              <option value="all">All</option>
              <option value="has-image">Has Image</option>
              <option value="no-image">No Image</option>
            </select>
          </div>

          <div>
            <label htmlFor="message-status" className="block text-sm font-medium text-gray-700">
              Message Status
            </label>
            <select
              id="message-status"
              name="message-status"
              value={messageStatus}
              onChange={(e) => setMessageStatus(e.target.value)}
              className="block w-full mt-1 rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
            >
              <option value="all">All</option>
              <option value="received">Received</option>
              <option value="failed">Failed</option>
              <option value="processing">Processing</option>
              <option value="resolved">Resolved</option>
            </select>
          </div>

          <div className="flex space-x-2">
            <button
              type="submit"
              className="rounded bg-indigo-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600"
            >
              Apply
            </button>
            <button
              type="button"
              onClick={handleClear}
              className="rounded bg-white px-3 py-2 text-sm font-semibold text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 hover:bg-gray-50"
            >
              Clear
            </button>
          </div>
        </form>
      </aside>
      <div className="p-4 flex-grow">
        {loading ? (
          <p>Loading...</p>
        ) : error ? (
          <p className="text-red-500">{error}</p>
        ) : (
          <>
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
                    <div className="flex-none w-40 text-sm">{new Date(message.createdAt!).toLocaleString()}</div>
                    <div className="flex-none w-40 text-sm">
                      {message.consumedOn ? new Date(message.consumedOn).toLocaleString() : "N/A"}
                    </div>
                    <div className="flex-grow max-w-xl break-words">{message.content}</div>
                  </div>
                  <div className="mt-4">
                    {loggedFoodItemsByMessage[message.id!]?.map((loggedFoodItem) => {
                      const grams = loggedFoodItem.grams || 0 // Default to 0 if grams is undefined
                      const calories = loggedFoodItem.FoodItem
                        ? (
                            (grams / (loggedFoodItem.FoodItem?.defaultServingWeightGram || 1)) *
                            (loggedFoodItem.FoodItem?.kcalPerServing || 0)
                          ).toFixed(0)
                        : ""
                      const carbs = loggedFoodItem.FoodItem
                        ? (
                            (grams / (loggedFoodItem.FoodItem?.defaultServingWeightGram || 1)) *
                            (loggedFoodItem.FoodItem?.carbPerServing || 0)
                          ).toFixed(0)
                        : ""
                      const protein = loggedFoodItem.FoodItem
                        ? (
                            (grams / (loggedFoodItem.FoodItem?.defaultServingWeightGram || 1)) *
                            (loggedFoodItem.FoodItem?.proteinPerServing || 0)
                          ).toFixed(0)
                        : ""
                      const fat = loggedFoodItem.FoodItem
                        ? (
                            (grams / (loggedFoodItem.FoodItem?.defaultServingWeightGram || 1)) *
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
                            {loggedFoodItem.servingAmount || 1} {loggedFoodItem.loggedUnit} ({grams}g)
                          </div>
                          <div className="flex-none text-sm">
                            <textarea
                              defaultValue={
                                loggedFoodItem.extendedOpenAiData
                                  ? JSON.stringify(loggedFoodItem.extendedOpenAiData)
                                  : ""
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
            <Pagination
              currentPage={currentPage}
              setCurrentPage={setCurrentPage}
              totalItems={totalMessages}
              itemsPerPage={ITEMS_PER_PAGE}
              maxVisiblePages={MAX_VISIBLE_PAGES}
            />
          </>
        )}
      </div>
    </div>
  )
}

export default MessagesOverview
