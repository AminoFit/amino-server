"use server"
import { createClient } from "@/utils/supabase/server"

export async function deleteSavedFood(loggedFoodItemId: number) {
  const supabase = createClient()
  const {
    data: { user }
  } = await supabase.auth.getUser()

  if (!user) {
    return new Response("User not found", { status: 404 })
  }
  const { error } = await supabase.from("LoggedFoodItem").delete().eq("id", loggedFoodItemId).eq("userId", user.id)
}
