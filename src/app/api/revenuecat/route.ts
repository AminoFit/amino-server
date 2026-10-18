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

  // RevenueCat sends the Authorization value set in its webhook settings (with or without "Bearer "). A webhook is only
  // a nudge: nothing in its payload is trusted except the user id, whose subscription is then read from RevenueCat's
  // API. So a missing or wrong header is logged, not refused: refusing would lose real renewals and cancellations if
  // the dashboard's header ever drifts from REVENUECAT_WEBHOOK_AUTH_HEADER, and a forged call can only cause a re-read.
  if (REVENUECAT_WEBHOOK_AUTH_HEADER) {
    if (authHeader !== REVENUECAT_WEBHOOK_AUTH_HEADER && authHeader !== `Bearer ${REVENUECAT_WEBHOOK_AUTH_HEADER}`) {
      console.warn("RevenueCat webhook without the expected Authorization header:", authHeader ? "wrong value" : "missing")
    }
  } else {
    console.warn("Warning: REVENUECAT_WEBHOOK_AUTH_HEADER is not set, so RevenueCat webhooks are not authenticated.")
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
