import { createAdminSupabase } from "@/utils/supabase/serverAdmin"
import { Tables } from "types/supabase"

// Atomic compare-and-set: only one request can move this observed message into
// PROCESSING. Active edits are refused rather than deleting a running job's foods.
export async function claimFoodMessage(message: Tables<"Message">, userId: string, consumedOn: string) {
  if (message.status === "PROCESSING") return false
  let query = createAdminSupabase().from("Message").update({
    status: "PROCESSING", consumedOn, itemsToProcess: 0, itemsProcessed: 0, resolvedAt: null
  }).eq("id", message.id).eq("userId", userId).eq("status", message.status)
    .eq("content", message.content).is("deletedAt", null)
  query = message.resolvedAt == null ? query.is("resolvedAt", null) : query.eq("resolvedAt", message.resolvedAt)
  const result = await query.select("id").maybeSingle()
  if (result.error) throw result.error
  return Boolean(result.data)
}
