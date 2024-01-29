import { createAdminSupabase } from "@/utils/supabase/serverAdmin"
import { Tables } from "types/supabase"

console.log(
  "This script will fix the urls of the icons in the database so they can be served using supabase image transformations."
)

async function run() {
  await addMissingFoodItems()

  console.log("Done. Make sure amino images is running.")
}
run()

async function addMissingFoodItems() {
  const supabaseAdmin = createAdminSupabase()
  const { data: foodImages, error } = await supabaseAdmin.from("FoodImage").select("*")

  if (error) {
    console.error(error)
    return
  }
  console.log("Found " + foodImages.length + " food images.")

  for (const foodImage of foodImages) {
    await checkAndFixPathIfNeeded(foodImage)
  }
}

async function checkAndFixPathIfNeeded(foodImage: Tables<"FoodImage">) {
  if (foodImage.pathToImage.indexOf("v1/object") > 0) {
    const updatedPath = foodImage.pathToImage.replace("v1/object", "v1/render/image")
    console.log("Updating path from " + foodImage.pathToImage + " to " + updatedPath)
    const supabaseAdmin = createAdminSupabase()
    await supabaseAdmin.from("FoodImage").update({ pathToImage: updatedPath }).eq("id", foodImage.id)
    console.log("Updated path.")
    return
  }

  console.log("No need to update path.")
}
