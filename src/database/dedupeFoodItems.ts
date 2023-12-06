import { createClient } from "@supabase/supabase-js"

// Initialize Supabase client
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || "",
  process.env.SUPABASE_SERVICE_ROLE_KEY || ""
)

// Type for holding duplicate information
type DuplicateInfo = {
  keepFoodItemId: number
  removeFoodItemId: number
}

// Function to calculate Levenshtein distance between two strings
function calculateLevenshteinDistance(a: string, b: string): number {
  // Early return for empty strings
  if (a.length === 0) return b.length
  if (b.length === 0) return a.length

  const matrix = []

  // Initialize matrix
  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i]
  }
  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j
  }

  // Compute distances
  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1]
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1, // Substitution
          matrix[i][j - 1] + 1, // Insertion
          matrix[i - 1][j] + 1 // Deletion
        )
      }
    }
  }

  return matrix[b.length][a.length]
}

// Function to find potential duplicate items by comparing names
async function findPotentialDuplicatesByName(): Promise<DuplicateInfo[]> {
  const { data: foodItems, error } = await supabaseAdmin.from("FoodItem").select("id, name, brand")

  if (error) {
    console.error("Error fetching FoodItems:", error)
    return []
  }

  let potentialDuplicates = []

  for (let i = 0; i < foodItems.length; i++) {
    for (let j = i + 1; j < foodItems.length; j++) {
      const itemA = foodItems[i]
      const itemB = foodItems[j]

      // Compare names and brands case-insensitively
      if (
        itemA.name.toLowerCase() === itemB.name.toLowerCase() &&
        itemA.brand?.toLowerCase() === itemB.brand?.toLowerCase()
      ) {
        potentialDuplicates.push({
          keepFoodItemId: Math.min(itemA.id, itemB.id),
          removeFoodItemId: Math.max(itemA.id, itemB.id),
          nameA: itemA.name,
          nameB: itemB.name,
          reason: "Exact match"
        })
      } else if (
        calculateLevenshteinDistance(itemA.name.toLowerCase(), itemB.name.toLowerCase()) <= 1 &&
        itemA.brand?.toLowerCase() === itemB.brand?.toLowerCase()
      ) {
        potentialDuplicates.push({
          keepFoodItemId: Math.min(itemA.id, itemB.id),
          removeFoodItemId: Math.max(itemA.id, itemB.id),
          nameA: itemA.name,
          nameB: itemB.name,
          reason: "Very similar name"
        })
      }
    }
  }

  return potentialDuplicates
}

// Function to clean and delete duplicate items
async function cleanDeleteItems(duplicates: DuplicateInfo[]) {
  const removedIds = []
  const results = []

  for (const duplicate of duplicates) {
    const { keepFoodItemId, removeFoodItemId } = duplicate
    console.log(`Processing duplicate with ID ${removeFoodItemId}`)

    let deleteCount = 0 // Track number of deletions

    // Delete FoodItemImages for the removed item
    let { error: errorFoodItemImages, count: countFoodItemImages } = await supabaseAdmin
      .from("FoodItemImages")
      .delete()
      .eq("foodItemId", removeFoodItemId)
    if (errorFoodItemImages) throw errorFoodItemImages
    deleteCount += countFoodItemImages || 0

    // Update LoggedFoodItem to point to the kept item
    let { error: errorLoggedFoodItem, count: countLoggedFoodItem } = await supabaseAdmin
      .from("LoggedFoodItem")
      .update({ foodItemId: keepFoodItemId })
      .eq("foodItemId", removeFoodItemId)
    if (errorLoggedFoodItem) throw errorLoggedFoodItem

    // Delete Servings for the removed item
    let { error: errorServing, count: countServing } = await supabaseAdmin
      .from("Serving")
      .delete()
      .eq("foodItemId", removeFoodItemId)
    if (errorServing) throw errorServing
    deleteCount += countServing || 0

    // Delete Nutrients for the removed item
    let { error: errorNutrient, count: countNutrient } = await supabaseAdmin
      .from("Nutrient")
      .delete()
      .eq("foodItemId", removeFoodItemId)
    if (errorNutrient) throw errorNutrient
    deleteCount += countNutrient || 0

    // Finally, delete the FoodItem itself
    let { error: errorFoodItem, count: countFoodItem } = await supabaseAdmin
      .from("FoodItem")
      .delete()
      .eq("id", removeFoodItemId)
    if (errorFoodItem) throw errorFoodItem
    deleteCount += countFoodItem || 0

    removedIds.push(removeFoodItemId)
    results.push({
      removeFoodItemId,
      deleteCount,
      updatedRows: countLoggedFoodItem
    })
  }

  return { removedIds, results }
}

// Example usage
function runDedupe() {
  findPotentialDuplicatesByName()
    .then((duplicates) => {
      console.log("duplicates", duplicates)
      const identifiedDuplicates: DuplicateInfo[] = duplicates.map((duplicate) => {
        return {
          keepFoodItemId: duplicate.keepFoodItemId,
          removeFoodItemId: duplicate.removeFoodItemId
        }
      })

      // Call prepareForDeletion() with the duplicates array
      cleanDeleteItems(identifiedDuplicates)
        .then((removedIds) => console.log("Items removed:", removedIds))
        .catch((error) => console.error("Error preparing for deletion:", error))
    })
    .catch((error) => console.error("Error finding duplicates:", error))
}
