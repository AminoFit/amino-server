// Catalogue audit A7: regenerate food icons in the current style for the most recently and frequently logged
// foods, within an image budget. A new icon is reused for later foods that are near-duplicates of it.
// Old links are copied to CatalogueAuditBackup (audit A7_icon_link) and restored if a generation fails.
// Run with production credentials:
// npx ts-node -T -r tsconfig-paths/register scripts/regenerate-icons.ts <maxFoods> <maxGenerations> <progress.jsonl> [concurrency=6] [--ids=1,2]
import { appendFileSync, existsSync, readFileSync } from "fs"
import { createAdminSupabase } from "@/utils/supabase/serverAdmin"
import { getCachedOrFetchEmbeddings } from "@/utils/embeddingsCache/getCachedOrFetchEmbeddings"
import { generateAndUploadIcon } from "@/app/api/queues/generate-food-icon/generate-food-icon"

const REUSE_SIMILARITY = 0.9
const db = createAdminSupabase() as any

/** Each log counts less the older it is (half-life about eight months), so recent and popular foods rank first. */
async function rankedFoods(limit: number) {
  const score = new Map<number, number>(), now = Date.now()
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db.from("LoggedFoodItem").select("id,foodItemId,consumedOn").is("deletedAt", null)
      .not("foodItemId", "is", null).order("id").range(from, from + 999)
    if (error) throw error
    for (const row of data) {
      const ageDays = (now - Date.parse(row.consumedOn)) / 86400000
      score.set(row.foodItemId, (score.get(row.foodItemId) ?? 0) + Math.pow(0.5, Math.max(0, ageDays) / 240))
    }
    if (data.length < 1000) break
  }
  const ids = [...score.entries()].sort((a, b) => b[1] - a[1]).slice(0, limit).map(([id]) => id)
  const names = new Map<number, string>()
  for (let i = 0; i < ids.length; i += 200) {
    const { data, error } = await db.from("FoodItem").select("id,name").in("id", ids.slice(i, i + 200))
    if (error) throw error
    for (const row of data) names.set(row.id, row.name)
  }
  return ids.flatMap(id => names.has(id) ? [{ id, name: names.get(id)! }] : [])
}

const cosine = (a: number[], b: number[]) => {
  let dot = 0, na = 0, nb = 0
  for (let i = 0; i < a.length; i++) { dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i] }
  return dot / Math.sqrt(na * nb)
}

/** New icons of this batch, by the embedding of the food name they were drawn for. */
type BatchIcons = Map<number, number[]>

async function namesOf(ids: number[]) {
  const { data, error } = await db.from("FoodItem").select("id,name").in("id", ids)
  if (error) throw error
  return data as { id: number; name: string }[]
}

async function replaceIcon(food: { id: number; name: string }, batchImages: BatchIcons, budget: { left: number }) {
  const { data: oldLinks, error } = await db.from("FoodItemImages").select("*").eq("foodItemId", food.id)
  if (error) throw error
  const [vector] = await getCachedOrFetchEmbeddings("BGE_BASE", [food.name])
  // Compared with this batch's icons directly: the catalogue-wide top matches are dominated by old-style icons.
  const reuse = [...batchImages.entries()].map(([imageId, embedding]) => ({ food_image_id: imageId, cosine_similarity: cosine(vector.embedding, embedding) }))
    .filter(row => row.cosine_similarity >= REUSE_SIMILARITY).sort((a, b) => b.cosine_similarity - a.cosine_similarity)[0]
  if (!reuse && budget.left <= 0) return { id: food.id, status: "skipped_budget" }
  if (!reuse) budget.left--
  if (oldLinks.length) {
    const backup = await db.from("CatalogueAuditBackup").insert(oldLinks.map((row: any) =>
      ({ audit: "A7_icon_link", tableName: "FoodItemImages", rowId: row.id, before: row })))
    if (backup.error) throw backup.error
    const removed = await db.from("FoodItemImages").delete().eq("foodItemId", food.id)
    if (removed.error) throw removed.error
  }
  try {
    if (reuse) {
      const linked = await db.from("FoodItemImages").insert([{ foodItemId: food.id, foodImageId: reuse.food_image_id, similarity: reuse.cosine_similarity }])
      if (linked.error) throw linked.error
      return { id: food.id, name: food.name, status: "reused", imageId: reuse.food_image_id, similarity: Number(reuse.cosine_similarity.toFixed(3)) }
    }
    const imageId = await generateAndUploadIcon(food.name, food.id)
    batchImages.set(imageId, vector.embedding)
    return { id: food.id, name: food.name, status: "generated", imageId }
  } catch (failure) {
    // Never leave a food without its icon: put the old links back.
    if (oldLinks.length) await db.from("FoodItemImages").insert(oldLinks.map(({ id: _, ...row }: any) => row))
    return { id: food.id, name: food.name, status: "failed", error: failure instanceof Error ? failure.message.slice(0, 160) : "unknown" }
  }
}

void (async () => {
  const [maxFoods, maxGenerations, progressPath] = [Number(process.argv[2] ?? 1000), Number(process.argv[3] ?? 0), process.argv[4]]
  if (!progressPath || !(maxGenerations > 0)) throw new Error("usage: regenerate-icons.ts <maxFoods> <maxGenerations> <progress.jsonl>")
  const done = existsSync(progressPath) ? readFileSync(progressPath, "utf8").trim().split("\n").filter(Boolean).map(line => JSON.parse(line)) : []
  const finished = new Set(done.filter(row => row.status !== "failed").map(row => row.id))
  const batchImages: BatchIcons = new Map()
  for (const row of done.filter(row => row.status === "generated"))
    batchImages.set(row.imageId, (await getCachedOrFetchEmbeddings("BGE_BASE", [row.name]))[0].embedding)
  const budget = { left: maxGenerations - done.filter(row => row.status === "generated").length }
  // Console noise from the icon helper stays out of the progress output.
  const log = console.log; console.log = () => {}
  // --ids=1,2 targets specific foods (for example newly estimated ones) instead of the popularity ranking.
  const ids = (process.argv.find(arg => arg.startsWith("--ids="))?.slice(6) ?? "").split(",").filter(Boolean).map(Number)
  const chosen = ids.length ? await namesOf(ids) : await rankedFoods(maxFoods)
  const queue = chosen.filter(food => !finished.has(food.id))
  log(`${queue.length} foods to process, ${budget.left} generations left`)
  // The image API rate-limits bursts; lower concurrency when many requests come back 429.
  await Promise.all(Array.from({ length: Number(/^\d+$/.test(process.argv[5] ?? "") ? process.argv[5] : 6) }, async () => {
    for (let food = queue.shift(); food; food = queue.shift()) {
      const row = await replaceIcon(food, batchImages, budget).catch(failure => ({ id: food!.id, name: food!.name, status: "failed",
        error: failure instanceof Error ? failure.message.slice(0, 160) : "unknown" }))
      appendFileSync(progressPath, JSON.stringify(row) + "\n")
      if (row.status === "skipped_budget") { queue.length = 0; break }
    }
  }))
  const rows = readFileSync(progressPath, "utf8").trim().split("\n").map(line => JSON.parse(line))
  const count = (status: string) => rows.filter(row => row.status === status).length
  log(`generated ${count("generated")}, reused ${count("reused")}, failed ${count("failed")}, skipped ${count("skipped_budget")}`)
})()
