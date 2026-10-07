import { Expo, type ExpoPushMessage } from "expo-server-sdk"
import { createAdminSupabase } from "@/utils/supabase/serverAdmin"

// Notifications about other people: requests, accepted invites, shares and meals logged for you. Each goes to every
// device the person registered (public.register_push_token). A tapped notification opens `url` in the app, through
// its linking config. Push is best effort: the same news is always visible in the app, so failures are only logged.

export type NoticeKind = "link_request" | "link_accepted" | "food_shared" | "meal_logged"
export type Notice = { kind: NoticeKind; title: string; body: string; url: string }

/** At most one notice of a kind per person in this window; later ones in a burst are dropped. */
const QUIET_MS = 2 * 60_000

const expo = new Expo()

export async function notify(userIds: string[], notice: Notice) {
  const ids = [...new Set(userIds)]
  if (!ids.length) return
  try {
    const db = createAdminSupabase() as any
    const since = new Date(Date.now() - QUIET_MS).toISOString()
    const { data: recent, error: recentError } = await db.from("PushNotice").select("userId")
      .in("userId", ids).eq("kind", notice.kind).gte("sentAt", since)
    if (recentError) throw recentError
    const quiet = new Set((recent ?? []).map((row: { userId: string }) => row.userId))
    const due = ids.filter(id => !quiet.has(id))
    if (!due.length) return
    const { error: insertError } = await db.from("PushNotice").insert(due.map(userId => ({ userId, kind: notice.kind })))
    if (insertError) throw insertError
    const { data: tokens, error } = await db.from("ExpoPushTokens").select("key").in("userId", due)
    if (error) throw error
    const messages: ExpoPushMessage[] = (tokens ?? []).map((row: { key: string }) => row.key).filter(Expo.isExpoPushToken)
      .map((to: string) => ({ to, title: notice.title, body: notice.body, data: { url: notice.url }, sound: "default" as const }))
    for (const chunk of expo.chunkPushNotifications(messages)) await expo.sendPushNotificationsAsync(chunk)
  } catch (error) {
    console.error("notify failed", notice.kind, error)
  }
}
