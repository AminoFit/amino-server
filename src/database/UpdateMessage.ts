import { createAdminSupabase } from "@/utils/supabase/serverAdmin"
import { Enums } from "types/supabase"

type UpdateMessageProps = {
  id: number
  status?: Enums<"MessageStatus">
  resolvedAt?: Date
  messageType?: Enums<"MessageType">
  itemsToProcess?: number
  incrementItemsProcessedBy?: number // New field to specify how much to increment by
  itemsProcessed?: number
}

export default async function UpdateMessage(props: UpdateMessageProps) {
  const { id, incrementItemsProcessedBy } = props

  const supabase = createAdminSupabase()

  // Fetch the current message
  const { data: currentMessage } = await supabase.from("Message").select().eq("id", id).single()

  // Increment the itemsProcessed count
  const newItemsProcessed = (currentMessage?.itemsProcessed ?? 0) + (incrementItemsProcessedBy ?? 0)

  // Check if all items have been processed
  if (newItemsProcessed === currentMessage?.itemsToProcess) {
    props.status = "RESOLVED"
  }

  // Build the update object based on the provided fields
  const updateData: any = {
    status: props.status,
    resolvedAt: props.resolvedAt,
    messageType: props.messageType,
    itemsToProcess: props.itemsToProcess,
    itemsProcessed: newItemsProcessed
  }

  const { data: updatedMessage } = await supabase.from("Message").update(updateData).eq("id", id).single()

  return updatedMessage
}
