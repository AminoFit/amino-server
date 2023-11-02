import { vectorToSql, vectorFromSql } from "@/utils/pgvectorHelper"
import { getFoodEmbedding } from "../../../utils/foodEmbedding"
import { createAdminSupabase } from "@/utils/supabase/serverAdmin"

type FoodItemId = {
  id: number
}

export async function embeddingBackfill() {
  const supabase = createAdminSupabase()

  // Get all IDs of items without embeddings using raw SQL
  const { data: itemsWithoutEmbedding } = await supabase.from("FoodItem").select().is("bgeBaseEmbedding", null)

  if (!itemsWithoutEmbedding) return

  // Iterate over the IDs and fetch the full FoodItem objects
  for (const foodItem of itemsWithoutEmbedding) {
    // Fetch the full FoodItem object by ID

    // Check if the foodItem is found and create the embedding
    if (foodItem) {
      const newEmbeddingArray = new Float32Array(await getFoodEmbedding(foodItem))
      const embeddingSql = vectorToSql(Array.from(newEmbeddingArray))

      // Update the database record with the new embedding
      await supabase.from("FoodItem").update({ bgeBaseEmbedding: embeddingSql }).eq("id", foodItem.id)
    }
  }
}
