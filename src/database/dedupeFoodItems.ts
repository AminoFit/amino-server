import { createClient } from "@supabase/supabase-js"

// Initialize Supabase client
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || "",
  process.env.SUPABASE_SERVICE_ROLE_KEY || ""
)

// Function to normalize nutritional data
function normalizeVector(vector: number[]): number[] {
  const magnitude = Math.sqrt(vector.reduce((sum, val) => sum + val * val, 0))
  return vector.map((val) => val / magnitude)
}

// Function to calculate cosine similarity between two vectors
function cosineSimilarity(vecA: number[], vecB: number[]): number {
  const dotProduct = vecA.reduce((sum, val, idx) => sum + val * vecB[idx], 0)
  const magnitudeA = Math.sqrt(vecA.reduce((sum, val) => sum + val * val, 0))
  const magnitudeB = Math.sqrt(vecB.reduce((sum, val) => sum + val * val, 0))
  return dotProduct / (magnitudeA * magnitudeB)
}

// Function to calculate Levenshtein distance
function levenshteinDistance(a: string, b: string): number {
  if (a.length === 0) return b.length
  if (b.length === 0) return a.length

  const matrix = []

  // Increment along the first column of each row
  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i]
  }

  // Increment each column in the first row
  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j
  }

  // Fill in the rest of the matrix
  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1]
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1, // substitution
          Math.min(
            matrix[i][j - 1] + 1, // insertion
            matrix[i - 1][j] + 1
          )
        ) // deletion
      }
    }
  }

  return matrix[b.length][a.length]
}

function isSignificantlyDifferent(a: string, b: string): boolean {
  // Implement logic to determine if two names are significantly different
  // For instance, check if the Levenshtein distance is greater than a certain threshold
  // relative to the length of the strings
  const len = Math.max(a.length, b.length)
  const distance = levenshteinDistance(a.toLowerCase(), b.toLowerCase())
  return distance > Math.floor(len / 3) // Adjust this threshold as necessary
}

async function findPotentialDuplicates() {
  const { data: foodItems, error } = await supabaseAdmin
    .from("FoodItem")
    .select("id, name, brand, kcalPerServing, proteinPerServing, carbPerServing, totalFatPerServing, fiberPerServing")

  if (error) {
    console.error("Error fetching FoodItems:", error)
    return []
  }

  let potentialDuplicates = []

  for (let i = 0; i < foodItems.length; i++) {
    for (let j = i + 1; j < foodItems.length; j++) {
      const itemA = foodItems[i]
      const itemB = foodItems[j]

      if (itemA.id < itemB.id) {
        const vectorA = normalizeVector([
          itemA.kcalPerServing,
          itemA.proteinPerServing,
          itemA.carbPerServing,
          itemA.totalFatPerServing,
          itemA.fiberPerServing
        ])
        const vectorB = normalizeVector([
          itemB.kcalPerServing,
          itemB.proteinPerServing,
          itemB.carbPerServing,
          itemB.totalFatPerServing,
          itemB.fiberPerServing
        ])
        const similarity = cosineSimilarity(vectorA, vectorB)

        if (similarity > 0.99999) {
          if (!isSignificantlyDifferent(itemA.name, itemB.name)) {
            const levDist = levenshteinDistance(itemA.name.toLowerCase(), itemB.name.toLowerCase())

            if (levDist <= 1 || (itemA.name.length > itemB.name.length && levDist <= itemA.name.length)) {
              potentialDuplicates.push({
                keep: itemA.id,
                remove: itemB.id,
                nameA: itemA.name,
                nameB: itemB.name,
                reason: "Similar nutritional profile and name"
              })
            } else if (itemA.name.length !== itemB.name.length && levDist > 1) {
              potentialDuplicates.push({
                keep: itemA.name.length > itemB.name.length ? itemA.id : itemB.id,
                remove: itemA.name.length > itemB.name.length ? itemB.id : itemA.id,
                nameA: itemA.name,
                nameB: itemB.name,
                reason: "More descriptive name"
              })
            }
          }
        }
      }
    }
  }

  return potentialDuplicates
}

// Type for duplicate information
type DuplicateInfo = {
  keep: number
  remove: number
}

async function cleanDeleteItems(duplicates: DuplicateInfo[]) {
    const removedIds = [];
  
    for (const duplicate of duplicates) {
      const { keep, remove } = duplicate;
      console.log(`Processing duplicate with ID ${remove}`);
  
      try {
        // Delete FoodItemImages for the removed item
        let { error: errorFoodItemImages } = await supabaseAdmin
          .from("FoodItemImages")
          .delete()
          .eq("foodItemId", remove);
        if (errorFoodItemImages) throw errorFoodItemImages;
  
        // Update LoggedFoodItem to point to the kept item
        let { error: errorLoggedFoodItem } = await supabaseAdmin
          .from("LoggedFoodItem")
          .update({ foodItemId: keep })
          .eq("foodItemId", remove);
        if (errorLoggedFoodItem) throw errorLoggedFoodItem;
  
        // Delete Servings for the removed item
        let { error: errorServing } = await supabaseAdmin
          .from("Serving")
          .delete()
          .eq("foodItemId", remove);
        if (errorServing) throw errorServing;
  
        // Delete Nutrients for the removed item
        let { error: errorNutrient } = await supabaseAdmin
          .from("Nutrient")
          .delete()
          .eq("foodItemId", remove);
        if (errorNutrient) throw errorNutrient;
  
        // Finally, delete the FoodItem itself
        let { error: errorFoodItem } = await supabaseAdmin
          .from("FoodItem")
          .delete()
          .eq("id", remove);
        if (errorFoodItem) throw errorFoodItem;
  
        removedIds.push(remove);
      } catch (error) {
        console.error(`Error processing duplicate with ID ${remove}:`, error);
      }
    }
  
    return removedIds;
  }

async function findPotentialDuplicatesByName() {
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

      // Compare names case-insensitively and consider brands
      if (
        itemA.name.toLowerCase() === itemB.name.toLowerCase() &&
        itemA.brand?.toLowerCase() === itemB.brand?.toLowerCase()
      ) {
        potentialDuplicates.push({
          keep: Math.min(itemA.id, itemB.id),
          remove: Math.max(itemA.id, itemB.id),
          nameA: itemA.name,
          nameB: itemB.name,
          reason: "Exact match"
        })
      } else if (
        levenshteinDistance(itemA.name.toLowerCase(), itemB.name.toLowerCase()) <= 1 &&
        itemA.brand?.toLowerCase() === itemB.brand?.toLowerCase()
      ) {
        potentialDuplicates.push({
          keep: Math.min(itemA.id, itemB.id),
          remove: Math.max(itemA.id, itemB.id),
          nameA: itemA.name,
          nameB: itemB.name,
          reason: "Very similar name"
        })
      }
    }
  }

  return potentialDuplicates
}

// Example usage
findPotentialDuplicatesByName()
  .then((duplicates) => {
    console.log("duplicates", duplicates)
    const identifiedDuplicates: DuplicateInfo[] = duplicates.map((duplicate) => {
      return {
        keep: duplicate.keep,
        remove: duplicate.remove
      }
    })

    // Call prepareForDeletion() with the duplicates array
      cleanDeleteItems(identifiedDuplicates)
          .then((removedIds) => console.log("Items removed:", removedIds))
          .catch((error) => console.error("Error preparing for deletion:", error));
  })
  .catch((error) => console.error("Error finding duplicates:", error))

// Example usage
function runRemoveJob() {
  findPotentialDuplicates()
    .then((duplicates) => {
      const identifiedDuplicates: DuplicateInfo[] = duplicates.map((duplicate) => {
        return {
          keep: duplicate.keep,
          remove: duplicate.remove
        }
      })

      // Call prepareForDeletion() with the duplicates array
      cleanDeleteItems(identifiedDuplicates)
        .then((removedIds) => console.log("Items removed:", removedIds))
        .catch((error) => console.error("Error preparing for deletion:", error))
    })
    .catch((error) => console.error("Error finding duplicates:", error))
}
