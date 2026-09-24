import { Queue } from "quirrel/next-app"
import { createAdminSupabase } from "@/utils/supabase/serverAdmin"
import { classifyFoodItemToCategory } from "@/foodMessageProcessing/classifyFoodItemInCategory/classifyFoodItemInCategory"

export const classifyFoodCategoryQueue = Queue("api/queues/classify-food-category", async (idText: string) => {
  const id = Number(idText)
  if (!Number.isSafeInteger(id) || id <= 0) throw new Error("Invalid food ID")
  const supabase = createAdminSupabase()
  const {data:food,error} = await supabase.from("FoodItem")
    .select("id,name,brand,foodItemCategoryID").eq("id",id).single()
  if (error) throw error
  if (!food || food.foodItemCategoryID) return
  const category = await classifyFoodItemToCategory(food)
  if (!category) return // An ambiguous food stays loggable and uncategorized.
  const {error:updateError} = await supabase.from("FoodItem")
    .update({foodItemCategoryID:category.foodItemCategoryID,foodItemCategoryName:category.foodItemCategoryName})
    .eq("id",id).is("foodItemCategoryID",null)
  if (updateError) throw updateError
})
