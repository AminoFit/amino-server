import { createAdminSupabase } from "@/utils/supabase/serverAdmin"
import { missingExplicitAdditions, matchesExplicitMilkVariant } from "@/foodResolution/composition"
import { FoodItemToLog } from "@/utils/loggedFoodItemInterface"
import { FoodItemWithNutrientsAndServing } from "@/app/dashboard/utils/FoodHelper"

export async function findExactLocalFood(food: FoodItemToLog): Promise<FoodItemWithNutrientsAndServing | null> {
  // Only bypass semantic matching for an unambiguous name AND brand match.
  const name = food.food_database_search_name.trim()
  if (!name || /[%_\\]/.test(name)) return null
  const { data, error } = await createAdminSupabase().from("FoodItem")
    .select("*, Nutrient(*), Serving(*)").ilike("name", name).limit(20)
  if (error) throw error
  if (data.length === 20) return null
  const brand = (food.brand ?? "").trim().toLowerCase()
  const matches = data.filter(item => (item.brand ?? "").trim().toLowerCase() === brand &&
    (!food.branded || brand.length > 0) && (item.defaultServingWeightGram ?? 0) > 0 && item.kcalPerServing !== null &&
    missingExplicitAdditions(food,item.name).length === 0 && matchesExplicitMilkVariant(food,item.name))
  return matches.length === 1 ? matches[0] as FoodItemWithNutrientsAndServing : null
}
