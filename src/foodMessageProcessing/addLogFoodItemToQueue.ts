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
    food_item_to_log: FoodItemToLog
  ) {
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
    let { data: foodsNeedProcessing, error } = await supabase
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
      .select()
  
    if (error) {
      console.error("Foods need processing error", error)
    }
  
    console.log("foodsNeedProcessing", foodsNeedProcessing)
  
    foodsNeedProcessing = foodsNeedProcessing || []
  
    // Add each pending food item to queue
    for (let food of foodsNeedProcessing) {
      console.log("Adding food item to queue:", food.id)
      await processFoodItemQueue.enqueue(
        `${food.id}` // job to be enqueued
      )
      console.log(`Added food id to queue: ${food.id}`)
    }
  }