// Utils
import { FoodItemToLog } from "@/utils/loggedFoodItemInterface"
import { isServerTimeData } from "./common/processFoodItemsUtils"
import { convertNutritionalInfoStrings } from "@/utils/helper/convertFoodItemToLog" // Import the conversion utility
// Database
import UpdateMessage from "@/database/UpdateMessage"

import { Tables } from "types/supabase"
import { createAdminSupabase } from "@/utils/supabase/serverAdmin"
import { processFoodItemQueue } from "@/app/api/queues/process-food-item/process-food-item"
import { getUserByEmail, getUserMessageById } from "./common/debugHelper"

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

  // Convert nutritional information strings to numbers
  const convertedFoodItemToLog = convertNutritionalInfoStrings(food_item_to_log)

  // Create all the pending food items
  let insertResult = await supabase
  .from("LoggedFoodItem")
  .insert({
    userId: user.id,
    createdAt: timestamp,
    updatedAt: timestamp,
    consumedOn: convertedFoodItemToLog.timeEaten
      ? new Date(convertedFoodItemToLog.timeEaten).toISOString()
      : new Date().toISOString(),
    messageId: user_message.id,
    status: "Needs Processing",
    extendedOpenAiData: convertedFoodItemToLog as any,
    ...convertedFoodItemToLog.nutritional_information as any, 
  })
  .select()
  .single();
  
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
    `${loggedFoodToProcess.id}` 
  )
  console.log(`Added food id to queue: ${loggedFoodToProcess.id}`)

  return {loggedFoodItemId: loggedFoodToProcess.id, index: index}
}


async function testAddToQueue(){
  const user = await getUserByEmail("seb.grubb@gmail.com") as Tables<"User">
  const user_message = await getUserMessageById(1906) as Tables<"Message">
  const food_item_to_log = {
    timeEaten: "2022-02-22T22:22:22Z",
    food_database_search_name: "apple",
    full_item_user_message_including_serving: "1 apple",
    branded: false,
    serving: {
      serving_g_or_ml: "g",
      total_serving_g_or_ml: 182
    },
    nutritional_information: {
      kcal: "52*10",
      totalFatG: "0.2",
      carbG: "14",
      fiberG: "2.4",
      sugarG: "10.4",
      proteinG: "0.3"
    }
  } as FoodItemToLog
  await AddLoggedFoodItemToQueue(user, user_message, food_item_to_log, 0)
}

// testAddToQueue()
