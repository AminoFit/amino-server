import { Tables } from "types/supabase"
import { createAdminSupabase } from "@/utils/supabase/serverAdmin"

export async function LinkIconsOrCreateIfNeeded(foodItemId: number): Promise<void> {
    const supabase = createAdminSupabase()
  
    let { data: closestIcons, error } = await supabase.rpc("get_top_foodicon_embedding_similarity", {
      food_item_id: foodItemId
    })
    if (error) {
      console.error("Could not get top food icon embedding similarity")
      console.error(error)
      await SendRequestToGenerateIcon(foodItemId)
      return
    }
  
    if (closestIcons && closestIcons.length > 0) {
      if (closestIcons[0].cosine_similarity > 0.9) {
        // Link the icon
        await supabase
          .from("FoodItemImages")
          .insert([
            {
              foodItemId: foodItemId,
              foodImageId: closestIcons[0].food_icon_id
            }
          ])
          .select()
          .single()
        return
      }
    }
    await SendRequestToGenerateIcon(foodItemId)
  }
  export async function SendRequestToGenerateIcon(foodItemId: number): Promise<void> {
    const supabase = createAdminSupabase()
    await supabase.from("IconQueue").insert({ requested_food_item_id: foodItemId }).select()
    const { data: iconQueue, error: iconError } = await supabase
      .from("IconQueue")
      .insert({ requested_food_item_id: foodItemId })
      .select()
  
    if (iconError) {
      console.error("Error adding to icon queue", iconError)
    }
  }