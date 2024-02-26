// Utils
import { FoodItemToLog } from "@/utils/loggedFoodItemInterface"
import { isServerTimeData } from "./common/processFoodItemsUtils"
// Database
import UpdateMessage from "@/database/UpdateMessage"

import { Tables } from "types/supabase"
import { createAdminSupabase } from "@/utils/supabase/serverAdmin"
import { processFoodItemQueue } from "@/app/api/queues/process-food-item/process-food-item"

export async function AddLoggedFoodItemToQueue(
  user: Tables<"User">,
  user_message: Tables<"Message">,
  food_item_to_log: FoodItemToLog,
  index: number
): Promise<{ loggedFoodItemId: number, index: number }> {
  console.log("food_item_to_log", food_item_to_log)

  UpdateMessage({ id: user_message.id, incrementItemsToProcessBy: 1 })

  const supabase = createAdminSupabase()
  const { data: serverTimeData, error: serverTimeError } = await supabase.rpc("get_current_timestamp")

  if (serverTimeError) {
    throw serverTimeError
  }

  // Extract the timestamp from the server's response
  const timestamp = isServerTimeData(serverTimeData)
    ? new Date(serverTimeData.current_timestamp).toISOString()
    : new Date().toISOString()
  console.log("serverTimeData", serverTimeData)
  // Create all the pending food items
  let insertResult = await supabase
    .from("LoggedFoodItem")
    .insert({
      userId: user.id,
      createdAt: timestamp,
      updatedAt: timestamp,
      consumedOn: food_item_to_log.timeEaten
        ? new Date(food_item_to_log.timeEaten).toISOString()
        : new Date().toISOString(),
      messageId: user_message.id,
      status: "Needs Processing",
      extendedOpenAiData: food_item_to_log as any
    })
    .single()
  const error = insertResult.error
  if (error) {
    console.error("Foods need processing error", error)
  }
  const loggedFoodToProcess = insertResult.data as Tables<"LoggedFoodItem"> | null

  console.log("foodsNeedProcessing", loggedFoodToProcess)
  if (!loggedFoodToProcess) {
    throw new Error("Failed to create food item")
  }
  console.log("Adding food item to queue:", loggedFoodToProcess.id)
  await processFoodItemQueue.enqueue(
    `${loggedFoodToProcess.id}` // job to be enqueued
  )
  console.log(`Added food id to queue: ${loggedFoodToProcess.id}`)

  return {loggedFoodItemId: loggedFoodToProcess.id, index: index}
}
