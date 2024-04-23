import { createAdminSupabase } from "@/utils/supabase/serverAdmin"
import { Expo } from "expo-server-sdk"

const expo = new Expo()

export async function GET(request: Request) {
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

  const toSend = []

  for (const user of data) {
    const userTimeZone = user.tzIdentifier

    const currentTime = new Date()
    const userTime = new Date(currentTime.toLocaleString("en-US", { timeZone: userTimeZone }))

    const userHour = userTime.getHours()
    //
    // if (userHour === 20) {
      for (const pushToken of user.ExpoPushTokens) {
        if (!Expo.isExpoPushToken(pushToken.key)) {
          console.error(`Invalid Expo push token: ${pushToken.key}`)
          continue
        }
        toSend.push({
          to: pushToken.key,
          title: "Daily Reminder",
          body: "Don't forget to log your macros!"
        })
      }
    }
  // }

  try {
    await expo.sendPushNotificationsAsync(toSend)
  } catch (error) {
    console.error(`Error sending push notification: ${error}`)
  }

  return Response.json({ status: 200, body: "Push notifications sent successfully" })
}
