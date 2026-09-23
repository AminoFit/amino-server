import { createAdminSupabase } from "@/utils/supabase/serverAdmin"

// Read the message before the foods and compare its version on update. A slower
// worker must not overwrite a newer worker's successful count with a stale count.
export async function refreshFoodMessageProgress(messageId: number) {
  const supabase = createAdminSupabase()
  for (let attempt = 0; attempt < 10; attempt++) {
    const { data: message, error } = await supabase.from("Message").select().eq("id", messageId).single()
    if (error) throw error
    if (message.deletedAt) return message
    const foods = await supabase.from("LoggedFoodItem").select("status").eq("messageId", messageId).is("deletedAt", null)
    if (foods.error) throw foods.error
    const processed = foods.data.filter(food => food.status === "Processed").length
    const failed = foods.data.some(food => food.status === "Matching Failed")
    const complete = (message.itemsToProcess ?? 0) > 0 && processed === message.itemsToProcess
    const status = failed || message.status === "FAILED" ? "FAILED" : complete ? "RESOLVED" : "PROCESSING"
    let query = supabase.from("Message").update({
      status,
      itemsProcessed: processed,
      resolvedAt: status === "PROCESSING" ? null : new Date().toISOString()
    }).eq("id", messageId).eq("status", message.status).is("deletedAt", null)
    query = message.itemsProcessed === null ? query.is("itemsProcessed", null) : query.eq("itemsProcessed", message.itemsProcessed)
    query = message.itemsToProcess === null ? query.is("itemsToProcess", null) : query.eq("itemsToProcess", message.itemsToProcess)
    const result = await query.select().maybeSingle()
    if (result.error) throw result.error
    if (result.data) return result.data
  }
  throw new Error("Message progress changed repeatedly")
}
