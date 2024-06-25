import { createAdminSupabase } from "@/utils/supabase/serverAdmin"
import { Tables } from "types/supabase"
import { FoodItemToLog } from "@/utils/loggedFoodItemInterface"
import { ProcessLogFoodItem } from "@/foodMessageProcessing/processAndMatchLoggedFoodItem"
import readline from "readline"
import { getUserById } from "@/foodMessageProcessing/common/debugHelper"

async function processLoggedFoodItems(itemIds?: number[]) {
    const supabase = createAdminSupabase()
  
    let loggedFoodItems: any[]
    if (itemIds) {
      console.log(`Processing logged food items with IDs: ${itemIds.join(", ")}`)
      const { data, error } = await supabase
        .from("LoggedFoodItem")
        .select("*")
        .in("id", itemIds)
        .order("consumedOn", { ascending: false })
  
      if (error) {
        console.error("Error fetching logged food items:", error)
        return
      }
      loggedFoodItems = data
    } else {
      console.log("Processing logged food items with status 'Needs Processing'")
      const { data, error } = await supabase
        .from("LoggedFoodItem")
        .select("*")
        .eq("status", "Needs Processing")
        .order("consumedOn", { ascending: false })
  
      if (error) {
        console.error("Error fetching logged food items:", error)
        return
      }
      loggedFoodItems = data
    }
  
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    })
  
    let processedCount = 0
    let totalCount = loggedFoodItems.length
  
    for (const loggedFoodItem of loggedFoodItems) {
      console.log(`Processing logged food item with ID: ${loggedFoodItem.id} - ${loggedFoodItem.full_item_user_message_including_serving}`)
  
      if (!loggedFoodItem.extendedOpenAiData) {
        console.error(`Missing extended OpenAI data for logged food item: ${loggedFoodItem.id}`)
        continue
      }
  
      let extendedData: any
      try {
        extendedData = typeof loggedFoodItem.extendedOpenAiData === "string"
          ? JSON.parse(loggedFoodItem.extendedOpenAiData)
          : loggedFoodItem.extendedOpenAiData
      } catch (error) {
        console.error(`Error parsing extended OpenAI data for logged food item: ${loggedFoodItem.id}`, error)
        continue
      }

      const foodItemToLog = loggedFoodItem?.extendedOpenAiData?.valueOf() as FoodItemToLog
  
      const user = await getUserById(loggedFoodItem.userId)
      if (!user) {
        console.error(`User not found for logged food item: ${loggedFoodItem.id}`)
        continue
      }
  
      try {
        await ProcessLogFoodItem(loggedFoodItem as Tables<"LoggedFoodItem">, foodItemToLog, loggedFoodItem.messageId!, user)
        processedCount++
        console.log(`Processed item: ${loggedFoodItem.id}`)
      } catch (error) {
        console.error(`Error processing logged food item: ${loggedFoodItem.id}`, error)
      }
  
      console.log(`Processed: ${processedCount}, Remaining: ${totalCount - processedCount}`)
      await new Promise((resolve) => rl.question("Press Enter to process the next item...", resolve))
    }
  
    rl.close()
  }

const fooditemids = [22765,22663]
//TODO: fix item 4888 and remove unknown items from database
processLoggedFoodItems([36353])