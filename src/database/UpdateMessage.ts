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
}

export default async function UpdateMessage(props: UpdateMessageProps) {
  const { id, incrementItemsProcessedBy, incrementItemsToProcessBy } = props

  const supabase = createAdminSupabase()

  // Fetch the current message
  const { data: currentMessage } = await supabase.from("Message").select().eq("id", id).single()

  // Increment the itemsProcessed count
  const newItemsProcessed = (currentMessage?.itemsProcessed ?? 0) + (incrementItemsProcessedBy ?? 0)

  const itemsToProcess = props.itemsToProcess || ((currentMessage?.itemsToProcess ?? 0) + (incrementItemsToProcessBy ?? 0));
  
  // Check if all items have been processed
  if (newItemsProcessed === currentMessage?.itemsToProcess) {
    props.status = "RESOLVED"
  }

  // Build the update object based on the provided fields
  const updateData: Partial<Tables<"Message">> = {
    status: props.status,
    resolvedAt: props.resolvedAt?.toISOString(),
    consumedOn: props.consumedOn?.toISOString(),
    deletedAt: props.deletedAt?.toISOString(),
    messageType: props.messageType,
    itemsToProcess: itemsToProcess,
    itemsProcessed: newItemsProcessed
  }

  const { data: updatedMessage } = await supabase.from("Message").update(updateData).eq("id", id).single()

  return updatedMessage
}
