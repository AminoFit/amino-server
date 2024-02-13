import { SendRequestToGenerateIcon } from "@/foodMessageProcessing/foodIconsProcess"
import { createAdminSupabase } from "@/utils/supabase/serverAdmin"

console.log("This script will generate any missing food icons.")

async function run() {
  // await cleanupNullFoodId()
  await addMissingFoodItems()
  // await removeDuplicateIconQueueEntries()

  console.log("Done. Make sure amino images is running.")
}
run()

async function addMissingFoodItems() {
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

  await Promise.all(data.map((foodItem) => SendRequestToGenerateIcon(foodItem.id)))
}
// async function cleanupNullFoodId() {
//   console.log("Cleaning up null food id")
//   const supabaseAdmin = createAdminSupabase()
//   const { error } = await supabaseAdmin.from("IconQueue").delete().is("requested_food_item_id", null)
//   if (error) {
//     console.log("Error fetching IconQueue entries:", error)
//     return
//   }
//   console.log(`Deleted null entries`)
// }

// const removeDuplicateIconQueueEntries = async () => {
//   // Fetch all IconQueue entries
//   const supabaseAdmin = createAdminSupabase()
//   let { data: iconQueueEntries, error } = await supabaseAdmin
//     .from("IconQueue")
//     .select("*")
//     .order("result", { ascending: true })

//   if (error) {
//     console.error("Error fetching IconQueue entries:", error)
//     return
//   }

//   const entriesToDelete = []
//   const foundFoodItemIds = new Set()

//   // Identify duplicate entries
//   for (const entry of iconQueueEntries || []) {
//     if (entry.requested_food_item_id && foundFoodItemIds.has(entry.requested_food_item_id)) {
//       entriesToDelete.push(entry.id)
//     } else {
//       foundFoodItemIds.add(entry.requested_food_item_id)
//     }
//   }

//   // Delete duplicate entries
//   for (const entryId of entriesToDelete) {
//     const { error } = await supabaseAdmin.from("IconQueue").delete().match({ id: entryId })

//     if (error) {
//       console.error(`Error deleting entry with id ${entryId}:`, error)
//     } else {
//       console.log(`Deleted duplicate entry with id ${entryId}`)
//     }
//   }
// }
