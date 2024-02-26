import { FoodItemToLog } from "@/utils/loggedFoodItemInterface"
import { createAdminSupabase } from "@/utils/supabase/serverAdmin"

export async function updateConsumedOnTimesAsync(foodItemsToLog: FoodItemToLog[], consumedDateTime: Date) {
  const supabase = createAdminSupabase()

  const updatePromises = foodItemsToLog.map((foodItem, index) => {
    const newConsumedOnTime = new Date(consumedDateTime.getTime() + index * 10).toISOString()

    return supabase.from("LoggedFoodItem").update({ consumedOn: newConsumedOnTime }).match({ id: foodItem.database_id })
  })

  // Wait for all the update promises to settle
  const results = await Promise.allSettled(updatePromises)

  // Handle the results
  results.forEach((result, index) => {
    if (result.status === "fulfilled") {
      console.log(`Successfully updated item with ID: ${foodItemsToLog[index].database_id}`)
    } else {
      console.error(`Failed to update item with ID: ${foodItemsToLog[index].database_id}`, result.reason)
    }
  })
}
