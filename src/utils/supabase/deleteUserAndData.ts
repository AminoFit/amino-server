import { createClient } from "@supabase/supabase-js"

export async function deleteUserAndData(userId: string) {
  const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || "",
    process.env.SUPABASE_SERVICE_ROLE_KEY || ""
  )

  // Delete messages
  await supabaseAdmin
    .from('Message')
    .delete()
    .eq('userId', userId);

  // Delete custom food items
  await supabaseAdmin
    .from('FoodItem')
    .delete()
    .eq('userId', userId);

  // Delete logged food items
  await supabaseAdmin
    .from('LoggedFoodItem')
    .delete()
    .eq('userId', userId);

  // Delete the user
  const { data, error } = await supabaseAdmin.auth.admin.deleteUser(userId)

  if (error) {
    return { error: error.message }
  }

  console.log("User and associated data (messages, food items) deleted successfully")
  return { success: true }
}
