// src/app/admin/debug/page.tsx
"use client"

import { useState, useEffect, FormEvent, ReactNode, useMemo, useCallback, useRef, Fragment } from "react"
import {
  fetchMessages,
  MessageWithSignedUrls,
  LoggedFoodItemWithDetailsType,
  MessageSortField,
  MessageSortDirection,
  updateMessageDeletedAt,
  permanentlyDeleteMessage
} from "./actions"
import {
  PhotoIcon as PhotoOutlineIcon,
  MicrophoneIcon as MicrophoneOutlineIcon,
  TrashIcon as TrashOutlineIcon,
  ChevronDownIcon,
  XMarkIcon,
  ArrowsUpDownIcon,
  FunnelIcon
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
  const [progress, setProgress] = useState(0)
  const [showProgress, setShowProgress] = useState(false)
  const [sortBy, setSortBy] = useState<MessageSortField>("createdAt")
  const [sortDirection, setSortDirection] = useState<MessageSortDirection>("desc")
  const [isFilterDrawerOpen, setIsFilterDrawerOpen] = useState(false)
  const [actionTarget, setActionTarget] = useState<MessageWithSignedUrls | null>(null)
  const [actionMode, setActionMode] = useState<"soft" | "hard" | "restore">("soft")
  const [customDeletedAt, setCustomDeletedAt] = useState("")
  const [mutationFeedback, setMutationFeedback] = useState<
    { type: "success" | "error"; message: string } | null
  >(null)
  const [isMutating, setIsMutating] = useState(false)

  const router = useRouter()
  const isMountedRef = useRef(true)
  const requestIdRef = useRef(0)

  const sortOptions: { label: string; value: MessageSortField }[] = [
    { label: "Created time", value: "createdAt" },
    { label: "Resolved time", value: "resolvedAt" },
    { label: "Food logged time", value: "consumedOn" }
  ]

  const toDateTimeLocalValue = (iso?: string | null) => {
    if (!iso) {
      const now = new Date()
      return `${now.getFullYear()}-${`${now.getMonth() + 1}`.padStart(2, "0")}-${`${now.getDate()}`.padStart(2, "0")}T${`${now.getHours()}`.padStart(2, "0")}:${`${now.getMinutes()}`.padStart(2, "0")}`
    }
    const date = new Date(iso)
    if (Number.isNaN(date.getTime())) {
      return ""
    }
    return `${date.getFullYear()}-${`${date.getMonth() + 1}`.padStart(2, "0")}-${`${date.getDate()}`.padStart(2, "0")}T${`${date.getHours()}`.padStart(2, "0")}:${`${date.getMinutes()}`.padStart(2, "0")}`
  }

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
    setIsFilterDrawerOpen(false)
  }

  const handleClear = () => {
    setShowDeleted("all")
    setUserIdInput("")
    setUserIdFilter("")
    setHasImage("all")
    setMessageStatus("all")
    setCurrentPage(1) // Reset to first page on filter clear
    setIsFilterDrawerOpen(false)
  }

  const handleSelectUser = (id?: string | null) => {
    if (!id) return
    setUserIdInput(id)
    setUserIdFilter(id)
    setCurrentPage(1)
    if (typeof window !== "undefined") {
      window.scrollTo({ top: 0, behavior: "smooth" })
    }
  }

  const clearShowDeleted = useCallback(() => {
    setShowDeleted("all")
    setCurrentPage(1)
  }, [])

  const clearUserId = useCallback(() => {
    setUserIdInput("")
    setUserIdFilter("")
    setCurrentPage(1)
  }, [])

  const clearHasImage = useCallback(() => {
    setHasImage("all")
    setCurrentPage(1)
  }, [])

  const clearMessageStatus = useCallback(() => {
    setMessageStatus("all")
    setCurrentPage(1)
  }, [])

  const activeFilters = useMemo(
    () => {
      const filters: { label: string; onRemove: () => void }[] = []

      if (showDeleted !== "all") {
        filters.push({
          label: showDeleted === "deleted" ? "Deleted only" : "Not deleted",
          onRemove: clearShowDeleted
        })
      }

      if (userIdFilter) {
        filters.push({
          label: `User ${userIdFilter}`,
          onRemove: clearUserId
        })
      }

      if (hasImage !== "all") {
        filters.push({
          label: hasImage === "has-image" ? "Has image" : "No image",
          onRemove: clearHasImage
        })
      }

      if (messageStatus !== "all") {
        filters.push({
          label: `Status ${messageStatus}`,
          onRemove: clearMessageStatus
        })
      }

      return filters
    },
    [showDeleted, userIdFilter, hasImage, messageStatus, clearShowDeleted, clearUserId, clearHasImage, clearMessageStatus]
  )

  const hasActiveFilters = activeFilters.length > 0

  const renderFilterPanel = (variant: "sidebar" | "drawer") => (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-base font-semibold text-slate-900">Filters</h2>
        {hasActiveFilters && (
          <button
            type="button"
            onClick={handleClear}
            className="rounded-full border border-transparent bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600 transition hover:bg-slate-200 hover:text-slate-800"
          >
            Clear all
          </button>
        )}
      </div>
      <form className="space-y-5" onSubmit={handleApply}>
        <div className="space-y-2">
          <label htmlFor={`show-deleted-${variant}`} className="block text-xs font-semibold uppercase tracking-wide text-slate-500">
            Show Deleted
          </label>
          <select
            id={`show-deleted-${variant}`}
            name="show-deleted"
            value={showDeleted}
            onChange={(e) => {
              setShowDeleted(e.target.value)
              setCurrentPage(1)
            }}
            className="block w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm transition focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-100"
          >
            <option value="all">All messages</option>
            <option value="deleted">Deleted only</option>
            <option value="not-deleted">Not deleted</option>
          </select>
        </div>

        <div className="space-y-2">
          <label htmlFor={`user-id-${variant}`} className="block text-xs font-semibold uppercase tracking-wide text-slate-500">
            User ID
          </label>
          <input
            type="text"
            id={`user-id-${variant}`}
            name="user-id"
            value={userIdInput}
            onChange={(e) => setUserIdInput(e.target.value)}
            placeholder="Search by user id"
            className="block w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm transition placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-100"
          />
        </div>

        <div className="space-y-2">
          <label htmlFor={`has-image-${variant}`} className="block text-xs font-semibold uppercase tracking-wide text-slate-500">
            Has Image
          </label>
          <select
            id={`has-image-${variant}`}
            name="has-image"
            value={hasImage}
            onChange={(e) => {
              setHasImage(e.target.value)
              setCurrentPage(1)
            }}
            className="block w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm transition focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-100"
          >
            <option value="all">All messages</option>
            <option value="has-image">Has image</option>
            <option value="no-image">No image</option>
          </select>
        </div>

        <div className="space-y-2">
          <label htmlFor={`message-status-${variant}`} className="block text-xs font-semibold uppercase tracking-wide text-slate-500">
            Message Status
          </label>
          <select
            id={`message-status-${variant}`}
            name="message-status"
            value={messageStatus}
            onChange={(e) => {
              setMessageStatus(e.target.value)
              setCurrentPage(1)
            }}
            className="block w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm transition focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-100"
          >
            <option value="all">All statuses</option>
            <option value="RECEIVED">Received</option>
            <option value="FAILED">Failed</option>
            <option value="PROCESSING">Processing</option>
            <option value="RESOLVED">Resolved</option>
          </select>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row">
          <button
            type="submit"
            className="flex-1 rounded-xl bg-indigo-600 px-3 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600"
          >
            Apply filters
          </button>
          <button
            type="button"
            onClick={handleClear}
            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-600 shadow-sm transition hover:border-indigo-200 hover:text-indigo-600"
          >
            Reset
          </button>
        </div>
      </form>
    </div>
  )

  const handleSortByChange = (value: MessageSortField) => {
    setSortBy(value)
    setCurrentPage(1)
  }

  const toggleSortDirection = () => {
    setSortDirection((prev) => (prev === "asc" ? "desc" : "asc"))
    setCurrentPage(1)
  }

  const openMessageActions = (message: MessageWithSignedUrls) => {
    setIsMutating(false)
    setActionTarget(message)
    setActionMode(message.deletedAt ? "restore" : "soft")
    setCustomDeletedAt(toDateTimeLocalValue(message.deletedAt))
  }

  const closeMessageActions = () => {
    setActionTarget(null)
    setActionMode("soft")
    setCustomDeletedAt("")
    setIsMutating(false)
  }

  const handleSubmitMessageAction = async () => {
    if (!actionTarget?.id) return

    const targetId = actionTarget.id
    setIsMutating(true)

    try {
      if (actionMode === "hard") {
        const result = await permanentlyDeleteMessage(targetId)
        if (result.error) {
          throw new Error(result.error)
        }
        setMutationFeedback({ type: "success", message: `Message ${targetId} permanently deleted.` })
      } else {
        let deletedAt: string | null = null
        if (actionMode === "soft") {
          const timestamp = customDeletedAt || toDateTimeLocalValue()
          const parsed = new Date(timestamp)
          if (Number.isNaN(parsed.getTime())) {
            throw new Error("Please provide a valid deletion timestamp.")
          }
          deletedAt = parsed.toISOString()
        }

        const result = await updateMessageDeletedAt(targetId, deletedAt)
        if (result.error) {
          throw new Error(result.error)
        }

        const successMessage =
          actionMode === "restore"
            ? `Message ${targetId} restored.`
            : `Message ${targetId} marked as deleted${deletedAt ? " with updated timestamp" : ""}.`
        setMutationFeedback({ type: "success", message: successMessage })
      }

      closeMessageActions()
      await fetchData()
    } catch (error) {
      setMutationFeedback({
        type: "error",
        message: error instanceof Error ? error.message : "Unable to update message."
      })
    } finally {
      setIsMutating(false)
    }
  }

  const fetchData = useCallback(async () => {
    const requestId = ++requestIdRef.current

    setLoading(true)
    setError(null)
    setUnauthorized(false)
    setShowProgress(true)
    setProgress((prev) => (prev > 15 ? prev : 15))

    const response = await fetchMessages(
      currentPage,
      ITEMS_PER_PAGE,
      showDeleted,
      userIdFilter.trim(),
      hasImage,
      messageStatus,
      sortBy,
      sortDirection
    )

    if (!isMountedRef.current || requestId !== requestIdRef.current) {
      return
    }

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
  }, [currentPage, showDeleted, userIdFilter, hasImage, messageStatus, sortBy, sortDirection])

  useEffect(() => {
    isMountedRef.current = true
    fetchData()
    return () => {
      isMountedRef.current = false
    }
  }, [fetchData])

  useEffect(() => {
    if (!loading) return

    const interval = setInterval(() => {
      setProgress((prev) => {
        if (prev >= 90) {
          return prev
        }
        const increment = Math.random() * 12
        return Math.min(prev + increment, 90)
      })
    }, 220)

    return () => clearInterval(interval)
  }, [loading])

  useEffect(() => {
    if (loading || !showProgress) return

    setProgress(100)

    const timeout = setTimeout(() => {
      setShowProgress(false)
      setProgress(0)
    }, 400)

    return () => clearTimeout(timeout)
  }, [loading, showProgress])

  useEffect(() => {
    if (!mutationFeedback) return

    const timeout = setTimeout(() => setMutationFeedback(null), 5000)
    return () => clearTimeout(timeout)
  }, [mutationFeedback])

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
    <Fragment>
      <div className="relative min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-100 pb-16">
      {showProgress && (
        <div className="fixed inset-x-0 top-0 z-50 h-1 bg-slate-200/60 backdrop-blur">
          <div
            className="h-full w-full origin-left rounded-r-full bg-gradient-to-r from-indigo-500 via-sky-500 to-emerald-500 transition-[width] duration-200 ease-out"
            style={{ width: `${progress}%` }}
          />
        </div>
      )}
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-6 sm:px-6 lg:flex-row lg:px-8 lg:py-10">
        <aside className="hidden w-full lg:block lg:w-72">
          <div className="sticky top-24 rounded-2xl border border-slate-200 bg-white/80 p-6 shadow-sm backdrop-blur">
            {renderFilterPanel("sidebar")}
          </div>
        </aside>
        <section className="flex-1 space-y-6">
          {mutationFeedback && (
            <div
              className={classNames(
                "flex items-center justify-between gap-3 rounded-2xl border px-4 py-3 text-sm shadow-sm",
                mutationFeedback.type === "success"
                  ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                  : "border-rose-200 bg-rose-50 text-rose-800"
              )}
            >
              <span>{mutationFeedback.message}</span>
              <button
                type="button"
                onClick={() => setMutationFeedback(null)}
                className="rounded-full border border-transparent p-1 text-current transition hover:border-current/40"
              >
                <span className="sr-only">Dismiss notification</span>
                <XMarkIcon className="h-4 w-4" />
              </button>
            </div>
          )}
          <div className="rounded-2xl border border-slate-200 bg-white/80 p-6 shadow-sm backdrop-blur">
            <div className="flex flex-wrap items-center gap-3">
              <div>
                <h1 className="text-xl font-semibold text-slate-900">Debug Messages</h1>
                <p className="text-sm text-slate-500">
                  Investigate user conversations, pipeline status, and their logged food items in one place.
                </p>
              </div>
              <div className="ml-auto flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => setIsFilterDrawerOpen(true)}
                  className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-600 shadow-sm transition hover:border-indigo-200 hover:text-indigo-600 lg:hidden"
                >
                  <FunnelIcon className="h-4 w-4" />
                  Filters
                </button>
                <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600">
                  {totalMessages} total
                </span>
                <span className="rounded-full bg-indigo-100 px-3 py-1 text-xs font-medium text-indigo-700">
                  Page {currentPage}
                </span>
              </div>
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-2">
                <label htmlFor="sort-by" className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Sort by
                </label>
                <select
                  id="sort-by"
                  value={sortBy}
                  onChange={(e) => handleSortByChange(e.target.value as MessageSortField)}
                  className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm transition focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-100"
                >
                  {sortOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>
              <button
                type="button"
                onClick={toggleSortDirection}
                className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-600 shadow-sm transition hover:border-indigo-200 hover:text-indigo-600"
              >
                <ArrowsUpDownIcon className="h-4 w-4" />
                {sortDirection === "asc" ? "Oldest first" : "Newest first"}
              </button>
            </div>
            <div className="mt-4">
              {hasActiveFilters ? (
                <div className="flex flex-wrap gap-2">
                  {activeFilters.map(({ label, onRemove }) => (
                    <span
                      key={label}
                      className="group inline-flex items-center gap-2 rounded-full border border-indigo-200 bg-indigo-50/70 px-3 py-1 text-xs font-medium text-indigo-700"
                    >
                      {label}
                      <button
                        type="button"
                        onClick={onRemove}
                        className="rounded-full p-1 text-indigo-500 transition hover:bg-indigo-100 hover:text-indigo-700"
                      >
                        <span className="sr-only">Remove</span>
                        <XMarkIcon className="h-4 w-4" />
                      </button>
                    </span>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-slate-500">No filters applied.</p>
              )}
            </div>
          </div>

          <div className="space-y-4">
            {loading ? (
              <ul className="space-y-3">
                {Array.from({ length: 3 }).map((_, index) => (
                  <li
                    key={index}
                    style={{ animationDelay: `${index * 80}ms` }}
                    className="animate-fade-in-up opacity-0 rounded-2xl border border-slate-200 bg-white/70 p-6 shadow-sm"
                  >
                    <div className="flex flex-wrap items-center gap-4">
                      <div className="h-10 w-10 rounded-full bg-slate-200/60 skeleton-shimmer" />
                      <div className="h-3 w-32 rounded-full bg-slate-200/60 skeleton-shimmer" />
                      <div className="h-3 w-28 rounded-full bg-slate-200/60 skeleton-shimmer" />
                      <div className="h-3 flex-1 rounded-full bg-slate-200/60 skeleton-shimmer" />
                    </div>
                    <div className="mt-4 space-y-2">
                      <div className="h-3 w-full rounded-full bg-slate-200/60 skeleton-shimmer" />
                      <div className="h-3 w-3/4 rounded-full bg-slate-200/60 skeleton-shimmer" />
                    </div>
                    <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
                      {Array.from({ length: 4 }).map((__, metaIndex) => (
                        <div
                          key={metaIndex}
                          className="h-16 rounded-2xl border border-slate-200 bg-slate-100/80 skeleton-shimmer"
                        />
                      ))}
                    </div>
                  </li>
                ))}
              </ul>
            ) : error ? (
              <div className="animate-fade-in-up opacity-0 rounded-2xl border border-rose-200 bg-rose-50 p-6 text-rose-800 shadow-sm">
                <h3 className="text-sm font-semibold">Something went wrong</h3>
                <p className="mt-2 text-sm">{error}</p>
              </div>
            ) : messages.length === 0 ? (
              <div className="animate-fade-in-up opacity-0 rounded-2xl border border-slate-200 bg-white/80 p-12 text-center shadow-sm">
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-indigo-100 text-indigo-600">
                  <PhotoOutlineIcon className="h-6 w-6" />
                </div>
                <h3 className="mt-4 text-lg font-semibold text-slate-900">No messages found</h3>
                <p className="mt-2 text-sm text-slate-500">
                  Adjust your filters or try a different user to see messages in this feed.
                </p>
              </div>
            ) : (
              <>
                <ul role="list" className="space-y-4">
                  {messages.map((message, index) => {
                    const createdAt = message.createdAt ? new Date(message.createdAt).toLocaleString() : "N/A"
                    const consumedAt = message.consumedOn ? new Date(message.consumedOn).toLocaleString() : "N/A"
                    const resolvedAt = message.resolvedAt ? new Date(message.resolvedAt).toLocaleString() : "N/A"
                    const messageContent = message.content || ""
                    const statusLabel = message.status || "UNKNOWN"
                    const statusClass = STATUS_STYLES[statusLabel] ?? "bg-slate-200 text-slate-800 border border-slate-300"
                    const progressLabel =
                      message.itemsProcessed != null || message.itemsToProcess != null
                        ? `${message.itemsProcessed ?? 0}${
                            message.itemsToProcess != null ? ` / ${message.itemsToProcess}` : ""
                          }`
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
                            className="break-all text-left font-medium text-indigo-600 transition hover:text-indigo-700 hover:underline"
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
                        key={message.id ?? index}
                        style={{ animationDelay: `${index * 60}ms` }}
                        className={classNames(
                          "animate-fade-in-up opacity-0 rounded-2xl border border-slate-200 bg-white/95 p-6 shadow-sm transition-all duration-300 hover:-translate-y-1 hover:border-indigo-200 hover:shadow-xl",
                          message.deletedAt ? "border-rose-200 bg-rose-50/90" : ""
                        )}
                      >
                        <div className="flex flex-wrap items-center gap-4 text-xs text-slate-500 sm:text-sm">
                          <div className="flex min-w-[2.5rem] items-center gap-2">
                            {message.deletedAt && <TrashOutlineIcon className="h-5 w-5 text-rose-500" />}
                            {message.imageUrls.length > 0 && (
                              <a
                                href={message.imageUrls[0]}
                                target="_blank"
                                rel="noopener noreferrer"
                                title={`Open first image (${message.imageUrls.length} total)`}
                                className="text-slate-500 transition hover:text-indigo-500"
                              >
                                <PhotoOutlineIcon className="h-5 w-5" />
                              </a>
                            )}
                            {message.isAudio && <MicrophoneOutlineIcon className="h-5 w-5 text-slate-500" />}
                          </div>
                          <div className="flex flex-wrap items-center gap-3">
                            <div className="flex items-center gap-1">
                              <span className="text-[11px] uppercase tracking-wide text-slate-400">Created</span>
                              <time className="font-medium text-slate-700">{createdAt}</time>
                            </div>
                            <div className="flex items-center gap-1">
                              <span className="text-[11px] uppercase tracking-wide text-slate-400">Consumed</span>
                              <time className="font-medium text-slate-700">{consumedAt}</time>
                            </div>
                            <div className="flex items-center gap-1">
                              <span className="text-[11px] uppercase tracking-wide text-slate-400">Resolved</span>
                              <time className="font-medium text-slate-700">{resolvedAt}</time>
                            </div>
                          </div>
                          <div className="ml-auto flex flex-wrap items-center gap-2">
                            <button
                              type="button"
                              onClick={() => openMessageActions(message)}
                              className="inline-flex items-center gap-2 rounded-full border border-indigo-200 bg-white px-3 py-1 text-xs font-semibold text-indigo-600 shadow-sm transition hover:bg-indigo-50"
                            >
                              Manage
                            </button>
                            <span
                              className={classNames(
                                "inline-flex items-center rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-wide",
                                statusClass
                              )}
                            >
                              {statusLabel}
                            </span>
                          </div>
                        </div>
                        <div className="mt-4 rounded-xl border border-slate-200/70 bg-white/80 p-4 text-sm text-slate-800 shadow-inner">
                          {messageContent ? (
                            <span className="whitespace-pre-wrap break-words">{messageContent}</span>
                          ) : (
                            <span className="italic text-slate-500">No content provided</span>
                          )}
                        </div>
                        {metaDetails.length > 0 && (
                          <dl className="mt-4 grid grid-cols-1 gap-4 text-xs text-slate-600 sm:grid-cols-2 lg:grid-cols-3">
                            {metaDetails.map(({ label, value }) => (
                              <div
                                key={label}
                                className="rounded-xl border border-slate-200 bg-white/70 p-3 shadow-inner"
                              >
                                <dt className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                                  {label}
                                </dt>
                                <dd className="mt-1 break-all font-medium text-slate-700">{value}</dd>
                              </div>
                            ))}
                          </dl>
                        )}

                        {loggedFoodItemsByMessage[message.id!]?.length ? (
                          <div className="mt-5 space-y-3">
                            {loggedFoodItemsByMessage[message.id!]?.map((loggedFoodItem) => {
                              const grams = loggedFoodItem.grams || 0
                              const calories = loggedFoodItem.kcal?.toFixed(0) || ""
                              const carbs = loggedFoodItem.carbG?.toFixed(1) || ""
                              const protein = loggedFoodItem.proteinG?.toFixed(1) || ""
                              const fat = loggedFoodItem.totalFatG?.toFixed(1) || ""
                              const isExpanded = expandedFoodItems[loggedFoodItem.id!] || false
                              const panelId = `food-item-panel-${loggedFoodItem.id}`

                              return (
                                <div
                                  key={loggedFoodItem.id}
                                  className={classNames(
                                    "overflow-hidden rounded-2xl border border-slate-200 bg-slate-50/80 shadow-inner transition-all duration-300 hover:border-indigo-200",
                                    loggedFoodItem.deletedAt ? "border-rose-200 bg-rose-50/90" : ""
                                  )}
                                >
                                  <div className="flex flex-wrap items-center gap-3 px-4 py-3 text-sm text-slate-600">
                                    {loggedFoodItem.pathToImage && (
                                      <img
                                        src={loggedFoodItem.pathToImage}
                                        alt="Food Item"
                                        className="h-10 w-10 rounded-full border border-white/70 object-cover shadow"
                                      />
                                    )}
                                    <div className="flex-1 min-w-[12rem] break-words">
                                      <p className="font-semibold text-slate-800">
                                        {loggedFoodItem.FoodItem?.name || "Unknown"}
                                        {loggedFoodItem.FoodItem?.brand && ` (${loggedFoodItem.FoodItem.brand})`}
                                      </p>
                                      <p className="text-xs text-slate-500">
                                        {loggedFoodItem.servingAmount || 1} {loggedFoodItem.loggedUnit} ({grams}g)
                                      </p>
                                    </div>
                                    <div className="text-sm font-medium text-slate-700">
                                      {calories} kcal
                                      {calories && ` · ${carbs}g C · ${protein}g P · ${fat}g F`}
                                    </div>
                                    <div className="text-right text-[11px] text-slate-400">
                                      <div>Food {loggedFoodItem.FoodItem?.id ?? "—"}</div>
                                      <div>ID {loggedFoodItem.id}</div>
                                    </div>
                                    <button
                                      type="button"
                                      aria-expanded={isExpanded}
                                      aria-controls={panelId}
                                      onClick={() => toggleExpand(loggedFoodItem.id!)}
                                      className="flex h-8 w-8 items-center justify-center rounded-full border border-transparent text-slate-500 transition hover:border-indigo-200 hover:text-indigo-600"
                                    >
                                      <ChevronDownIcon
                                        className={classNames(
                                          "h-5 w-5 transition-transform duration-300",
                                          isExpanded ? "rotate-180" : ""
                                        )}
                                      />
                                      <span className="sr-only">Toggle nutrient details</span>
                                    </button>
                                  </div>
                                  <div
                                    id={panelId}
                                    className={classNames(
                                      "disclosure-panel-transition border-t border-slate-200/70 bg-white/70 px-6 py-4 text-sm text-slate-700",
                                      isExpanded ? "disclosure-panel-open" : "disclosure-panel-closed"
                                    )}
                                  >
                                    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
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
                                        <strong>Total Carbs:</strong> {loggedFoodItem.carbG?.toFixed(1) || "N/A"} g
                                      </div>
                                      <div>
                                        <strong>Fiber:</strong> {loggedFoodItem.fiberG?.toFixed(1) || "N/A"} g
                                      </div>
                                      <div>
                                        <strong>Sugars:</strong> {loggedFoodItem.sugarG?.toFixed(1) || "N/A"} g
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
                                    </div>
                                  </div>
                                </div>
                              )
                            })}
                          </div>
                        ) : null}
                      </li>
                    )
                  })}
                </ul>
                <div className="rounded-2xl border border-slate-200 bg-white/80 p-4 shadow-sm backdrop-blur">
                  <Pagination
                    currentPage={currentPage}
                    setCurrentPage={setCurrentPage}
                    totalItems={totalMessages}
                    itemsPerPage={ITEMS_PER_PAGE}
                    maxVisiblePages={MAX_VISIBLE_PAGES}
                  />
                </div>
              </>
            )}
          </div>
        </section>
      </div>
      </div>
      {isFilterDrawerOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/40 px-4 pb-8 backdrop-blur-sm sm:items-center">
          <button
            type="button"
            className="absolute inset-0"
            aria-label="Close filters"
            onClick={() => setIsFilterDrawerOpen(false)}
          />
          <div className="relative w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-xl">
            <button
              type="button"
              onClick={() => setIsFilterDrawerOpen(false)}
              className="absolute right-4 top-4 rounded-full border border-transparent p-1 text-slate-400 transition hover:border-slate-200 hover:text-slate-600"
            >
              <span className="sr-only">Close filters</span>
              <XMarkIcon className="h-5 w-5" />
            </button>
            <div className="max-h-[70vh] overflow-y-auto pr-1">{renderFilterPanel("drawer")}</div>
          </div>
        </div>
      )}
      {actionTarget && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/50 px-4 pb-8 backdrop-blur-sm sm:items-center">
          <button
            type="button"
            className="absolute inset-0"
            aria-label="Dismiss message actions"
            onClick={() => {
              if (!isMutating) {
                closeMessageActions()
              }
            }}
          />
          <div className="relative w-full max-w-xl rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">Manage message</h2>
                <p className="text-sm text-slate-500">Choose how you want to handle this message. Soft delete keeps the record but updates the timestamp.</p>
              </div>
              <button
                type="button"
                onClick={() => {
                  if (!isMutating) {
                    closeMessageActions()
                  }
                }}
                className="rounded-full border border-transparent p-1 text-slate-400 transition hover:border-slate-200 hover:text-slate-600"
                disabled={isMutating}
              >
                <span className="sr-only">Close manage message dialog</span>
                <XMarkIcon className="h-5 w-5" />
              </button>
            </div>
            <div className="mt-4 space-y-4">
              <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-4 text-sm text-slate-700">
                <p>
                  <span className="font-semibold text-slate-900">Message ID:</span> {actionTarget.id}
                </p>
                <p>
                  <span className="font-semibold text-slate-900">Current deleted at:</span>{" "}
                  {actionTarget.deletedAt ? new Date(actionTarget.deletedAt).toLocaleString() : "Not deleted"}
                </p>
              </div>
              <fieldset className="space-y-3">
                <legend className="text-sm font-semibold text-slate-800">Action</legend>
                <label className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 transition hover:border-indigo-200">
                  <input
                    type="radio"
                    name="message-action"
                    value="soft"
                    checked={actionMode === "soft"}
                    onChange={() => {
                      setActionMode("soft")
                      setCustomDeletedAt((prev) => prev || toDateTimeLocalValue(actionTarget?.deletedAt))
                    }}
                    className="h-4 w-4 border-slate-300 text-indigo-600 focus:ring-indigo-500"
                  />
                  <div>
                    <p className="font-medium text-slate-900">Soft delete</p>
                    <p className="text-xs text-slate-500">Keep the message but set a deleted timestamp.</p>
                  </div>
                </label>
                {actionMode === "soft" && (
                  <div className="ml-7 space-y-2">
                    <label htmlFor="deleted-at-input" className="block text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Deletion timestamp
                    </label>
                    <input
                      id="deleted-at-input"
                      type="datetime-local"
                      value={customDeletedAt}
                      onChange={(e) => setCustomDeletedAt(e.target.value)}
                      className="block w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm transition focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-100"
                    />
                  </div>
                )}
                <label className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 transition hover:border-indigo-200">
                  <input
                    type="radio"
                    name="message-action"
                    value="restore"
                    checked={actionMode === "restore"}
                    onChange={() => setActionMode("restore")}
                    className="h-4 w-4 border-slate-300 text-indigo-600 focus:ring-indigo-500"
                  />
                  <div>
                    <p className="font-medium text-slate-900">Restore</p>
                    <p className="text-xs text-slate-500">Clear the deleted timestamp and bring the message back.</p>
                  </div>
                </label>
                <label className="flex items-center gap-3 rounded-xl border border-rose-200 bg-white px-3 py-2 text-sm text-rose-600 transition hover:border-rose-300">
                  <input
                    type="radio"
                    name="message-action"
                    value="hard"
                    checked={actionMode === "hard"}
                    onChange={() => setActionMode("hard")}
                    className="h-4 w-4 border-rose-300 text-rose-600 focus:ring-rose-500"
                  />
                  <div>
                    <p className="font-medium text-rose-700">Hard delete</p>
                    <p className="text-xs text-rose-500">Remove the message permanently from Supabase.</p>
                  </div>
                </label>
              </fieldset>
              <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  onClick={() => {
                    if (!isMutating) {
                      closeMessageActions()
                    }
                  }}
                  className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-600 shadow-sm transition hover:border-slate-300 hover:text-slate-800 disabled:opacity-60"
                  disabled={isMutating}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSubmitMessageAction}
                  className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-500 disabled:opacity-60"
                  disabled={isMutating}
                >
                  {isMutating ? "Saving..." : "Confirm"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </Fragment>
  )
}

export default MessagesOverview
