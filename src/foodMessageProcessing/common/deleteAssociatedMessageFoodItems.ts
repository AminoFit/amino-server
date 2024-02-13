import { createAdminSupabase } from "@/utils/supabase/serverAdmin"

// Function to soft-delete logged food items by messageId
export async function softDeleteLoggedFoodItemsByMessageId(messageId: number): Promise<void> {
  const supabaseAdmin = createAdminSupabase()

  const { data, error } = await supabaseAdmin
    .from("LoggedFoodItem")
    .update({ deletedAt: new Date().toISOString() }) // Set deletedAt to current timestamp
    .match({ messageId: messageId, deletedAt: null }) // Target rows where messageId matches and not already deleted

  if (error) {
    console.error("Error soft-deleting logged food items:", error)
    throw error
  }
  if (!data) {
    console.log("No associated items to delete or update.")
  } else {
    // Use type assertion to treat data as an array
    console.log(`Soft-deleted ${(<any>data).length} logged food items.`)
  }
}
