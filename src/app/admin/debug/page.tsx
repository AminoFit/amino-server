// src/app/admin/debug/page.tsx
"use client"

import { useState, useEffect, Fragment, FormEvent, ReactNode } from "react"
import { fetchMessages } from "./actions"
import { MessageWithSignedUrls, LoggedFoodItemWithDetailsType } from "./actions"
import {
  PhotoIcon as PhotoOutlineIcon,
  MicrophoneIcon as MicrophoneOutlineIcon,
  TrashIcon as TrashOutlineIcon,
  ChevronRightIcon,
  ChevronDownIcon
} from "@heroicons/react/24/outline"
import classNames from "classnames"
import Pagination from "@/components/pagination/pagination"
// Remove unused imports
// import { ChevronDownIcon } from "@heroicons/react/20/solid"
// import { Menu, MenuButton, MenuItem, MenuItems, Transition } from "@headlessui/react"

import { useRouter } from "next/navigation"

const ITEMS_PER_PAGE = 10
const MAX_VISIBLE_PAGES = 10

const STATUS_STYLES: Record<string, string> = {
  FAILED: "bg-rose-100 text-rose-800 border border-rose-200",
  PROCESSING: "bg-amber-100 text-amber-800 border border-amber-200",
  RECEIVED: "bg-sky-100 text-sky-800 border border-sky-200",
  RESOLVED: "bg-emerald-100 text-emerald-800 border border-emerald-200"
}

const MessagesOverview = () => {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [unauthorized, setUnauthorized] = useState(false)
  const [messages, setMessages] = useState<MessageWithSignedUrls[]>([])
  const [loggedFoodItemsByMessage, setLoggedFoodItemsByMessage] = useState<
    Record<string, LoggedFoodItemWithDetailsType[]>
  >({})
  const [currentPage, setCurrentPage] = useState(1)
  const [totalMessages, setTotalMessages] = useState(0)

  const [showDeleted, setShowDeleted] = useState("all")
  const [userIdFilter, setUserIdFilter] = useState("")
  const [userIdInput, setUserIdInput] = useState("")
  const [hasImage, setHasImage] = useState("all")
  const [messageStatus, setMessageStatus] = useState("all")

  const [expandedFoodItems, setExpandedFoodItems] = useState<Record<number, boolean>>({})

  const router = useRouter()

  const toggleExpand = (itemId: number) => {
    setExpandedFoodItems((prevState) => ({
      ...prevState,
      [itemId]: !prevState[itemId]
    }))
  }

  const handleApply = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const trimmedUserId = userIdInput.trim()
    setUserIdFilter(trimmedUserId)
    setCurrentPage(1) // Reset to first page on filter apply
  }

  const handleClear = () => {
    setShowDeleted("all")
    setUserIdInput("")
    setUserIdFilter("")
    setHasImage("all")
    setMessageStatus("all")
    setCurrentPage(1) // Reset to first page on filter clear
  }

  const handleSelectUser = (id?: string | null) => {
    if (!id) return
    setUserIdInput(id)
    setUserIdFilter(id)
    setCurrentPage(1)
  }

  useEffect(() => {
    let isCancelled = false

    const loadMessages = async () => {
      setLoading(true)
      setError(null)
      setUnauthorized(false)

      const response = await fetchMessages(
        currentPage,
        ITEMS_PER_PAGE,
        showDeleted,
        userIdFilter.trim(),
        hasImage,
        messageStatus
      )

      if (isCancelled) return

      if (response.error) {
        if (response.error.includes("Unauthorized")) {
          setUnauthorized(true)
        } else {
          setError(response.error)
        }
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

    loadMessages()

    return () => {
      isCancelled = true
    }
  }, [currentPage, showDeleted, userIdFilter, hasImage, messageStatus])

  if (unauthorized) {
    return (
      <div className="flex justify-center items-center min-h-screen bg-gray-100">
        <div className="bg-white shadow sm:rounded-lg">
          <div className="px-4 py-5 sm:p-6">
            <h3 className="text-base font-semibold leading-6 text-gray-900">
              You must log in first to view contents of this page
            </h3>

            <div className="mt-2 sm:flex sm:items-start sm:justify-between">
              <div className="max-w-xl text-sm text-gray-500">
                <p>Please log in to access this page.</p>
              </div>

              <div className="mt-5 sm:ml-6 sm:mt-0 sm:flex sm:flex-shrink-0 sm:items-center">
                <button
                  type="button"
                  onClick={() => router.push("/login")}
                  className="inline-flex items-center rounded-md bg-indigo-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500"
                >
                  Go to Login
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    )
  }
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
              onChange={(e) => {
                setShowDeleted(e.target.value)
                setCurrentPage(1)
              }}
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
              value={userIdInput}
              onChange={(e) => setUserIdInput(e.target.value)}
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
              onChange={(e) => {
                setHasImage(e.target.value)
                setCurrentPage(1)
              }}
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
              onChange={(e) => {
                setMessageStatus(e.target.value)
                setCurrentPage(1)
              }}
              className="block w-full mt-1 rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
            >
              <option value="all">All</option>
              <option value="RECEIVED">Received</option>
              <option value="FAILED">Failed</option>
              <option value="PROCESSING">Processing</option>
              <option value="RESOLVED">Resolved</option>
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
              {messages.map((message) => {
                const createdAt = message.createdAt ? new Date(message.createdAt).toLocaleString() : "N/A"
                const consumedAt = message.consumedOn ? new Date(message.consumedOn).toLocaleString() : "N/A"
                const resolvedAt = message.resolvedAt ? new Date(message.resolvedAt).toLocaleString() : "N/A"
                const messageContent = message.content || ""
                const statusLabel = message.status || "UNKNOWN"
                const statusClass = STATUS_STYLES[statusLabel] ?? "bg-slate-200 text-slate-800 border border-slate-300"
                const progressLabel =
                  message.itemsProcessed != null || message.itemsToProcess != null
                    ? `${message.itemsProcessed ?? 0}${message.itemsToProcess != null ? ` / ${message.itemsToProcess}` : ""}`
                    : null
                const completionPercentage =
                  message.itemsProcessed != null &&
                  message.itemsToProcess != null &&
                  message.itemsToProcess > 0
                    ? `${Math.round((message.itemsProcessed / message.itemsToProcess) * 100)}%`
                    : null
                const metaDetails = [
                  { label: "Message ID", value: message.id ?? "—" },
                  message.userId && {
                    label: "User ID",
                    value: (
                      <button
                        type="button"
                        onClick={() => handleSelectUser(message.userId)}
                        className="text-indigo-600 hover:underline break-all text-left"
                      >
                        {message.userId}
                      </button>
                    )
                  },
                  message.function_name && { label: "Function", value: message.function_name },
                  message.messageType && { label: "Message Type", value: message.messageType },
                  message.role && { label: "Role", value: message.role },
                  progressLabel && { label: "Items Processed", value: progressLabel },
                  completionPercentage && { label: "Completion %", value: completionPercentage },
                  typeof message.isBadFoodRequest === "boolean" && {
                    label: "Bad Food Request",
                    value: message.isBadFoodRequest ? "Yes" : "No"
                  },
                  message.local_id && { label: "Local ID", value: message.local_id },
                  message.imageUrls.length > 0 && { label: "Images", value: message.imageUrls.length },
                  typeof message.isAudio === "boolean" && {
                    label: "Audio Message",
                    value: message.isAudio ? "Yes" : "No"
                  },
                  message.deletedAt && {
                    label: "Deleted At",
                    value: new Date(message.deletedAt).toLocaleString()
                  }
                ].filter(Boolean) as { label: string; value: ReactNode }[]

                return (
                  <li
                    key={message.id}
                    className={classNames(
                      "overflow-hidden rounded-md px-6 py-4 shadow-md outline outline-1 outline-slate-300",
                      message.deletedAt ? "bg-red-100" : "bg-slate-100"
                    )}
                  >
                    <div className="flex flex-wrap items-center gap-4 text-sm text-gray-700">
                      <div className="flex min-w-[2.5rem] items-center space-x-2">
                        {message.deletedAt && <TrashOutlineIcon className="h-5 w-5 text-red-500" />}
                        {message.imageUrls.length > 0 && (
                          <a
                            href={message.imageUrls[0]}
                            target="_blank"
                            rel="noopener noreferrer"
                            title={`Open first image (${message.imageUrls.length} total)`}
                          >
                            <PhotoOutlineIcon className="h-5 w-5 text-gray-500" />
                          </a>
                        )}
                        {message.isAudio && <MicrophoneOutlineIcon className="h-5 w-5 text-gray-500" />}
                      </div>
                      <div>
                        <span className="font-semibold text-gray-900">Created:</span> {createdAt}
                      </div>
                      <div>
                        <span className="font-semibold text-gray-900">Consumed:</span> {consumedAt}
                      </div>
                      <div>
                        <span className="font-semibold text-gray-900">Resolved:</span> {resolvedAt}
                      </div>
                      <div className="ml-auto flex items-center space-x-2">
                        <span
                          className={classNames(
                            "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wide",
                            statusClass
                          )}
                        >
                          {statusLabel}
                        </span>
                      </div>
                    </div>
                    <div className="mt-3 text-sm text-gray-900 whitespace-pre-wrap break-words">
                      {messageContent ? (
                        messageContent
                      ) : (
                        <span className="italic text-gray-500">No content provided</span>
                      )}
                    </div>
                    {metaDetails.length > 0 && (
                      <dl className="mt-3 grid grid-cols-1 gap-x-6 gap-y-2 text-xs text-gray-600 sm:grid-cols-2 lg:grid-cols-3">
                        {metaDetails.map(({ label, value }) => (
                          <div key={label} className="flex flex-col">
                            <dt className="font-semibold text-gray-700">{label}</dt>
                            <dd className="break-all text-gray-700">{value}</dd>
                          </div>
                        ))}
                      </dl>
                    )}
                    <div className="mt-4">
                      {loggedFoodItemsByMessage[message.id!]?.map((loggedFoodItem) => {
                        const grams = loggedFoodItem.grams || 0 // Default to 0 if grams is undefined
                        // Use the calories and nutrient values directly from loggedFoodItem
                        const calories = loggedFoodItem.kcal?.toFixed(0) || ""
                        const carbs = loggedFoodItem.carbG?.toFixed(1) || ""
                        const protein = loggedFoodItem.proteinG?.toFixed(1) || ""
                        const fat = loggedFoodItem.totalFatG?.toFixed(1) || ""
                        const isExpanded = expandedFoodItems[loggedFoodItem.id!] || false

                        return (
                          <div key={loggedFoodItem.id} className="border border-gray-300 rounded-md mb-1">
                            {/* Food Item Row */}
                            <div
                              className={`flex items-center space-x-2 py-1 px-4 ${
                                loggedFoodItem.deletedAt ? "bg-rose-100" : "bg-zinc-50"
                              }`}
                            >
                              {loggedFoodItem.pathToImage && (
                                <img
                                  src={loggedFoodItem.pathToImage}
                                  alt="Food Item"
                                  className="h-8 w-8 object-cover rounded-full"
                                />
                              )}
                              <div className="w-6">
                                {loggedFoodItem.deletedAt && <TrashOutlineIcon className="h-5 w-5 text-red-500" />}
                              </div>
                              <div className="flex-grow text-sm break-words">
                                {loggedFoodItem.FoodItem?.name || "Unknown"}
                                {loggedFoodItem.FoodItem?.brand && ` (${loggedFoodItem.FoodItem.brand})`} -{" "}
                                {loggedFoodItem.servingAmount || 1} {loggedFoodItem.loggedUnit} ({grams}g)
                              </div>
                              <div className="flex-none text-sm">
                                {calories} kcal
                                {calories && `, ${carbs}g Carbs, ${protein}g Protein, ${fat}g Fat`}
                              </div>
                              <div className="flex-none text-right text-gray-400 flex flex-col items-end">
                                <span>FoodItem: {loggedFoodItem.FoodItem?.id}</span>
                                <span>ID: {loggedFoodItem.id}</span>
                              </div>
                              {/* Arrow Icon */}
                              <div className="flex-none">
                                <button onClick={() => toggleExpand(loggedFoodItem.id!)} className="focus:outline-none">
                                  {isExpanded ? (
                                    <ChevronDownIcon className="h-5 w-5 text-gray-500" />
                                  ) : (
                                    <ChevronRightIcon className="h-5 w-5 text-gray-500" />
                                  )}
                                </button>
                              </div>
                            </div>
                            {/* Expanded Nutritional Info */}
                            {isExpanded && (
                              <div className="px-6 py-4 bg-gray-50">
                                {/* Nutritional Information */}
                                <div className="grid grid-cols-2 gap-4 text-sm">
                                  <div>
                                    <strong>Calories:</strong> {loggedFoodItem.kcal?.toFixed(1) || "N/A"} kcal
                                  </div>
                                  <div>
                                    <strong>Total Fat:</strong> {loggedFoodItem.totalFatG?.toFixed(1) || "N/A"} g
                                  </div>
                                  <div>
                                    <strong>Saturated Fat:</strong> {loggedFoodItem.satFatG?.toFixed(1) || "N/A"} g
                                  </div>
                                  <div>
                                    <strong>Trans Fat:</strong> {loggedFoodItem.transFatG?.toFixed(1) || "N/A"} g
                                  </div>
                                  <div>
                                    <strong>Cholesterol:</strong> {loggedFoodItem.cholesterolMg?.toFixed(1) || "N/A"} mg
                                  </div>
                                  <div>
                                    <strong>Sodium:</strong> {loggedFoodItem.sodiumMg?.toFixed(1) || "N/A"} mg
                                  </div>
                                  <div>
                                    <strong>Total Carbohydrate:</strong> {loggedFoodItem.carbG?.toFixed(1) || "N/A"} g
                                  </div>
                                  <div>
                                    <strong>Dietary Fiber:</strong> {loggedFoodItem.fiberG?.toFixed(1) || "N/A"} g
                                  </div>
                                  <div>
                                    <strong>Total Sugars:</strong> {loggedFoodItem.sugarG?.toFixed(1) || "N/A"} g
                                  </div>
                                  <div>
                                    <strong>Added Sugars:</strong> {loggedFoodItem.addedSugarG?.toFixed(1) || "N/A"} g
                                  </div>
                                  <div>
                                    <strong>Protein:</strong> {loggedFoodItem.proteinG?.toFixed(1) || "N/A"} g
                                  </div>
                                  <div>
                                    <strong>Vitamin D:</strong> {loggedFoodItem.vitaminDMcg?.toFixed(1) || "N/A"} µg
                                  </div>
                                  <div>
                                    <strong>Calcium:</strong> {loggedFoodItem.calciumMg?.toFixed(1) || "N/A"} mg
                                  </div>
                                  <div>
                                    <strong>Iron:</strong> {loggedFoodItem.ironMg?.toFixed(1) || "N/A"} mg
                                  </div>
                                  <div>
                                    <strong>Potassium:</strong> {loggedFoodItem.potassiumMg?.toFixed(1) || "N/A"} mg
                                  </div>
                                  <div>
                                    <strong>Caffeine:</strong> {loggedFoodItem.caffeineMg?.toFixed(1) || "N/A"} mg
                                  </div>
                                  <div>
                                    <strong>Water:</strong> {loggedFoodItem.waterMl?.toFixed(1) || "N/A"} ml
                                  </div>
                                  {/* Add more nutrients as needed */}
                                </div>
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  </li>
                )
              })}
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
