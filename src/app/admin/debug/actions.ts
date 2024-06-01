// src/app/admin/debug/actions.ts
"use server"

import { createAdminSupabase } from "@/utils/supabase/serverAdmin"
import { Tables } from "types/supabase"
import { createClient } from "@/utils/supabase/server"

export interface FoodItemImagesType extends Tables<"FoodItemImages"> {
  FoodImage: Tables<"FoodImage"> | null
}

// Include the modified FoodItemImagesType in the FoodItemType definition
export interface FoodItemType extends Tables<"FoodItem"> {
  FoodItemImages: FoodItemImagesType[]
}

// Define types for the tables
export type MessageType = Partial<Tables<"Message">>

// Define a custom type for the nested logged food item with food item details
export interface LoggedFoodItemWithDetailsType extends Partial<Tables<"LoggedFoodItem">> {
  FoodItem: FoodItemType | null
  pathToImage?: string | null
}

// Define a custom type for Message with signed image URLs
export interface MessageWithSignedUrls extends MessageType {
  imageUrls: string[]
}

const allowedUserIds = [
  "a1ca16b9-333f-40bd-8f43-88977cc9a371",
  "2cf908ed-90a2-4ecd-a5f3-14b3a28fb05b",
  "6b005b82-88a5-457b-a1aa-60ecb1e90e21",
  "0e99c4d8-0c40-4399-8565-8379ebfffc49",
  "3fea3294-9dcf-4acf-954b-6648028825ea"
]

export async function fetchMessages(
  page: number,
  itemsPerPage: number,
  showDeleted: string,
  userId: string,
  hasImage: string,
  messageStatus: string
) {
  const supabase = await createAdminSupabase()
  const anonSupabase = createClient()

  const { data: userData, error: userError } = await anonSupabase.auth.getUser()

  if (userError) {
    return { error: "Unauthorized" + JSON.stringify(userError), status: 401 }
  }

  if (!userData) {
    return { error: "Unauthorized" + JSON.stringify(userData), status: 401 }
  }

  const currentUserId = userData.user.id

  const from = (page - 1) * itemsPerPage
  const to = from + itemsPerPage - 1

  let query = supabase
    .from("Message")
    .select(
      `
    id,
    createdAt,
    consumedOn,
    content,
    hasimages,
    isAudio,
    deletedAt,
    status,
    userId
  `,
      { count: "exact" }
    )
    .order("createdAt", { ascending: false }) // Sort by createdAt in descending order
    .range(from, to)

  if (showDeleted !== "all") {
    query = showDeleted === "deleted" ? query.not("deletedAt", "is", null) : query.is("deletedAt", null)
  }

  if (!allowedUserIds.includes(currentUserId)) {
    query = query.eq("userId", currentUserId)
  } else if (userId) {
    query = query.eq("userId", userId)
  }

  if (hasImage !== "all") {
    query = query.eq("hasimages", hasImage === "has-image")
  }

  if (messageStatus !== "all") {
    messageStatus = messageStatus.toUpperCase()
    query = query.eq("status", messageStatus)
  }

  const { data: messages, error: messagesError, count: totalMessages } = await query

  if (messagesError) {
    return { error: messagesError.message, status: 500 }
  }

  const messagesWithSignedUrls: MessageWithSignedUrls[] = []

  for (const message of messages) {
    if (message.hasimages && message.id !== undefined) {
      const { data: images, error: imagesError } = await supabase
        .from("UserMessageImages")
        .select("imagePath")
        .eq("messageId", message.id)

      if (imagesError) {
        return { error: imagesError.message, status: 500 }
      }

      const imagePaths = images.map((img) => img.imagePath)
      if (imagePaths.length > 0) {
        const { data: signedUrls, error: signedUrlsError } = await supabase.storage
          .from("userUploadedImages")
          .createSignedUrls(imagePaths, 3600) // URL valid for 1 hour

        if (signedUrlsError) {
          return { error: signedUrlsError.message, status: 500 }
        }

        messagesWithSignedUrls.push({ ...message, imageUrls: signedUrls.map((url) => url.signedUrl) })
      } else {
        messagesWithSignedUrls.push({ ...message, imageUrls: [] })
      }
    } else {
      messagesWithSignedUrls.push({ ...message, imageUrls: [] })
    }
  }

  const messageIds = messages.map((message) => message.id).filter((id) => id !== undefined)

  const { data: loggedFoodItems, error: loggedFoodItemsError } = (await supabase
    .from("LoggedFoodItem")
    .select(
      `
    id,
    consumedOn,
    deletedAt,
    grams,
    servingAmount,
    extendedOpenAiData,
    loggedUnit,
    messageId,
    FoodItem (
      id,
      name,
      brand,
      kcalPerServing,
      defaultServingWeightGram,
      totalFatPerServing,
      carbPerServing,
      proteinPerServing,
      FoodItemImages(
          *, FoodImage(id, pathToImage, downvotes)
        )
    )
  `
    )
    .in("messageId", messageIds)) as { data: LoggedFoodItemWithDetailsType[]; error: any }

  if (loggedFoodItemsError) {
    return { error: loggedFoodItemsError.message, status: 500 }
  }

  // Enhance the food items with the pathToImage
  // Sorting and selecting the best image URL
  loggedFoodItems.forEach((item) => {
    if (item.FoodItem && item.FoodItem.FoodItemImages.length > 0) {
      // Filter out any images where FoodImage is null before sorting
      const validImages = item.FoodItem.FoodItemImages.filter((img) => img.FoodImage !== null)

      if (validImages.length > 0) {
        validImages.sort((a, b) => {
          const downvotesA = a.FoodImage!.downvotes // Using non-null assertion since we filtered out nulls
          const downvotesB = b.FoodImage!.downvotes
          if (downvotesA === downvotesB) {
            return b.FoodImage!.id - a.FoodImage!.id // Higher id is preferred if downvotes are equal
          }
          return downvotesA - downvotesB
        })
        item.pathToImage = validImages[0].FoodImage!.pathToImage // Using non-null assertion
      } else {
        item.pathToImage = null
      }
    } else {
      item.pathToImage = null
    }
  })

  // Transform loggedFoodItems into a Record structure indexed by messageId
  const loggedFoodItemsByMessage: Record<string, LoggedFoodItemWithDetailsType[]> = {}
  loggedFoodItems.forEach((item) => {
    const { messageId } = item
    if (messageId) {
      if (!loggedFoodItemsByMessage[messageId]) {
        loggedFoodItemsByMessage[messageId] = []
      }
      loggedFoodItemsByMessage[messageId].push(item)
    }
  })

  return {
    messages: messagesWithSignedUrls,
    loggedFoodItemsByMessage, // This is now a Record as expected by your component state
    totalMessages
  }
}
