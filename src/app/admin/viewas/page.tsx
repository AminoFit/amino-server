// src/app/admin/viewas/page.tsx
"use client"

import { FormEvent, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react"
import classNames from "classnames"
import moment from "moment-timezone"
import {
  ArrowPathIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  MagnifyingGlassIcon,
  TrashIcon
} from "@heroicons/react/24/outline"
import { usePathname, useRouter, useSearchParams } from "next/navigation"

import {
  AdminDailyFoodResponse,
  AdminLoggedFoodItem,
  AdminViewUserListItem,
  fetchTopUsers,
  fetchUserDailyFood,
  deleteLoggedFoodItem,
  getLastLoggedDate
} from "./actions"
import { getNormalizedFoodValue } from "@/app/dashboard/utils/FoodHelper"

const DEFAULT_IMAGE_URL =
  "https://cdn.discordapp.com/ephemeral-attachments/1107010584907612172/1141797943712690206/coudron_food_photography_of_cutting_board_on_a_wooden_table_top_bcc64dcd-7a9a-4595-8f41-0b394b6c5033.png"

const DATE_FORMAT = "YYYY-MM-DD"

type MealKey = "breakfast" | "lunch" | "dinner" | "other"

interface MealGroup {
  id: string
  meal: MealKey
  title: string
  items: AdminLoggedFoodItem[]
  message?: AdminLoggedFoodItem["Message"] | null
  messageImageUrls?: string[]
  startTime: string
}

export default function AdminViewAsPage() {
  return (
    <>
      <Suspense fallback={<AdminViewAsFallback />}>
        <AdminViewAsPageContent />
      </Suspense>
      <style jsx global>{`
        @keyframes fadeCardIn {
          from {
            opacity: 0;
            transform: translateY(16px) scale(0.98);
          }
          to {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
        }

        .card-fade-in {
          opacity: 0;
          animation: fadeCardIn 0.4s ease-out forwards;
        }
      `}</style>
    </>
  )
}

function AdminViewAsFallback() {
  return (
    <div className="flex h-40 items-center justify-center text-sm text-zinc-500">
      Loading admin tools…
    </div>
  )
}

function AdminViewAsPageContent() {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const initialUserParam = searchParams.get("user")
  const initialDateParam = searchParams.get("date")
  const initialDateMoment =
    initialDateParam && moment(initialDateParam, DATE_FORMAT, true).isValid()
      ? moment(initialDateParam, DATE_FORMAT)
      : moment()

  const initialDate = initialDateMoment.format(DATE_FORMAT)

  const [users, setUsers] = useState<AdminViewUserListItem[]>([])
  const [isLoadingUsers, setIsLoadingUsers] = useState(false)
  const [userError, setUserError] = useState<string | null>(null)
  const [searchTerm, setSearchTerm] = useState("")

  const [selectedUserId, setSelectedUserId] = useState<string | null>(initialUserParam)
  const [selectedDate, setSelectedDate] = useState(initialDate)

  const [dailyFood, setDailyFood] = useState<AdminDailyFoodResponse | null>(null)
  const [isLoadingFoods, setIsLoadingFoods] = useState(false)
  const [foodError, setFoodError] = useState<string | null>(null)
  const [deletingFoodId, setDeletingFoodId] = useState<number | null>(null)
  const [isJumpingToLast, setIsJumpingToLast] = useState(false)

  const selectedUserRef = useRef<string | null>(initialUserParam)
  const selectedDateRef = useRef(initialDate)

  const fetchDailyData = useCallback(
    async (userId: string, date: string) => {
      setIsLoadingFoods(true)
      setFoodError(null)
      try {
        const data = await fetchUserDailyFood(userId, date)
        setDailyFood(data)
      } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to load food data"
        setFoodError(message)
        setDailyFood(null)
      } finally {
        setIsLoadingFoods(false)
      }
    },
    []
  )

  useEffect(() => {
    selectedUserRef.current = selectedUserId
  }, [selectedUserId])

  useEffect(() => {
    selectedDateRef.current = selectedDate
  }, [selectedDate])

  const syncUrl = useCallback(
    (nextUserId: string | null, nextDate?: string) => {
      const effectiveDate = nextDate ?? selectedDateRef.current
      const params = new URLSearchParams()

      if (nextUserId) {
        params.set("user", nextUserId)
      }

      if (effectiveDate) {
        params.set("date", effectiveDate)
      }

      const queryString = params.toString()
      const nextUrl = queryString ? `${pathname}?${queryString}` : pathname
      router.replace(nextUrl, { scroll: false })
    },
    [pathname, router]
  )

  const setUserAndUrl = useCallback(
    (nextUserId: string | null, nextDate?: string) => {
      setSelectedUserId(nextUserId)
      syncUrl(nextUserId, nextDate)
    },
    [syncUrl]
  )

  const setDateAndUrl = useCallback(
    (nextDate: string) => {
      setSelectedDate(nextDate)
      syncUrl(selectedUserRef.current, nextDate)
    },
    [syncUrl]
  )

  const loadUsers = useCallback(
    async (term = "") => {
      setIsLoadingUsers(true)
      setUserError(null)
      try {
        const data = await fetchTopUsers(100, term)
        setUsers(data)

        const currentSelectedUserId = selectedUserRef.current
        const currentDate = selectedDateRef.current

        if (!data.length) {
          if (currentSelectedUserId) {
            setUserAndUrl(null, currentDate)
          }
          return
        }

        const isSelectedPresent = currentSelectedUserId
          ? data.some((user) => user.id === currentSelectedUserId)
          : false

        if (!currentSelectedUserId || !isSelectedPresent) {
          setUserAndUrl(data[0].id, currentDate)
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to load users"
        setUserError(message)
        setUsers([])
        setUserAndUrl(null)
      } finally {
        setIsLoadingUsers(false)
      }
    },
    [setUserAndUrl]
  )

  useEffect(() => {
    loadUsers()
  }, [loadUsers])

  useEffect(() => {
    if (!selectedUserId) {
      setDailyFood(null)
      return
    }

    fetchDailyData(selectedUserId, selectedDate)
  }, [selectedUserId, selectedDate, fetchDailyData])

  const selectedUser = useMemo(
    () => users.find((user) => user.id === selectedUserId) ?? null,
    [users, selectedUserId]
  )

  const timezone = dailyFood?.user?.tzIdentifier || selectedUser?.tzIdentifier || moment.tz.guess()

  const groupedMeals = useMemo(() => {
    const foodEntries: AdminLoggedFoodItem[] = dailyFood?.foods ?? []

    const buckets: Record<MealKey, MealGroup[]> = {
      breakfast: [],
      lunch: [],
      dinner: [],
      other: []
    }

    const messageGroups = new Map<number, MealGroup>()

    const determineMeal = (time: moment.Moment): MealKey => {
      if (!time.isValid()) {
        return "other"
      }
      const hour = time.hour()
      if (hour < 10) return "breakfast"
      if (hour < 15) return "lunch"
      if (hour < 22) return "dinner"
      return "other"
    }

    for (const item of foodEntries) {
      const time = moment(item.consumedOn).tz(timezone)
      const meal = determineMeal(time)
      const startTime = item.consumedOn ?? item.createdAt ?? new Date().toISOString()

      if (item.Message?.id) {
        const messageId = item.Message.id
        let group = messageGroups.get(messageId)
        if (!group) {
          const headline = item.Message.content?.trim()
            ? item.Message.content.trim()
            : item.Message.hasimages
            ? "Photo food log"
            : "Coach message"

          group = {
            id: `message-${messageId}`,
            meal,
            title: headline,
            items: [],
            message: item.Message,
            messageImageUrls: item.messageImageUrls,
            startTime
          }

          messageGroups.set(messageId, group)
          buckets[meal].push(group)
        }

        group.items.push(item)
        if (new Date(startTime).getTime() < new Date(group.startTime).getTime()) {
          group.startTime = startTime
        }
        if (!group.messageImageUrls?.length && item.messageImageUrls?.length) {
          group.messageImageUrls = item.messageImageUrls
        }
      } else {
        buckets[meal].push({
          id: `manual-${item.id}`,
          meal,
          title: item.FoodItem?.name || "Manual entry",
          items: [item],
          message: null,
          startTime,
          messageImageUrls: undefined
        })
      }
    }

    (Object.keys(buckets) as MealKey[]).forEach((key) => {
      buckets[key].sort(
        (a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime()
      )
    })

    return buckets
  }, [dailyFood?.foods, timezone])

  const handleDeleteFoodItem = useCallback(
    async (food: AdminLoggedFoodItem) => {
      if (!selectedUserId) {
        return
      }

      if (typeof window !== "undefined") {
        const confirmDelete = window.confirm(`Permanently delete logged food #${food.id}?`)
        if (!confirmDelete) {
          return
        }
      }

      setDeletingFoodId(food.id)
      try {
        await deleteLoggedFoodItem(food.id)
        await fetchDailyData(selectedUserId, selectedDate)
      } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to delete food item"
        setFoodError(message)
      } finally {
        setDeletingFoodId(null)
      }
    },
    [selectedUserId, selectedDate, fetchDailyData]
  )

  const handleGoToLastDay = useCallback(async () => {
    if (!selectedUserId) {
      return
    }

    setIsJumpingToLast(true)
    setFoodError(null)

    try {
      const lastDateIso = await getLastLoggedDate(selectedUserId, selectedDate)

      if (!lastDateIso) {
        setFoodError("No logged food found for this user yet.")
        return
      }

      const nextDate = moment(lastDateIso).tz(timezone).format(DATE_FORMAT)
      setDateAndUrl(nextDate)
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to find last logged day"
      setFoodError(message)
    } finally {
      setIsJumpingToLast(false)
    }
  }, [selectedUserId, selectedDate, timezone, setDateAndUrl])

  const handleSearchSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    loadUsers(searchTerm)
  }

  const handleResetSearch = () => {
    setSearchTerm("")
    loadUsers("")
  }

  const handlePrevDay = () => {
    const nextDate = moment(selectedDate, DATE_FORMAT).subtract(1, "day").format(DATE_FORMAT)
    setDateAndUrl(nextDate)
  }

  const handleNextDay = () => {
    const nextDate = moment(selectedDate, DATE_FORMAT).add(1, "day").format(DATE_FORMAT)
    setDateAndUrl(nextDate)
  }

  const handleToday = () => {
    const today = moment().format(DATE_FORMAT)
    setDateAndUrl(today)
  }

  return (
    <div className="space-y-10 rounded-3xl bg-gradient-to-br from-amino-50/60 via-white to-transparent p-4 shadow-inner sm:p-6">
      <div className="flex flex-col gap-6 lg:flex-row">
        <aside className="lg:w-80 lg:flex-none">
          <div className="rounded-2xl border border-zinc-200/70 bg-white/80 p-4 shadow-md backdrop-blur">
            <div className="mb-4">
              <h1 className="text-lg font-semibold text-zinc-900">View As</h1>
              <p className="text-sm text-zinc-500">Pick a user to mirror their daily food log.</p>
            </div>
            <form onSubmit={handleSearchSubmit} className="mb-4">
              <label htmlFor="search" className="sr-only">
                Search users
              </label>
              <div className="relative">
                <MagnifyingGlassIcon className="pointer-events-none absolute left-3 top-2.5 h-5 w-5 text-zinc-400" />
                <input
                  id="search"
                  name="search"
                  value={searchTerm}
                  onChange={(event) => setSearchTerm(event.target.value)}
                  placeholder="Search by name or email"
                  className="w-full rounded-md border border-zinc-200 py-2 pl-9 pr-3 text-sm text-zinc-900 shadow-sm focus:border-amino-500 focus:outline-none focus:ring-1 focus:ring-amino-500"
                />
              </div>
              <div className="mt-2 flex items-center justify-between text-xs text-zinc-500">
                <span>{users.length} users</span>
                {searchTerm && (
                  <button type="button" onClick={handleResetSearch} className="text-amino-600 hover:text-amino-700">
                    Clear
                  </button>
                )}
              </div>
            </form>
            <div className="space-y-2">
              {isLoadingUsers && (
                <div className="flex items-center justify-center py-8 text-sm text-zinc-500">
                  <ArrowPathIcon className="mr-2 h-4 w-4 animate-spin" /> Loading users
                </div>
              )}
              {userError && !isLoadingUsers && <div className="rounded-md bg-rose-50 p-3 text-sm text-rose-600">{userError}</div>}
              {!isLoadingUsers && !userError && users.length === 0 && (
                <div className="rounded-md bg-zinc-50 p-3 text-sm text-zinc-500">No users found.</div>
              )}
              {users.map((user, index) => {
                const isSelected = user.id === selectedUserId
                return (
                  <button
                    key={user.id}
                    type="button"
                    onClick={() => setUserAndUrl(user.id)}
                    className={classNames(
                      "w-full rounded-xl border p-3 text-left transition-all duration-300 ease-out hover:-translate-y-0.5 hover:border-amino-400 hover:shadow-lg",
                      isSelected
                        ? "border-amino-500 bg-amino-50 text-amino-900 shadow"
                        : "border-zinc-200 bg-white text-zinc-700"
                    )}
                  >
                    <div className="flex items-start justify-between">
                      <div>
                        <div className="text-sm font-semibold text-inherit">{user.fullName || "Unnamed user"}</div>
                        <div className="text-xs text-zinc-500">{user.email || "No email"}</div>
                      </div>
                      <div className="text-xs font-medium text-zinc-400">#{index + 1}</div>
                    </div>
                    <div className="mt-2 text-xs text-zinc-500">
                      {user.totalFoodsLogged.toLocaleString()} logged foods total
                    </div>
                  </button>
                )
              })}
            </div>
          </div>
        </aside>

        <section className="flex-1">
          <div className="rounded-lg border border-zinc-200 bg-white p-6 shadow-sm">
            {!selectedUserId && <PlaceholderState message="Select a user to start mirroring their food log." />}
            {selectedUserId && (
              <div className="space-y-6">
                <header className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <h2 className="text-xl font-semibold text-zinc-900">
                      {selectedUser?.fullName || dailyFood?.user?.fullName || "Selected user"}
                    </h2>
                    <div className="text-sm text-zinc-500">
                      {selectedUser?.email || dailyFood?.user?.email || "Email unavailable"}
                    </div>
                  </div>
                  <div className="text-right text-xs text-zinc-400">
                    Viewing {moment(selectedDate).format("MMM D, YYYY")} ({timezone})
                  </div>
                </header>

                <DateNavigator
                  selectedDate={selectedDate}
                  timezone={timezone}
                  onPrev={handlePrevDay}
                  onNext={handleNextDay}
                  onToday={handleToday}
                />

                {foodError && <div className="rounded-md bg-rose-50 p-3 text-sm text-rose-600">{foodError}</div>}

                {isLoadingFoods ? (
                  <div className="flex items-center justify-center py-20 text-sm text-zinc-500">
                    <ArrowPathIcon className="mr-2 h-5 w-5 animate-spin" /> Loading food log…
                  </div>
                ) : (
                  <div className="space-y-6">
                    <DailyTotals totals={dailyFood?.totals} />

                    <MealSection
                      title="Breakfast"
                      groups={groupedMeals.breakfast}
                      timezone={timezone}
                      onDelete={handleDeleteFoodItem}
                      deletingId={deletingFoodId}
                    />
                    <MealSection
                      title="Lunch"
                      groups={groupedMeals.lunch}
                      timezone={timezone}
                      onDelete={handleDeleteFoodItem}
                      deletingId={deletingFoodId}
                    />
                    <MealSection
                      title="Dinner"
                      groups={groupedMeals.dinner}
                      timezone={timezone}
                      onDelete={handleDeleteFoodItem}
                      deletingId={deletingFoodId}
                    />
                    {groupedMeals.other.length > 0 && (
                      <MealSection
                        title="Other"
                        groups={groupedMeals.other}
                        timezone={timezone}
                        onDelete={handleDeleteFoodItem}
                        deletingId={deletingFoodId}
                      />
                    )}

                    {dailyFood && dailyFood.foods.length === 0 && (
                      <div className="space-y-4 rounded-md border border-dashed border-zinc-200 p-8 text-center text-sm text-zinc-500">
                        <p>No food logged for this day.</p>
                        {selectedUserId && (
                          <button
                            type="button"
                            onClick={handleGoToLastDay}
                            disabled={isJumpingToLast}
                            className="inline-flex items-center justify-center rounded-md border border-amino-500 px-3 py-2 text-xs font-semibold text-amino-700 hover:bg-amino-500/10 disabled:opacity-60"
                          >
                            {isJumpingToLast ? "Searching…" : "Go to last day with logged food"}
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  )
}

function PlaceholderState({ message }: { message: string }) {
  return (
    <div className="flex min-h-[240px] flex-col items-center justify-center text-center text-sm text-zinc-500">
      <p>{message}</p>
    </div>
  )
}

function DateNavigator({
  selectedDate,
  timezone,
  onPrev,
  onNext,
  onToday
}: {
  selectedDate: string
  timezone: string
  onPrev: () => void
  onNext: () => void
  onToday: () => void
}) {
  const date = moment.tz(selectedDate, DATE_FORMAT, timezone)
  const now = moment().tz(timezone)
  const isToday = date.isSame(now, "day")

  return (
    <div className="flex flex-wrap items-center justify-between gap-4 rounded-md border border-zinc-200 bg-zinc-50 px-4 py-3">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onPrev}
          className="rounded-md border border-transparent p-2 text-zinc-500 hover:border-zinc-200 hover:bg-white"
          aria-label="Previous day"
        >
          <ChevronLeftIcon className="h-5 w-5" />
        </button>
        <button
          type="button"
          onClick={onNext}
          className="rounded-md border border-transparent p-2 text-zinc-500 hover:border-zinc-200 hover:bg-white"
          aria-label="Next day"
        >
          <ChevronRightIcon className="h-5 w-5" />
        </button>
      </div>
      <div className="text-center">
        <div className="text-lg font-semibold text-zinc-900">{date.format("dddd, MMMM D")}</div>
        <div className="text-xs text-zinc-500">
          {isToday ? "Today" : date.from(now)} • {timezone}
        </div>
      </div>
      <button
        type="button"
        onClick={onToday}
        disabled={isToday}
        className={classNames(
          "rounded-md border px-3 py-1 text-xs font-medium transition",
          isToday
            ? "cursor-default border-zinc-200 bg-white text-zinc-400"
            : "border-amino-500 bg-amino-500/10 text-amino-700 hover:bg-amino-500/20"
        )}
      >
        Go to today
      </button>
    </div>
  )
}

function DailyTotals({
  totals
}: {
  totals: AdminDailyFoodResponse["totals"] | undefined
}) {
  const calories = totals ? Math.round(totals.calories) : 0
  const carbs = totals ? Math.round(totals.carbs) : 0
  const fat = totals ? Math.round(totals.fat) : 0
  const protein = totals ? Math.round(totals.protein) : 0

  return (
    <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
      <StatCard label="Calories" value={`${calories.toLocaleString()} kcal`} />
      <StatCard label="Carbs" value={`${carbs.toLocaleString()} g`} />
      <StatCard label="Fat" value={`${fat.toLocaleString()} g`} />
      <StatCard label="Protein" value={`${protein.toLocaleString()} g`} />
    </div>
  )
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-4 text-center shadow-sm">
      <div className="text-xs uppercase tracking-wide text-zinc-500">{label}</div>
      <div className="mt-2 text-xl font-semibold text-zinc-900">{value}</div>
    </div>
  )
}

function MealSection({
  title,
  groups,
  timezone,
  onDelete,
  deletingId
}: {
  title: string
  groups: MealGroup[]
  timezone: string
  onDelete: (food: AdminLoggedFoodItem) => void
  deletingId: number | null
}) {
  if (!groups.length) {
    return null
  }

  return (
    <section>
      <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-500">{title}</h3>
      <div className="space-y-4">
        {groups.map((group, index) => (
          <MessageGroupCard
            key={group.id}
            group={group}
            timezone={timezone}
            onDelete={onDelete}
            deletingId={deletingId}
            index={index}
          />
        ))}
      </div>
    </section>
  )
}

function MessageGroupCard({
  group,
  timezone,
  onDelete,
  deletingId,
  index
}: {
  group: MealGroup
  timezone: string
  onDelete: (food: AdminLoggedFoodItem) => void
  deletingId: number | null
  index: number
}) {
  const startMoment = moment(group.startTime).tz(timezone)
  const timestampLabel = startMoment.isValid()
    ? startMoment.format("MMM D • h:mm A")
    : "Scheduled"

  const isMessageGroup = Boolean(group.message)
  const itemCountLabel = `${group.items.length} item${group.items.length === 1 ? "" : "s"}`

  const headerTitle = isMessageGroup ? group.title : "Manual entry"
  const headerSubtitle = isMessageGroup ? itemCountLabel : "Logged manually"

  return (
    <div
      className="card-fade-in group relative overflow-hidden rounded-2xl border border-zinc-200/70 bg-white/80 p-5 shadow-sm backdrop-blur-sm transition-all duration-300 ease-out hover:-translate-y-1 hover:bg-white hover:shadow-2xl"
      style={{ animationDelay: `${index * 60}ms` }}
    >
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-amino-100/35 via-transparent to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
      <div className="relative z-10 space-y-4">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2 text-xs font-semibold text-amino-700">
              <span className="rounded-full bg-amino-100/80 px-3 py-1 text-[11px] uppercase tracking-wide">
                {timestampLabel}
              </span>
              <span className="rounded-full bg-zinc-100 px-3 py-1 text-[11px] font-medium text-zinc-600">
                {headerSubtitle}
              </span>
            </div>
            <h4 className="text-lg font-semibold text-zinc-900">{headerTitle}</h4>
            {isMessageGroup && group.message?.content && (
              <p className="max-w-xl text-sm text-zinc-500">{group.message.content}</p>
            )}
          </div>
          {group.messageImageUrls?.length ? (
            <div className="flex max-w-full gap-3 overflow-x-auto rounded-xl bg-zinc-100/60 p-2 shadow-inner">
              {group.messageImageUrls.map((url, imageIndex) => (
                <a
                  key={`${group.id}-image-${imageIndex}`}
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="relative h-20 w-20 flex-none overflow-hidden rounded-lg border border-white/60 shadow-sm transition-transform duration-300 hover:rotate-1 hover:scale-105"
                >
                  <img src={url} alt={`Message image ${imageIndex + 1}`} className="h-full w-full object-cover" />
                </a>
              ))}
            </div>
          ) : null}
        </div>

        <div className="space-y-3">
          {group.items.map((food) => (
            <FoodRow
              key={food.id}
              food={food}
              timezone={timezone}
              onDelete={onDelete}
              isDeleting={deletingId === food.id}
              showSourceLabel={!isMessageGroup}
            />
          ))}
        </div>
      </div>
    </div>
  )
}

function FoodRow({
  food,
  timezone,
  onDelete,
  isDeleting,
  showSourceLabel = true
}: {
  food: AdminLoggedFoodItem
  timezone: string
  onDelete: (food: AdminLoggedFoodItem) => void
  isDeleting: boolean
  showSourceLabel?: boolean
}) {
  const time = moment(food.consumedOn).tz(timezone)
  const timeLabel = time.isValid() ? time.format("h:mm A") : "--"

  const normalizedCalories = Math.round(getNormalizedFoodValue(food as any, "kcalPerServing"))
  const normalizedCarbs = Math.round(getNormalizedFoodValue(food as any, "carbPerServing"))
  const normalizedFat = Math.round(getNormalizedFoodValue(food as any, "totalFatPerServing"))
  const normalizedProtein = Math.round(getNormalizedFoodValue(food as any, "proteinPerServing"))

  const foodName =
    food.FoodItem?.name ||
    ((food.extendedOpenAiData as any)?.food_database_search_name as string | undefined) ||
    "Food item"

  const servingText = food.servingAmount && food.loggedUnit
    ? `${food.servingAmount} ${food.loggedUnit}`
    : (food.extendedOpenAiData as any)?.serving?.serving_amount
    ? `${(food.extendedOpenAiData as any)?.serving?.serving_amount} ${(food.extendedOpenAiData as any)?.serving?.serving_name || "serving"}`
    : "Custom amount"

  const fallbackImage = food.FoodItem?.FoodItemImages?.find((img) => img.FoodImage)?.FoodImage?.pathToImage
  const imageUrl = food.pathToImage || fallbackImage || DEFAULT_IMAGE_URL
  const sourceLabel = food.Message?.content
    ? truncateText(food.Message.content, 90)
    : food.Message?.hasimages
    ? "Photo food log"
    : "Manually logged"
  const statusLabel = food.status === "Needs Processing" ? "Processing" : null

  return (
    <article className="flex items-start gap-4 rounded-xl border border-zinc-100 bg-white/90 p-4 shadow-inner transition-all duration-300 ease-out hover:border-amino-200/70">
      <div className="relative h-16 w-16 flex-none overflow-hidden rounded-md bg-zinc-100">
        <img src={imageUrl} alt="Food item" className="h-full w-full object-cover" />
      </div>
      <div className="flex flex-1 flex-col">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <div className="text-sm font-semibold text-zinc-900">{foodName}</div>
              <span className="text-xs text-zinc-400">ID: {food.id}</span>
            </div>
            <div className="text-xs text-zinc-500">{servingText}</div>
          </div>
          <div className="flex items-center gap-2 text-xs text-zinc-400">
            <span>{timeLabel}</span>
            <button
              type="button"
              onClick={() => onDelete(food)}
              disabled={isDeleting}
              className="inline-flex items-center gap-1 rounded border border-rose-200 px-2 py-1 text-[11px] font-semibold text-rose-600 transition-all duration-200 hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <TrashIcon className="h-3.5 w-3.5" />
              {isDeleting ? "Deleting…" : "Delete"}
            </button>
          </div>
        </div>
        <div className="mt-3 grid grid-cols-4 gap-2 text-center text-xs text-zinc-600">
          <MacroPill label="Cals" value={normalizedCalories} suffix="kcal" />
          <MacroPill label="Carbs" value={normalizedCarbs} suffix="g" />
          <MacroPill label="Fat" value={normalizedFat} suffix="g" />
          <MacroPill label="Protein" value={normalizedProtein} suffix="g" />
        </div>
        {(showSourceLabel || statusLabel) && (
          <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-zinc-500">
            {showSourceLabel && <span className="truncate">{sourceLabel}</span>}
            {statusLabel && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-amber-700">{statusLabel}</span>}
          </div>
        )}
      </div>
    </article>
  )
}

function MacroPill({
  label,
  value,
  suffix
}: {
  label: string
  value: number
  suffix: string
}) {
  return (
    <div className="rounded-md bg-zinc-100 py-2">
      <div className="text-[11px] uppercase tracking-wide text-zinc-500">{label}</div>
      <div className="text-sm font-semibold text-zinc-900">
        {Number.isFinite(value) ? value.toLocaleString() : "--"} {suffix}
      </div>
    </div>
  )
}

function truncateText(text: string, maxLength: number) {
  if (text.length <= maxLength) return text
  return text.slice(0, maxLength - 1) + "…"
}
