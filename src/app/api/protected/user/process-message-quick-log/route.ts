// src/app/api/protected/user/process-message-quick-log/route.ts
export const dynamic = "force-dynamic"
export const maxDuration = 120

import { GetAminoUserOnRequest } from "@/utils/supabase/GetUserFromRequest"
import { NextRequest, NextResponse } from "next/server"
import { GenerateResponseForQuickLog } from "@/foodMessageProcessing/RespondToMessage"
import { checkAndUpdateUserIsSubscribed } from "@/subscription/checkAndUpdateUserIsSubscribed"
import { GetMessageById } from "@/database/GetMessagesForUser"
import { refreshFoodMessageProgress } from "@/foodMessageProcessing/common/refreshFoodMessageProgress"

export async function POST(
  request: NextRequest // needed so we don't cache this request
) {
  try {
    console.log("QUICK LOG MESSAGE PROCESS POST request")

    let requestBody
    try { requestBody = await request.json() } catch {
      return NextResponse.json({ error: "Invalid JSON request" }, { status: 400 })
    }
    if (!requestBody || typeof requestBody !== "object") {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 })
    }
      const { messageId } = requestBody
    const consumedOn = requestBody.consumedOn || new Date().toISOString()
    const isMessageBeingEdited = requestBody.isMessageBeingEdited || false

    const { aminoUser, error: aminoUserError } = await GetAminoUserOnRequest()

    if (aminoUserError) {
      console.error("Error getting amino user on request: ", aminoUserError)
      return NextResponse.json({ error: "Authentication failed" }, { status: 401 })
    }

    if (!Number.isSafeInteger(messageId) || messageId <= 0) {
      return NextResponse.json({ error: "Invalid message ID provided" }, { status: 400 })
    }

    if (!aminoUser) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 })
    }

    if (typeof consumedOn !== "string" || !Number.isFinite(new Date(consumedOn).getTime()) ||
        typeof isMessageBeingEdited !== "boolean") {
      return NextResponse.json({ error: "Invalid meal time or edit flag" }, { status: 400 })
    }

    // Check if the user is subscribed
    let isSubscribed = false

    if (aminoUser.subscriptionExpiryDate) {
      const expiryDate = new Date(aminoUser.subscriptionExpiryDate)
      if (expiryDate > new Date()) {
        isSubscribed = true
      } else {
        isSubscribed = await checkAndUpdateUserIsSubscribed(aminoUser.id)
      }
    } else {
      isSubscribed = await checkAndUpdateUserIsSubscribed(aminoUser.id)
    }

    if (!isSubscribed) {
      return NextResponse.json({ error: "User subscription has expired" }, { status: 403 })
    }

    // log items
    let responseMessage
    try {
      responseMessage = await GenerateResponseForQuickLog(
      aminoUser,
      messageId as number,
      consumedOn,
      isMessageBeingEdited
    )
    } catch (error) {
      // Only recover this authenticated user's authoritative completed result.
      // Never retry extraction or enqueue work after a response/cleanup failure.
      // Without persisted edit revisions, a prior result cannot prove this edit saved.
      if (isMessageBeingEdited) throw error
      let saved = await GetMessageById(messageId)
      if (saved?.userId === aminoUser.id && !saved.deletedAt && saved.status === "PROCESSING" &&
          (saved.itemsToProcess ?? 0) > 0) saved = await refreshFoodMessageProgress(messageId)
      if (!saved || saved.userId !== aminoUser.id || saved.deletedAt || saved.status !== "RESOLVED" ||
          !saved.itemsToProcess || saved.itemsProcessed !== saved.itemsToProcess) throw error
      responseMessage = { resultMessage: "All food items were logged successfully.", status: saved.status,
        itemsProcessed: saved.itemsProcessed, itemsToProcess: saved.itemsToProcess }
    }

    console.log("Response message: ", responseMessage)

    return NextResponse.json(responseMessage)
  } catch (error) {
    console.error("Quick log request failed", error)
    return NextResponse.json({ error: "Could not complete food processing. Check the saved message before retrying." }, { status: 500 })
  }
}
