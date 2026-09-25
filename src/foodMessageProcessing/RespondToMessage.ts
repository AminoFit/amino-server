import { shadowFoodHistory } from "@/foodResolution/history/shadow"
import { reuseFoodHistory } from "@/foodResolution/history/reuse"
import { foodTrace, foodStage } from "@/foodResolution/telemetry"
import { claimFoodMessage } from "./common/claimFoodMessage"
import { AddLoggedFoodItemToQueue } from "./addLogFoodItemToQueue"
import { preserveExplicitAdditions } from "@/foodResolution/composition"
import { shadowNutritionConstraints } from "@/foodResolution/constraints/shadow"
import { refreshFoodMessageProgress } from "./common/refreshFoodMessageProgress"
import { GetMessageById } from "@/database/GetMessagesForUser"
import UpdateMessage from "@/database/UpdateMessage"
import { FoodItemToLog } from "@/utils/loggedFoodItemInterface"
import { Enums, Tables } from "types/supabase"
import { logFoodItemStream } from "./logFoodItemExtract/logFoodItemStreamChat"
import { logFoodItemStreamWithImages } from "./logFoodItemWithImageExtract/logFoodItemWithImageStreamChat"
import { softDeleteLoggedFoodItemsByMessageId } from "./common/deleteAssociatedMessageFoodItems"
import { getMessageTimeChat } from "./messageTime/extractMessageTime"

type ResponseForUser = {
  resultMessage: string
  responseToFunctionName?: string
  status?: Enums<"MessageStatus">
  itemsProcessed?: number
  itemsToProcess?: number
  warning?: string
}

// Extract first, then publish the complete expected count before any queue job
// can finish. Pending and failed matches are never reported as successful meals.
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
  return foodTrace(user.id, inputMessageId, loadedMessage.hasimages ? "image" : "text", async () => {
    if (!Number.isFinite(new Date(consumedOn).getTime())) throw new Error("Invalid consumedOn")
    if (!isMessageBeingEdited && ["RESOLVED", "PROCESSING", "FAILED"].includes(loadedMessage.status)) {
      return { resultMessage: "Message has already been submitted. Check its food items before retrying.",
        status: loadedMessage.status, itemsProcessed: loadedMessage.itemsProcessed ?? 0,
        itemsToProcess: loadedMessage.itemsToProcess ?? 0 }
    }
    if (loadedMessage.status !== "PROCESSING") {
      const historyReply = await reuseFoodHistory(user, loadedMessage, consumedOn, isMessageBeingEdited)
      if (historyReply) return historyReply
    }
    if (!await claimFoodMessage(loadedMessage, user.id, consumedOn)) {
      const current = await GetMessageById(inputMessageId)
      return { resultMessage: "Message has already been submitted. Check its food items before retrying.",
        status: current?.status ?? "PROCESSING", itemsProcessed: current?.itemsProcessed ?? 0,
        itemsToProcess: current?.itemsToProcess ?? 0 }
    }
    if (isMessageBeingEdited) {
      try { await softDeleteLoggedFoodItemsByMessageId(inputMessageId) }
      catch (error) {
        await UpdateMessage({ id: inputMessageId, status: "FAILED", resolvedAt: new Date() })
        throw error
      }
    }

    // Existing messages have no edit timestamp/revision. Do not interpret an
    // edited "yesterday" against the original message's creation date.
    const historyPromise = isMessageBeingEdited ? Promise.resolve() : shadowFoodHistory(user, { text: loadedMessage.content,
      referenceTime: loadedMessage.createdAt, excludeMessageId: inputMessageId })
    let nutritionPromise:Promise<void>|undefined
    try {
      // Attach the rejection handler immediately, even if extraction later fails.
      // Time inference is optional; the caller already supplied a valid timestamp.
      let warning: string | undefined
      const timePromise = isMessageBeingEdited ? Promise.resolve(null) :
        getMessageTimeChat(user, loadedMessage.content).catch(() => {
          console.error("Quick log time inference failed", { messageId: inputMessageId })
          warning = "Used the selected meal time because automatic time detection failed."
          return null
        })
      let foodItemsToLog: FoodItemToLog[]
      let isBadFoodLogRequest: boolean
      try {
        const result = await foodStage("extraction", async () => loadedMessage.hasimages
          ? await logFoodItemStreamWithImages(user, loadedMessage, new Date(consumedOn))
          : await logFoodItemStream(user, loadedMessage, new Date(consumedOn)))
        ;({ foodItemsToLog, isBadFoodLogRequest } = result)
        foodItemsToLog=preserveExplicitAdditions(foodItemsToLog)
        nutritionPromise=shadowNutritionConstraints(loadedMessage.content,foodItemsToLog)
      } catch (error) {
        await UpdateMessage({ id: inputMessageId, status: "FAILED", resolvedAt: new Date() })
        throw error
      }
      if (!foodItemsToLog.length) {
        await UpdateMessage({ id: inputMessageId, status: "FAILED", resolvedAt: new Date(), isBadFoodLogRequest: true })
        return { resultMessage: "Could not identify any food items.", status: "FAILED", itemsProcessed: 0, itemsToProcess: 0 }
      }
      const inferred = await timePromise
      const inferredDate = inferred?.timeWasSpecified ? inferred.consumedDateTime : null
      const mealTime = inferredDate && Number.isFinite(inferredDate.getTime()) ? inferredDate : new Date(consumedOn)
      await UpdateMessage({ id: inputMessageId, itemsToProcess: foodItemsToLog.length,
        consumedOn: mealTime, isBadFoodLogRequest })
      const queued = await Promise.allSettled(foodItemsToLog.map(async (food, index) => {
        food.timeEaten = new Date(mealTime.getTime() + index * 10).toISOString()
        const result = await AddLoggedFoodItemToQueue(user, loadedMessage, food, index)
        food.database_id = result.loggedFoodItemId
      }))
      if (queued.some(result => result.status === "rejected")) {
        await UpdateMessage({ id: inputMessageId, status: "FAILED", resolvedAt: new Date() })
      }
      const progress = await refreshFoodMessageProgress(inputMessageId)
      return {
        resultMessage: progress.status === "RESOLVED" ? "All food items were logged successfully." :
          progress.status === "FAILED" ? "Some food items could not be logged. Review the saved items before retrying." :
          "Food items submitted and still processing.",
        status: progress.status,
        itemsProcessed: progress.itemsProcessed ?? 0,
        itemsToProcess: progress.itemsToProcess ?? 0,
        ...(warning ? { warning } : {})
      }
    } finally { await Promise.all([historyPromise,nutritionPromise]) }
  })
}
