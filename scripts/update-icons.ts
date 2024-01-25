import { SendRequestToGenerateIcon } from "@/foodMessageProcessing/foodIconsProcess"
import { createAdminSupabase } from "@/utils/supabase/serverAdmin"

console.log("This script will generate any missing food icons.")

async function run() {
  const supabaseAdmin = createAdminSupabase()

  const { data, error } = await supabaseAdmin
    .from("FoodItem")
    .select("id, name, FoodItemImages(*)")
    .filter("FoodItemImages.id", "is", null)

  if (error) {
    console.error(error)
    return
  }
  console.log("Found " + data.length + " food items without images.")

  for (const foodItem of data) {
    console.log(`Adding icon for ${foodItem.name} to queue.`)
    await SendRequestToGenerateIcon(foodItem.id)
  }
  console.log("Done. Make sure amino images is running.")
}
run()
