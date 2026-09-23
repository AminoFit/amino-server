import { createAdminSupabase } from "@/utils/supabase/serverAdmin"
import { Enums } from "types/supabase"
import { Tables } from "types/supabase-generated.types"

type UpdateMessageProps = {
  id: number
  status?: Enums<"MessageStatus">
  resolvedAt?: Date
  messageType?: Enums<"MessageType">
  itemsToProcess?: number
  incrementItemsProcessedBy?: number 
  incrementItemsToProcessBy?: number 
  itemsProcessed?: number
  consumedOn?: Date
  deletedAt?: Date
  isBadFoodLogRequest?: boolean
}

export default async function UpdateMessage(props: UpdateMessageProps) {
  const supabase = createAdminSupabase()
  // Compare-and-swap prevents parallel workers from losing counter updates.
  for (let attempt = 0; attempt < 10; attempt++) {
    const { data: current, error } = await supabase.from("Message").select().eq("id", props.id).single()
    if (error) throw error
    const update: Partial<Tables<"Message">> = {}
    if (props.status !== undefined) update.status = props.status
    if (props.resolvedAt !== undefined) update.resolvedAt = props.resolvedAt.toISOString()
    if (props.consumedOn !== undefined) update.consumedOn = props.consumedOn.toISOString()
    if (props.deletedAt !== undefined) update.deletedAt = props.deletedAt.toISOString()
    if (props.messageType !== undefined) update.messageType = props.messageType
    if (props.isBadFoodLogRequest !== undefined) update.isBadFoodRequest = props.isBadFoodLogRequest
    if (props.itemsProcessed !== undefined || props.incrementItemsProcessedBy !== undefined) {
      update.itemsProcessed = props.itemsProcessed ?? ((current.itemsProcessed ?? 0) + (props.incrementItemsProcessedBy ?? 0))
    }
    if (props.itemsToProcess !== undefined || props.incrementItemsToProcessBy !== undefined) {
      update.itemsToProcess = props.itemsToProcess ?? ((current.itemsToProcess ?? 0) + (props.incrementItemsToProcessBy ?? 0))
    }
    let query = supabase.from("Message").update(update).eq("id", props.id).eq("status", current.status)
    query = current.itemsProcessed === null ? query.is("itemsProcessed", null) : query.eq("itemsProcessed", current.itemsProcessed)
    query = current.itemsToProcess === null ? query.is("itemsToProcess", null) : query.eq("itemsToProcess", current.itemsToProcess)
    const result = await query.select().maybeSingle()
    if (result.error) throw result.error
    if (result.data) return result.data
  }
  throw new Error("Message changed repeatedly while updating")
}
