import { createAdminSupabase } from "@/utils/supabase/serverAdmin"
import { Enums, Tables } from "types/supabase"

export default async function SaveMessageFromUser(
  user: Tables<"User">,
  content: string,
  role: Enums<"Role">,
  functionName?: string,
  messageType?: Enums<"MessageType">
) {
  const supabase = createAdminSupabase()

  const { data: newMessage, error } = await supabase
    .from("Message")
    .insert({ userId: user.id, content, role, function_name: functionName, messageType })
    .select()
    .single()

  if (error || !newMessage) throw error

  return newMessage
}
