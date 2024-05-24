import { createAdminSupabase } from "@/utils/supabase/serverAdmin"
import { Expo } from "expo-server-sdk"
import { NotificationOptions } from "./notifications"

export const dynamic = "force-dynamic"

const expo = new Expo()

export async function GET(request: Request) {
  console.log("Running push notifications cron job")
  const supabase = createAdminSupabase()
  const { data, error } = await supabase.from("ExpoPushTokens").select("*, User(tzIdentifier)")
  // const { data, error } = await supabase
  //   .from("User")
  //   .select(
  //     `    id,
  //   tzIdentifier,
  //   ExpoPushTokens(*),
  //   LoggedFoodItem(
  //     id,
  //     consumedOn,
  //     createdAt
  //   )
  // `
  //   )
  //   .limit(1, { foreignTable: "LoggedFoodItem" })

  if (error) {
    console.error(error)
    return Response.json({ status: 500, body: "Error fetching users:" + error.message })
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

    // if (isLunchOrDinnerTime) {
    if (true) {
      appendPushNotification(toSend, [pushToken])
    }
  }

  try {
    await expo.sendPushNotificationsAsync(toSend)
  } catch (error) {
    console.error(`Error sending push notification: ${error}`)
  }

  return Response.json({ status: 200, body: "Push notifications sent successfully" })
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
