// src/app/admin/viewas/actions.ts
"use server"

import moment from "moment-timezone"

import { createAdminSupabase } from "@/utils/supabase/serverAdmin"
import { createClient } from "@/utils/supabase/server"
import { ADMIN_ALLOWED_USER_IDS } from "@/utils/admin/allowedUserIds"
import { Tables } from "types/supabase"

export interface AdminViewUserListItem {
  id: string
  fullName: string | null
  email: string | null
  tzIdentifier: string
  totalFoodsLogged: number
}

export type AdminLoggedFoodItem = Tables<"LoggedFoodItem"> & {
  FoodItem:
    | (Tables<"FoodItem"> & {
        Serving: Tables<"Serving">[]
        FoodItemImages?: {
          FoodImage: Tables<"FoodImage"> | null
        }[]
      })
    | null
  Message: Tables<"Message"> | null
}

export interface AdminDailyFoodResponse {
  user: Tables<"User"> | null
  foods: AdminLoggedFoodItem[]
  totals: {
    calories: number
    carbs: number
    fat: number
    protein: number
  }
}

function ensureAdminAccess(userId?: string) {
  if (!userId || !ADMIN_ALLOWED_USER_IDS.includes(userId)) {
    const error = new Error("Unauthorized")
    ;(error as Error & { status?: number }).status = 401
    throw error
  }
}

export async function fetchTopUsers(limit = 50, searchTerm = ""): Promise<AdminViewUserListItem[]> {
  const supabaseAdmin = createAdminSupabase()
  const supabase = createClient()
  const { data: authData, error: authError } = await supabase.auth.getUser()

  if (authError || !authData?.user) {
    throw new Error("Unauthorized")
  }

  ensureAdminAccess(authData.user.id)

  let query = supabaseAdmin
    .from("User")
    .select("id, fullName, email, tzIdentifier, LoggedFoodItem(count)")
    .order("count", { foreignTable: "LoggedFoodItem", ascending: false })
    .limit(limit)

  const trimmedSearch = searchTerm.trim()
  if (trimmedSearch) {
    const ilikeTerm = `%${trimmedSearch}%`
    query = query.or(`fullName.ilike.${ilikeTerm},email.ilike.${ilikeTerm}`)
  }

  const { data, error } = await query

  if (error) {
    throw new Error(error.message)
  }

  return (data || [])
    .map((user) => {
      const withAggregate = user as typeof user & { LoggedFoodItem?: { count?: number }[] }
      const totalFoodsLogged = Array.isArray(withAggregate.LoggedFoodItem) && withAggregate.LoggedFoodItem[0]?.count
        ? Number(withAggregate.LoggedFoodItem[0]?.count) || 0
        : 0

      return {
        id: user.id,
        fullName: user.fullName,
        email: user.email,
        tzIdentifier: user.tzIdentifier,
        totalFoodsLogged
      }
    })
    .sort((a, b) => b.totalFoodsLogged - a.totalFoodsLogged)
}

export async function fetchUserDailyFood(userId: string, date: string): Promise<AdminDailyFoodResponse> {
  if (!userId) {
    throw new Error("Missing userId")
  }

  const supabaseAdmin = createAdminSupabase()
  const supabase = createClient()
  const { data: authData, error: authError } = await supabase.auth.getUser()

  if (authError || !authData?.user) {
    throw new Error("Unauthorized")
  }

  ensureAdminAccess(authData.user.id)

  const { data: user, error: userError } = await supabaseAdmin
    .from("User")
    .select("*")
    .eq("id", userId)
    .maybeSingle()

  if (userError) {
    throw new Error(userError.message)
  }

  if (!user) {
    return { user: null, foods: [], totals: { calories: 0, carbs: 0, fat: 0, protein: 0 } }
  }

  const tz = user.tzIdentifier || "UTC"
  const parsed = moment.tz(date, "YYYY-MM-DD", tz)

  if (!parsed.isValid()) {
    throw new Error("Invalid date")
  }

  const startOfDay = parsed.clone().startOf("day").toISOString()
  const endOfDay = parsed.clone().endOf("day").toISOString()

  const { data: foods, error: foodsError } = await supabaseAdmin
    .from("LoggedFoodItem")
    .select(
      `*,
      FoodItem(
        *,
        Serving(*),
        FoodItemImages(
          FoodImage(*)
        )
      ),
      Message(
        id,
        content,
        createdAt,
        consumedOn,
        status,
        messageType,
        hasimages
      )
    `
    )
    .eq("userId", userId)
    .gte("consumedOn", startOfDay)
    .lte("consumedOn", endOfDay)
    .order("consumedOn", { ascending: true })

  if (foodsError) {
    throw new Error(foodsError.message)
  }

  const totals = (foods || []).reduce(
    (acc, item) => {
      const grams = item.grams || 0
      const defaultServing = item.FoodItem?.defaultServingWeightGram || 0

      if (item.FoodItem && defaultServing > 0 && grams > 0) {
        const ratio = grams / defaultServing
        acc.calories += (item.FoodItem.kcalPerServing || 0) * ratio
        acc.carbs += (item.FoodItem.carbPerServing || 0) * ratio
        acc.fat += (item.FoodItem.totalFatPerServing || 0) * ratio
        acc.protein += (item.FoodItem.proteinPerServing || 0) * ratio
      }

      return acc
    },
    { calories: 0, carbs: 0, fat: 0, protein: 0 }
  )

  return {
    user,
    foods: (foods as AdminLoggedFoodItem[]) || [],
    totals: {
      calories: totals.calories,
      carbs: totals.carbs,
      fat: totals.fat,
      protein: totals.protein
    }
  }
}
