import { GetMessageById } from "@/database/GetMessagesForUser"
import { takeOverMessage } from "@/mealOperations/takeover"
import { Enums, Tables } from "types/supabase"

type ResponseForUser = {
  resultMessage: string
  responseToFunctionName?: string
  status?: Enums<"MessageStatus">
  itemsProcessed?: number
  itemsToProcess?: number
  warning?: string
}

/** The meal agent resolves every food log. This adapter serves the current app's
 * quick-log endpoint: publication writes the LoggedFoodItem rows the app reads. */
export async function GenerateResponseForQuickLog(
  user: Tables<"User">,
  inputMessageId: number,
  consumedOn: string = new Date().toISOString(),
  isMessageBeingEdited: boolean = false
): Promise<ResponseForUser> {
  const loadedMessage = await GetMessageById(inputMessageId)
  if (!loadedMessage || loadedMessage.userId !== user.id || loadedMessage.deletedAt) {
    throw new Error("Message is unavailable")
  }
  if (!Number.isFinite(new Date(consumedOn).getTime())) throw new Error("Invalid consumedOn")
  // A failed meal may be submitted again; a resolved or running one only through an edit.
  if (!isMessageBeingEdited && ["RESOLVED", "PROCESSING"].includes(loadedMessage.status)) {
    return { resultMessage: "Message has already been submitted. Check its food items before retrying.",
      status: loadedMessage.status, itemsProcessed: loadedMessage.itemsProcessed ?? 0,
      itemsToProcess: loadedMessage.itemsToProcess ?? 0 }
  }
  return takeOverMessage(user, loadedMessage, consumedOn, isMessageBeingEdited)
}
