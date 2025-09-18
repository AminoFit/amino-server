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

export interface ManualFoodPlaceholder {
  id: number
  consumedOn: string | null
  createdAt: string | null
  grams: number
  servingAmount: number | null
  loggedUnit: string | null

  FoodItem: {
    name: string
    defaultServingWeightGram: number | null
    kcalPerServing: number | null
    carbPerServing: number | null
    totalFatPerServing: number | null
    proteinPerServing: number | null
    FoodItemImages: { FoodImage: { pathToImage: string | null; downvotes: number; id: number } | null }[]
  } | null

  Message: null
  pathToImage?: string | null
  messageImageUrls?: string[]
  extendedOpenAiData?: any
  status?: string | null
}

export type AdminLoggedFoodItem = (Tables<"LoggedFoodItem"> & {
  FoodItem:
    | (Tables<"FoodItem"> & {
        Serving: Tables<"Serving">[]
        FoodItemImages: (Tables<"FoodItemImages"> & { FoodImage: Tables<"FoodImage"> | null })[]
      })
    | null
  Message: Tables<"Message"> | null
  pathToImage?: string | null
  messageImageUrls?: string[]
  extendedOpenAiData?: any
  status?: string | null
}) | ManualFoodPlaceholder

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

  const trimmedSearch = searchTerm.trim()
  const ilikeTerm = trimmedSearch ? `%${trimmedSearch}%` : null

  let query = supabaseAdmin
    .from("User")
    .select(
      `
        id,
        fullName,
        email,
        tzIdentifier,
        logged_food:LoggedFoodItem!inner(count)
      `
    )
    .order("count", { foreignTable: "LoggedFoodItem", ascending: false })
    .limit(limit)

  if (ilikeTerm) {
    query = query.or(`fullName.ilike.${ilikeTerm},email.ilike.${ilikeTerm}`)
  }

  const { data, error } = await query

  if (error) {
    throw new Error(error.message)
  }

  return (data || []).map((user) => ({
    id: user.id,
    fullName: user.fullName,
    email: user.email,
    tzIdentifier: user.tzIdentifier,
    totalFoodsLogged: Number(user.logged_food?.[0]?.count ?? 0)
  }))
  .filter((user) => user.totalFoodsLogged > 0)
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

  const messageIdsWithImages = Array.from(
    new Set(
      (foods ?? [])
        .filter((item) => item.Message?.hasimages && item.Message?.id !== undefined && item.Message.id !== null)
        .map((item) => item.Message!.id as number)
    )
  )

  const messageImageUrlMap: Record<number, string[]> = {}

  if (messageIdsWithImages.length > 0) {
    const { data: messageImages, error: messageImagesError } = await supabaseAdmin
      .from("UserMessageImages")
      .select("messageId,imagePath")
      .in("messageId", messageIdsWithImages)

    if (messageImagesError) {
      throw new Error(messageImagesError.message)
    }

    const imagePathsByMessage = new Map<number, string[]>()
    for (const record of messageImages ?? []) {
      if (!record.imagePath || record.messageId === null) {
        continue
      }
      const list = imagePathsByMessage.get(record.messageId) ?? []
      list.push(record.imagePath)
      imagePathsByMessage.set(record.messageId, list)
    }

    for (const [messageId, imagePaths] of imagePathsByMessage.entries()) {
      if (!imagePaths.length) {
        continue
      }

      const { data: signedUrls, error: signedUrlsError } = await supabaseAdmin.storage
        .from("userUploadedImages")
        .createSignedUrls(imagePaths, 3600)

      if (signedUrlsError) {
        throw new Error(signedUrlsError.message)
      }

      messageImageUrlMap[messageId] = (signedUrls ?? []).map((entry) => entry.signedUrl)
    }
  }

  const enhancedFoods: AdminLoggedFoodItem[] = (foods as Tables<"LoggedFoodItem">[] | null)?.map((rawItem) => {
    const item = rawItem as Tables<"LoggedFoodItem"> & {
      FoodItem: Tables<"FoodItem"> & {
        Serving: Tables<"Serving">[]
        FoodItemImages: (Tables<"FoodItemImages"> & { FoodImage: Tables<"FoodImage"> | null })[]
      }
      Message: Tables<"Message">
    }

    if (item.FoodItem && Array.isArray(item.FoodItem.FoodItemImages) && item.FoodItem.FoodItemImages.length > 0) {
      const validImages = item.FoodItem.FoodItemImages.filter((img) => img.FoodImage)

      if (validImages.length > 0) {
        validImages.sort((a, b) => {
          const downvotesA = a.FoodImage?.downvotes ?? 0
          const downvotesB = b.FoodImage?.downvotes ?? 0
          if (downvotesA === downvotesB) {
            return (b.FoodImage?.id ?? 0) - (a.FoodImage?.id ?? 0)
          }
          return downvotesA - downvotesB
        })
        const messageId = item.Message?.id ?? undefined
        return {
          ...item,
          pathToImage: validImages[0].FoodImage?.pathToImage ?? null,
          messageImageUrls: messageId !== undefined ? messageImageUrlMap[messageId] : undefined
        }
      }
    }

    const messageId = item.Message?.id ?? undefined
    return {
      ...item,
      pathToImage: null,
      messageImageUrls: messageId !== undefined ? messageImageUrlMap[messageId] : undefined
    }
  }) ?? []

  const totals = enhancedFoods.reduce(
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
    foods: enhancedFoods,
    totals: {
      calories: totals.calories,
      carbs: totals.carbs,
      fat: totals.fat,
      protein: totals.protein
    }
  }
}

export async function deleteLoggedFoodItem(foodId: number) {
  const supabaseAdmin = createAdminSupabase()
  const supabase = createClient()
  const { data: authData, error: authError } = await supabase.auth.getUser()

  if (authError || !authData?.user) {
    throw new Error("Unauthorized")
  }

  ensureAdminAccess(authData.user.id)

  const { error } = await supabaseAdmin
    .from("LoggedFoodItem")
    .delete()
    .eq("id", foodId)

  if (error) {
    throw new Error(error.message)
  }

  return { success: true }
}

export async function getLastLoggedDate(userId: string, beforeDate?: string) {
  const supabaseAdmin = createAdminSupabase()
  const supabase = createClient()
  const { data: authData, error: authError } = await supabase.auth.getUser()

  if (authError || !authData?.user) {
    throw new Error("Unauthorized")
  }

  ensureAdminAccess(authData.user.id)

  let query = supabaseAdmin
    .from("LoggedFoodItem")
    .select("consumedOn")
    .eq("userId", userId)
    .not("consumedOn", "is", null)
    .order("consumedOn", { ascending: false })
    .limit(1)

  if (beforeDate) {
    const parsed = moment(beforeDate, "YYYY-MM-DD", true)
    if (parsed.isValid()) {
      query = query.lt("consumedOn", parsed.endOf("day").toISOString())
    }
  }

  const { data, error } = await query

  if (error) {
    throw new Error(error.message)
  }

  return data?.[0]?.consumedOn ?? null
}
