import { createAdminSupabase } from "@/utils/supabase/serverAdmin"
import { Expo } from "expo-server-sdk"
import { NotificationOptions } from "./notifications"

export const dynamic = "force-dynamic"

const expo = new Expo()

export async function GET(request: Request) {
  console.log("Running push notifications cron job")
  const supabase = createAdminSupabase()
  const { data, error } = await supabase
    .from("ExpoPushTokens")
    .select(
      `
      *,
      User (tzIdentifier),
      LoggedFoodItem (
        createdAt
      )
    `
    )
    .order("createdAt", { ascending: false, foreignTable: "LoggedFoodItem" })
    .limit(1, { foreignTable: "LoggedFoodItem" })

  if (error) {
    console.error(error)
    return new Response(JSON.stringify({ status: 500, body: "Error fetching users: " + error.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    })
  }

  console.log("Push tokens:", data)

  const toSend: Array<{ to: string; title: string; body: string }> = []

  for (const pushToken of data) {
    if (!pushToken) {
      continue
    }

    const userTimeZone = pushToken.User?.tzIdentifier
    const currentTime = new Date()
    const userTime = new Date(currentTime.toLocaleString("en-US", { timeZone: userTimeZone }))
    const userHour = userTime.getHours()
    const isLunchOrDinnerTime = userHour === 13 || userHour === 20

    // Get the time since the last logged food item
    if (pushToken.LoggedFoodItem.length >= 1) {
      const lastLoggedTime = new Date(pushToken.LoggedFoodItem[0].createdAt || 0)
      const timeSinceLastLogged = (currentTime.getTime() - lastLoggedTime.getTime()) / (1000 * 60 * 60) // in hours

      if (isLunchOrDinnerTime && timeSinceLastLogged >= 2) {
        appendPushNotification(toSend, [pushToken])
      }
    }
  }

  try {
    await expo.sendPushNotificationsAsync(toSend)
  } catch (error) {
    console.error(`Error sending push notification: ${error}`)
  }

  return new Response(JSON.stringify({ status: 200, body: "Push notifications sent successfully" }), {
    status: 200,
    headers: { "Content-Type": "application/json" }
  })
}

async function appendPushNotification(
  array: Array<{ to: string; title: string; body: string }>,
  expoPushTokens: {
    created_at: string
    id: number
    key: string
    userId: string
  }[]
) {
  for (const pushToken of expoPushTokens) {
    if (!Expo.isExpoPushToken(pushToken.key)) {
      console.error(`Invalid Expo push token: ${pushToken.key}`)
      continue
    }
    const randomNotification = NotificationOptions[Math.floor(Math.random() * NotificationOptions.length)]

    array.push({
      to: pushToken.key,
      title: randomNotification.title,
      body: randomNotification.body
    })
  }
}
