import { createAdminSupabase } from "@/utils/supabase/serverAdmin"
import { Expo } from "expo-server-sdk"
import { NotificationOptions } from "./notifications"
import { validTimezone } from "@/mealOperations/instant"

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

  console.log("Push tokens:", data.length)

  const toSend: Array<{ to: string; title: string; body: string }> = []

  for (const pushToken of data) {
    if (!pushToken) {
      continue
    }
    // Each user's own clock (their profile timezone, which the app keeps on the phone's timezone). An unknown zone
    // skips that user instead of aborting the job for everyone.
    const userTimeZone = pushToken.User?.tzIdentifier
    if (!validTimezone(userTimeZone)) continue
    const userHour = Number(new Intl.DateTimeFormat("en-US", { timeZone: userTimeZone, hour: "numeric", hourCycle: "h23" })
      .format(new Date()))

    const isLunchOrDinnerTime = userHour === 13 || userHour === 20

    if (isLunchOrDinnerTime) {
      appendPushNotification(toSend, [pushToken])
    }
  }

  // Expo accepts at most 100 messages per request.
  for (const chunk of expo.chunkPushNotifications(toSend)) {
    try {
      await expo.sendPushNotificationsAsync(chunk)
    } catch (error) {
      console.error(`Error sending push notification: ${error}`)
    }
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
