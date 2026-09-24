import { createAdminSupabase } from "@/utils/supabase/serverAdmin"
import { Tables } from "types/supabase"

export async function updateLoggedFoodItemWithData(loggedFoodItemId: number, data: any): Promise<Pick<Tables<"LoggedFoodItem">,
  "id" | "grams" | "loggedUnit" | "status" | "messageId"> | null> {
  const supabase = createAdminSupabase()
  // LoggedFoodItem's BEFORE UPDATE trigger sets updatedAt on the server.
  const { data: result, error } = await supabase.from("LoggedFoodItem")
    .update(data)
    .eq("id", loggedFoodItemId)
    .select("id, grams, loggedUnit, status, messageId")
    .single()
  if (error) throw error
  return result
}
