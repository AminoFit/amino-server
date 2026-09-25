import { classifyFoodItemToCategory } from "@/foodMessageProcessing/classifyFoodItemInCategory/classifyFoodItemInCategory"
import { createAdminSupabase } from "@/utils/supabase/serverAdmin"

// Maintenance tool. Inspect the first 100 uncategorized foods by default;
// only --apply writes classifications back to the catalogue.
async function main() {
  const apply = process.argv.includes("--apply")
  const supabase = createAdminSupabase()
  const {data:foods,error} = await supabase.from("FoodItem")
    .select("id,name,brand,foodItemCategoryID")
    .is("foodItemCategoryID",null).order("id").limit(100)
  if (error) throw error
  for (const food of foods ?? []) {
    const result = await classifyFoodItemToCategory(food)
    console.log(JSON.stringify({foodId:food.id,name:food.name,choice:result?.foodItemCategoryID ?? null,
      category:result?.foodItemCategoryName ?? null,applied:apply && Boolean(result)}))
    if (!apply || !result) continue
    const {error:updateError} = await supabase.from("FoodItem")
      .update({foodItemCategoryID:result.foodItemCategoryID,foodItemCategoryName:result.foodItemCategoryName})
      .eq("id",food.id).is("foodItemCategoryID",null)
    if (updateError) throw updateError
  }
}

main().catch(error=>{console.error(error);process.exitCode=1})
