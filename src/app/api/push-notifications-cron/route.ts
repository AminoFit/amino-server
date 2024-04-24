import { createAdminSupabase } from "@/utils/supabase/serverAdmin"
import { Expo } from "expo-server-sdk"
import { NotificationOptions } from "./notifications"

export const dynamic = "force-dynamic"

const expo = new Expo()

export async function GET(request: Request) {
  console.log("Running push notifications cron job")
  const supabase = createAdminSupabase()
  // const { data, error } = await supabase
  //   .from("User")
  //   .select("id, tzIdentifier, pushNotificationPreference, ExpoPushTokens(*)")
  //   .in('pushNotificationPreference', ['Daily'])
  const { data, error } = await supabase
    .from("User")
    .select(
      `    id,
    tzIdentifier,
    pushNotificationPreference,
    ExpoPushTokens(*),
    LoggedFoodItem(
      id,
      consumedOn,
      createdAt
    )
  `
    )
    .in("pushNotificationPreference", ["Daily", "EveryOtherDay", "Weekly"])
    // .eq("User.LoggedFoodItem.deletedAt", null) // Assuming you want to ignore deleted items
    .order("createdAt", { foreignTable: "LoggedFoodItem", ascending: false })
    .limit(1, { foreignTable: "LoggedFoodItem" })

  if (error) {
    console.error(error)
    return Response.json({ status: 500, body: "Error fetching users:" + error.message })
  }

  console.log("Users:", data)

  const toSend: Array<{ to: string; title: string; body: string }> = []

  for (const user of data) {
    const userTimeZone = user.tzIdentifier

    const currentTime = new Date()
    const userTime = new Date(currentTime.toLocaleString("en-US", { timeZone: userTimeZone }))

    const userHour = userTime.getHours()

    const isLunchOrDinnerTime = userHour === 13 || userHour === 20

    if (user.pushNotificationPreference === "Daily" && isLunchOrDinnerTime) {
      appendPushNotification(toSend, user.ExpoPushTokens)
    } else if (user.pushNotificationPreference === "EveryOtherDay" && userHour === 20 && userTime.getDate() % 2 === 0) {
      appendPushNotification(toSend, user.ExpoPushTokens)
    } else if (user.pushNotificationPreference === "Weekly" && userHour === 20 && userTime.getDay() === 0) {
      appendPushNotification(toSend, user.ExpoPushTokens)
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
