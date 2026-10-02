"use server"

import { QuickLogMessage } from "@/app/api/processMessage"
import { createClient } from "@/utils/supabase/server"

export async function QuickLogFoodMessage(newMessage: string) {
  if (!newMessage) return { error: "No message provided" }
  const supabase = createClient()
  const {
    data: { user }
  } = await supabase.auth.getUser()

  if (!user) {
    return { error: "No user authenticated" }
  }

  const { error, data: aminoUser } = await supabase.from("User").select().eq("id", user.id).single()
  console.log("QuickLogFoodMessage")

  if (!aminoUser) {
    return { error: "No user found" }
  }

  if (aminoUser) {
    const message = await QuickLogMessage(aminoUser, newMessage)
    console.log("message", message)
    return { message }
  }
  return { error: "No session" }
}
