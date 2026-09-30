import { adminDb, must } from "./db"

/** The icon the app shows for each food: fewest downvotes, then the newest image. One query for all IDs. */
export async function foodIcons(foodIds: number[]): Promise<Map<number, string>> {
  const ids = [...new Set(foodIds.filter(Boolean))]
  if (!ids.length) return new Map()
  const rows = must("FoodItemImages", await adminDb().from("FoodItemImages").select("foodItemId,FoodImage(id,pathToImage,downvotes)")
    .in("foodItemId", ids)) as unknown as { foodItemId: number; FoodImage: { id: number; pathToImage: string; downvotes: number } | null }[]
  const best = new Map<number, { id: number; pathToImage: string; downvotes: number }>()
  for (const row of rows) {
    const image = row.FoodImage, current = best.get(row.foodItemId)
    if (image && (!current || image.downvotes < current.downvotes || image.downvotes === current.downvotes && image.id > current.id))
      best.set(row.foodItemId, image)
  }
  return new Map([...best].map(([id, image]) => [id, image.pathToImage]))
}

export const SOURCE_OPTIONS: [string, string][] = [["", "Any source"], ["AgentEstimate", "Agent estimate"], ["Label", "Label"],
  ["USDA", "USDA"], ["Online", "Online"], ["User", "User"], ["GPT4", "GPT-4"], ["GPT3", "GPT-3"], ["NUTRITIONIX", "Nutritionix"],
  ["FATSECRET", "FatSecret"], ["LLAMA", "Llama"], ["LLAMA2", "Llama 2"]]
