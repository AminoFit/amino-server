import { createAdminSupabase } from "@/utils/supabase/serverAdmin"

const supabaseAdmin = createAdminSupabase()

function vectorsAreSimilar(v1: number[], v2: number[], tolerance = 0.0001): boolean {
  for (let i = 0; i < v1.length; i++) {
    if (Math.abs(v1[i] - v2[i]) > tolerance) {
      return false
    }
  }
  return true
}

async function getLoggedFoodItemCount(foodItemId: number) {
  const { data, error } = await supabaseAdmin
    .from("LoggedFoodItem")
    .select("id", { count: 'exact' })
    .eq("foodItemId", foodItemId)

  if (error) {
    console.error(`Error fetching logged food items for foodItemId ${foodItemId}:`, error)
    return 0
  }

  return data.length
}

async function findDuplicateFoodItems() {
  // Fetch all food items
  const { data: foodItems, error: foodItemsError } = await supabaseAdmin
    .from("FoodItem")
    .select("id, name, brand, defaultServingWeightGram, kcalPerServing, totalFatPerServing, carbPerServing, proteinPerServing")

  if (foodItemsError) {
    console.error("Error fetching food items:", foodItemsError)
    return
  }

  if (!foodItems) {
    console.log("No food items found.")
    return
  }

  const duplicates: { [key: string]: any[] } = {}
  const processedPairs: Set<string> = new Set()

  for (let i = 0; i < foodItems.length; i++) {
    for (let j = i + 1; j < foodItems.length; j++) {
      const vector1 = [
        Number(foodItems[i].defaultServingWeightGram),
        Number(foodItems[i].kcalPerServing),
        Number(foodItems[i].totalFatPerServing),
        Number(foodItems[i].carbPerServing),
        Number(foodItems[i].proteinPerServing)
      ].map(v => (v ? v : 0))

      const vector2 = [
        Number(foodItems[j].defaultServingWeightGram),
        Number(foodItems[j].kcalPerServing),
        Number(foodItems[j].totalFatPerServing),
        Number(foodItems[j].carbPerServing),
        Number(foodItems[j].proteinPerServing)
      ].map(v => (v ? v : 0))

      if (vectorsAreSimilar(vector1, vector2)) {
        const key1 = `${foodItems[i].id},${foodItems[j].id}`
        const key2 = `${foodItems[j].id},${foodItems[i].id}`
        if (!processedPairs.has(key1) && !processedPairs.has(key2)) {
          const vectorKey = vector1.join(',')
          if (!duplicates[vectorKey]) {
            duplicates[vectorKey] = []
          }
          duplicates[vectorKey].push(foodItems[i])
          duplicates[vectorKey].push(foodItems[j])
          processedPairs.add(key1)
          processedPairs.add(key2)
        }
      }
    }
  }

  if (Object.keys(duplicates).length === 0) {
    console.log("No duplicate food items found.")
  } else {
    console.log("Duplicate food items found:")

    const uniqueDuplicates = Array.from(
      new Set(Object.values(duplicates).flat().map(item => item.id))
    ).map(id => ({
      ...Object.values(duplicates).flat().find(item => item.id === id),
      loggedCount: 0
    }))

    const counts = await Promise.all(
      uniqueDuplicates.map(item => getLoggedFoodItemCount(item.id))
    )

    uniqueDuplicates.forEach((item, index) => {
      item.loggedCount = counts[index]
    })

    for (const key in duplicates) {
      const items = Array.from(
        new Set(duplicates[key].map(item => item.id))
      ).map(id => uniqueDuplicates.find(item => item.id === id))

      if (items.length > 1) {
        console.log("----")
        items.forEach(item => {
          console.log(`ID: ${item.id}, Name: ${item.name}, Brand: ${item.brand ? item.brand : 'N/A'}, Logged: ${item.loggedCount}`)
        })
      }
    }
  }
}

findDuplicateFoodItems()
