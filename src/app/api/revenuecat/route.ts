// src/app/api/revenuecat/route.ts
import { NextRequest, NextResponse } from "next/server"
import { createAdminSupabase } from "@/utils/supabase/serverAdmin"
import { RevenueCatWebhookEvent } from "./webhookInterface"
import { getAndUpdateRevenueCatForUser, getSubscriptionFromRevenueCat } from "@/subscription/getUserInfoFromRevenueCat"
import { headers } from "next/headers"

const REVENUECAT_WEBHOOK_AUTH_HEADER = process.env.REVENUECAT_WEBHOOK_AUTH_HEADER
const DEBUG = true // Set to false to disable sandbox events and less verbose output

export async function POST(request: NextRequest) {
  // Get the headers using the `headers` function from `next/headers`
  const headersList = headers()

  const authHeader = headersList.get("Authorization")

  if (!authHeader) {
    console.warn("Warning: Authorization header is missing in the webhook request.")
    // Continue processing the webhook request
  } else if (authHeader !== `Bearer ${REVENUECAT_WEBHOOK_AUTH_HEADER}`) {
    console.log("Received Authorization Header:", authHeader)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const webhook: RevenueCatWebhookEvent = await request.json()

  if (!webhook.event || !webhook.event.app_user_id) {
    return NextResponse.json({ error: "Invalid webhook payload" }, { status: 400 })
  }

  const appUserId = webhook.event.app_user_id

  if (DEBUG) {
    console.log("Received webhook event:", webhook)
  }
  if (!DEBUG && webhook.event.environment === "SANDBOX") {
    console.log("Skipping sandbox event in production")
    return NextResponse.json({ success: true })
  }

  try {
    await getAndUpdateRevenueCatForUser(appUserId)
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Error processing webhook:", error)
    return NextResponse.json({ error: "Failed to process webhook" }, { status: 500 })
  }
}
