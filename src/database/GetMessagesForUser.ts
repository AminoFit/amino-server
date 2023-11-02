import { createAdminSupabase } from "@/utils/supabase/serverAdmin"

export async function GetMessagesForUser(userId: string) {
  const supabase = createAdminSupabase()

  let { data: messagesForUser } = await supabase
    .from("Message")
    .select("*")
    .eq("userId", userId)
    .order("createdAt", { ascending: false })
    .limit(10)

  messagesForUser = messagesForUser || []

  return messagesForUser.reverse()
}
export async function GetMessageById(messageId: number) {
  const supabase = createAdminSupabase()

  const { data: message } = await supabase.from("Message").select().eq("id", messageId).single()

  return message
}
