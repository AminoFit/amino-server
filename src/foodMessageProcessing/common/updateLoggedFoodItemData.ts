import { isServerTimeData } from "@/foodMessageProcessing/common/processFoodItemsUtils"


// Database
import { Tables } from "types/supabase"
import { createAdminSupabase } from "@/utils/supabase/serverAdmin"

export async function updateLoggedFoodItemWithData(loggedFoodItemId: number, data: any): Promise<Tables<"LoggedFoodItem"> | null> {
    const supabase = createAdminSupabase()
  
    const { data: serverTimeData, error: serverTimeError } = await supabase.rpc("get_current_timestamp")
  
    if (serverTimeError) {
      console.log("serverTimeError error:", serverTimeError)
      throw serverTimeError
    }
  
    // Extract the timestamp from the server's response
    console.log("serverTimeData", serverTimeData, "is it server time data?", isServerTimeData(serverTimeData))
    const timestamp = isServerTimeData(serverTimeData)
      ? new Date(serverTimeData.current_timestamp).toISOString()
      : new Date().toISOString()
  
    // Add the timestamp to the data object for updating the updatedAt field
    data.updatedAt = timestamp
  
    const { data: result, error } = await supabase
      .from("LoggedFoodItem")
      .update(data)
      .eq("id", loggedFoodItemId)
      .select()
      .single()
    if (error) {
      console.log("logFoodItem error:", error)
      throw error
    }
  
    return result
  }