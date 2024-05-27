// src/app/admin/debug/actions.ts
"use server";

import { createAdminSupabase } from "@/utils/supabase/serverAdmin";
import { Tables } from "types/supabase";
import { createClient } from "@/utils/supabase/server";

// Define types for the tables
export type MessageType = Partial<Tables<"Message">>;
export type FoodItemType = Tables<"FoodItem">;

// Define a custom type for the nested logged food item with food item details
export interface LoggedFoodItemWithDetailsType extends Tables<"LoggedFoodItem"> {
  FoodItem: FoodItemType | null;
}

// Define a custom type for Message with signed image URLs
export interface MessageWithSignedUrls extends MessageType {
  imageUrls: string[];
}

const allowedUserIds = [
  "2cf908ed-90a2-4ecd-a5f3-14b3a28fb05b",
  "6b005b82-88a5-457b-a1aa-60ecb1e90e21",
];

export async function fetchMessages(
  page: number, 
  itemsPerPage: number, 
  showDeleted: string, 
  userId: string, 
  hasImage: string, 
  messageStatus: string
) {
  const supabase = await createAdminSupabase();
  const anonSupabase = createClient();

  const { data: userData, error: userError } = await anonSupabase.auth.getUser();

  if (userError) {
    return { error: "Unauthorized" + JSON.stringify(userError), status: 401 };
  }

  if (!userData) {
    return { error: "Unauthorized" + JSON.stringify(userData), status: 401 };
  }

  const currentUserId = userData.user.id;
  if (!allowedUserIds.includes(currentUserId)) {
    return { error: "Forbidden", status: 403 };
  }

  const from = (page - 1) * itemsPerPage;
  const to = from + itemsPerPage - 1;

  let query = supabase.from("Message").select(`
    id,
    createdAt,
    consumedOn,
    content,
    hasimages,
    isAudio,
    deletedAt,
    status,
    userId
  `, { count: 'exact' }).range(from, to);

  if (showDeleted !== 'all') {
    query = showDeleted === 'deleted' ? query.not('deletedAt', 'is', null) : query.is('deletedAt', null);
  }

  if (userId) {
    query = query.eq('userId', userId);
  }

  if (hasImage !== 'all') {
    query = query.eq('hasimages', hasImage === 'has-image');
  }

  if (messageStatus !== 'all') {
    messageStatus = messageStatus.toUpperCase();
    query = query.eq('status', messageStatus);
  }

  const { data: messages, error: messagesError, count: totalMessages } = await query;

  if (messagesError) {
    return { error: messagesError.message, status: 500 };
  }

  const messagesWithSignedUrls: MessageWithSignedUrls[] = [];

  for (const message of messages) {
    if (message.hasimages && message.id !== undefined) {
      const { data: images, error: imagesError } = await supabase
        .from("UserMessageImages")
        .select("imagePath")
        .eq("messageId", message.id);

      if (imagesError) {
        return { error: imagesError.message, status: 500 };
      }

      const imagePaths = images.map(img => img.imagePath);
      if (imagePaths.length > 0) {
        const { data: signedUrls, error: signedUrlsError } = await supabase.storage
          .from('userUploadedImages') 
          .createSignedUrls(imagePaths, 3600); // URL valid for 1 hour

        if (signedUrlsError) {
          return { error: signedUrlsError.message, status: 500 };
        }

        messagesWithSignedUrls.push({ ...message, imageUrls: signedUrls.map(url => url.signedUrl) });
      } else {
        messagesWithSignedUrls.push({ ...message, imageUrls: [] });
      }
    } else {
      messagesWithSignedUrls.push({ ...message, imageUrls: [] });
    }
  }

  const { data: loggedFoodItems, error: loggedFoodItemsError } = await supabase
    .from("LoggedFoodItem")
    .select(`
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
    `) as { data: LoggedFoodItemWithDetailsType[], error: any };

  if (loggedFoodItemsError) {
    return { error: loggedFoodItemsError.message, status: 500 };
  }

  const loggedFoodItemsByMessage = loggedFoodItems.reduce<Record<string, any[]>>((acc, item) => {
    const key = item.messageId ?? "null";
    if (!acc[key]) {
      acc[key] = [];
    }
    acc[key].push(item);
    return acc;
  }, {});

  return { messages: messagesWithSignedUrls, loggedFoodItemsByMessage, totalMessages };
}
