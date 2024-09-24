import { getUsdaFoodsInfo } from "@/FoodDbThirdPty/USDA/getFoodInfo"
import { createAdminSupabase } from "@/utils/supabase/serverAdmin"
import { Tables } from "types/supabase"

async function main() {
  const supabase = createAdminSupabase()

  // Fetch food items where kcalPerServing is zero
  const { data: foodItems, error } = await supabase
    .from("FoodItem")
    .select(
      "id, name, brand, kcalPerServing, totalFatPerServing, carbPerServing, proteinPerServing, foodInfoSource, externalId"
    )
    .eq("kcalPerServing", 0)

  if (error) {
    console.error("Error fetching food items:", error)
    return
  }

  if (!foodItems || foodItems.length === 0) {
    console.log("No food items with kcalPerServing = 0")
    return
  }

  // Calculate estimated calories based on macronutrients
  const itemsWithEstimatedCalories = foodItems.map((item) => {
    const totalFatPerServing = item.totalFatPerServing || 0
    const carbPerServing = item.carbPerServing || 0
    const proteinPerServing = item.proteinPerServing || 0

    const estimatedCalories = totalFatPerServing * 9 + carbPerServing * 4 + proteinPerServing * 4

    return { ...item, estimatedCalories }
  })

  // Filter items where estimatedCalories > 0
  const itemsWithNonZeroEstimatedCalories = itemsWithEstimatedCalories.filter((item) => item.estimatedCalories > 0)

  // Sort items by estimatedCalories in descending order (most egregious first)
  const sortedItems = itemsWithNonZeroEstimatedCalories.sort((a, b) => b.estimatedCalories - a.estimatedCalories)

  // Print out the items
  for (const item of sortedItems) {
    console.log(
      `Item ID: ${item.id}, Name: ${item.name}, Brand: ${
        item.brand || "N/A"
      }, Estimated Calories: ${item.estimatedCalories.toFixed(2)}, kcalPerServing: ${
        item.kcalPerServing
      }, carbPerServing: ${item.carbPerServing}, proteinPerServing: ${item.proteinPerServing}, totalFatPerServing: ${
        item.totalFatPerServing
      }, source: ${item.foodInfoSource}, externalId: ${item.externalId}`
    )
    // if (item.foodInfoSource === "USDA") {
    //   const foodInfo = await getUsdaFoodsInfo({ fdcIds: [item.externalId!] })
    //   console.log("USDA Food Info:", foodInfo)
    //   if (foodInfo && foodInfo.length > 0 && foodInfo[0].kcalPerServing > 0) {
    //     console.log("Updating supabase with kcalPerServing:", foodInfo[0].kcalPerServing, "for item ID:", item.id)
    //     const { error: updateError } = await supabase
    //       .from("FoodItem")
    //       .update({ kcalPerServing: foodInfo[0].kcalPerServing })
    //       .eq("id", item.id)
    //   }
    // }
  }
}

main().catch(console.error)
