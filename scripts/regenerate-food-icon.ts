// Draws a new icon for a food whose icon is wrong (food 1329 "dried mango" showed dried beef): its current icon links
// are backed up and removed, then the icon job draws, uploads and links a new one. The old images stay in the
// library for other foods.
// Usage: DOTENV_CONFIG_PATH=<path to .env.prod> npx ts-node -r dotenv/config -r tsconfig-paths/register -P tsconfig.json \
//   scripts/regenerate-food-icon.ts <foodId> ["name to draw"]
import { createClient } from "@supabase/supabase-js"
import { SupabaseServiceKey, SupabaseURL } from "@/utils/auth-keys"
import { generateAndUploadIcon } from "@/app/api/queues/generate-food-icon/generate-food-icon"

async function main() {
  const foodId = Number(process.argv[2])
  if (!Number.isInteger(foodId) || foodId <= 0) throw new Error("Usage: regenerate-food-icon.ts <foodId> [name]")
  const db = createClient(SupabaseURL, SupabaseServiceKey, { auth: { autoRefreshToken: false, persistSession: false } })
  const food = await db.from("FoodItem").select("id,name").eq("id", foodId).single()
  if (food.error || !food.data) throw food.error ?? new Error("No such food")
  const name = process.argv[3]?.trim() || food.data.name
  const links = await db.from("FoodItemImages").select("*").eq("foodItemId", foodId)
  if (links.error) throw links.error
  if (links.data.length) {
    const backup = await db.from("CatalogueAuditBackup").insert(links.data.map(row =>
      ({ audit: "regenerate_icon", tableName: "FoodItemImages", rowId: row.id, before: row })))
    if (backup.error) throw backup.error
    const removed = await db.from("FoodItemImages").delete().eq("foodItemId", foodId)
    if (removed.error) throw removed.error
  }
  const imageId = await generateAndUploadIcon(name, foodId)
  console.log(JSON.stringify({ foodId, name, removedLinks: links.data.length, newImageId: imageId }))
}

main().catch(error => { console.error(error); process.exit(1) })
