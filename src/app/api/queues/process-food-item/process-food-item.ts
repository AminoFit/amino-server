// See docs here: https://vercel.com/docs/functions/serverless-functions/runtimes#maxduration
export const maxDuration = 300

import { HandleLogFoodItem } from "@/database/OpenAiFunctions/HandleLogFoodItems"
import { FoodItemToLog } from "@/utils/loggedFoodItemInterface"

import { Queue } from "quirrel/next-app"

import { SupabaseServiceKey, SupabaseURL } from "@/utils/auth-keys"
import { createClient } from "@supabase/supabase-js"
import { Database } from "types/supabase-generated.types"
import { generateFoodIconQueue } from "../generate-food-icon/generate-food-icon"

export const processFoodItemQueue = Queue(
  "api/queues/process-food-item", // 👈 the route it's reachable on
  async (loggedFoodIdString: string) => {
    console.log("Enter api/queues/process-food-item with payload:", loggedFoodIdString)

    const loggedFoodId = parseInt(loggedFoodIdString)

    if (isNaN(loggedFoodId)) {
      throw new Error("Invalid loggedFoodId")
    }

    const supabase = createClient<Database>(SupabaseURL, SupabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    })

    const { error, data: loggedFoodItem } = await supabase
      .from("LoggedFoodItem")
      .select("*, User(*)")
      .eq("id", loggedFoodId)
      .single()

    if (error) {
      throw error
    }

    console.log("api/queues/process-food-item", loggedFoodItem)

    if (!loggedFoodItem) {
      throw new Error("No Logged Food with that ID")
    }

    if (loggedFoodItem.status !== "Needs Processing") {
      throw new Error("Food does not need processing.")
    }
    if (!loggedFoodItem.User) {
      throw new Error("No user for food item")
    }

    const openAiData = loggedFoodItem?.extendedOpenAiData?.valueOf() as any

    if (!openAiData) {
      throw new Error("No openAiData")
    }
    if (!openAiData.food_database_search_name) {
      throw new Error("No food_database_search_name")
    }

    if (loggedFoodItem.messageId) {
      await HandleLogFoodItem(
        loggedFoodItem,
        openAiData as FoodItemToLog,
        loggedFoodItem.messageId,
        loggedFoodItem.User
      )
    } else {
      console.log("No messageId")
    }

    console.log("Done processing logged food item", loggedFoodItem.id)

    return
  }
)
