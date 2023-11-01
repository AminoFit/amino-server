"use server"
import { createServerActionClient } from "@supabase/auth-helpers-nextjs"
import { cookies } from "next/headers"

export async function deleteSavedFood(loggedFoodItemId: number) {
  const supabase = createServerActionClient({ cookies })
  const {
    data: { user }
  } = await supabase.auth.getUser()

  if (!user) {
    return new Response("User not found", { status: 404 })
  }
  const { error } = await supabase.from("LoggedFoodItem").delete().eq("id", loggedFoodItemId).eq("userId", user.id)
}
