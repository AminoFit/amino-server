// Icon link audit: the icons foods show were mostly chosen before Jev looked at pictures (712a789, 2026-10-15), by name
// alone ("flat white" shows an egg white, "Blueberries, Raw" a jam). Each food's shown icon gets Jev 1.14's strict picture
// check (iconPictureCheckTask, yes at 0.8 as in the icon job). A rejected icon is replaced by an existing current-style
// icon Jev picks at 0.9 from the food's shortlist, else a new drawing. Foods showing an old-style icon (before image
// 13302) get the same replacement without a check: old styles are never kept. Icons drawn for the food itself are left
// for the drawing QA. Wrong links are edited in place, without a backup.
// Most-logged foods first. Three steps, so the paid ones are quoted and the writes reviewed:
//   count                          sizes the audit (no model calls)
//   check <maxFoods> <out.jsonl>   Jev checks and picks, written to out.jsonl only (resumable; --all goes past logged foods)
//   apply <out.jsonl> [--max-redraws=N]   relinks, draws and bumps lastUpdated (resumable; writes <out>.applied.jsonl)
// npm run run:ts-node-prod -- -T scripts/audit-icon-links.ts <step> ...
import { appendFileSync, existsSync, readFileSync } from "fs"
import { createAdminSupabase } from "@/utils/supabase/serverAdmin"
import { getCachedOrFetchEmbeddings } from "@/utils/embeddingsCache/getCachedOrFetchEmbeddings"
import { selectWithJev, type ImagePart } from "@/ai/jev"
import { IMAGE_DECISION_MODEL } from "@/ai/models"
import { generateAndUploadIcon } from "@/app/api/queues/generate-food-icon/generate-food-icon"
import { iconDecisionTask, iconPictureCheckTask, MIN_CANDIDATE_SIMILARITY, PICTURE_CHECK_CONFIDENCE, REUSE_CONFIDENCE }
  from "@/app/api/queues/generate-food-icon/chooseFoodIcon"
import { iconPictures } from "@/app/api/queues/generate-food-icon/iconPictures"
import { isCurrentStyle } from "@/app/api/queues/generate-food-icon/iconStyle"

/** Links made after this went through the picture path (712a789). */
const PICTURE_PATH_FROM = "2026-10-15T22:13:11Z"
const db = createAdminSupabase() as any

type Image = { id: number; pathToImage: string | null; downvotes: number; imageDescription: string | null }
type Link = { id: number; foodImageId: number; createdAt: string; FoodImage: Image | null }
type Food = { id: number; name: string; brand: string | null; foodItemCategoryName: string | null
  FoodItemImages: Link[]; Serving: { servingName: string | null }[] }
type Verdict = { id: number; name: string; logs: number; status: string; linkId?: number; before?: Image
  check?: { choice?: string; confidence?: number }; after?: { imageId: number; url: string | null; description: string | null
    confidence: number }; promptTokens: number; costUsd: number; error?: string }

/** The app's choice (GetBestFoodImage): fewest downvotes, then the newest image. */
const shown = (food: Food) => food.FoodItemImages.filter(link => link.FoodImage)
  .sort((a, b) => a.FoodImage!.downvotes - b.FoodImage!.downvotes || b.foodImageId - a.foodImageId)[0]
const same = (a: string | null, b: string) => (a ?? "").trim().toLowerCase() === b.trim().toLowerCase()

/** What the audit does with a food, before any model call. */
function plan(food: Food) {
  const link = shown(food)
  if (!link) return { kind: "no_icon" as const }
  if (!isCurrentStyle(link.foodImageId)) return { kind: "old_style" as const, link }
  if (same(link.FoodImage!.imageDescription, food.name)) return { kind: "drawn_for_it" as const, link }
  if (link.createdAt >= PICTURE_PATH_FROM) return { kind: "picture_path" as const, link }
  return { kind: "check" as const, link }
}

async function pageAll<T>(query: (from: number) => PromiseLike<{ data: T[] | null; error: unknown }>) {
  const rows: T[] = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await query(from)
    if (error) throw error
    rows.push(...data!)
    if (data!.length < 1000) return rows
  }
}

/** Foods with icons by log count, most-logged first; with all, the never-logged ones follow by id. */
async function rankedFoodIds(all: boolean) {
  const logs = new Map<number, number>()
  for (const row of await pageAll<{ foodItemId: number }>(from => db.from("LoggedFoodItem").select("foodItemId")
    .is("deletedAt", null).not("foodItemId", "is", null).order("id").range(from, from + 999)))
    logs.set(row.foodItemId, (logs.get(row.foodItemId) ?? 0) + 1)
  const ranked = [...logs.entries()].sort((a, b) => b[1] - a[1]).map(([id, count]) => ({ id, logs: count }))
  if (!all) return ranked
  const linked = await pageAll<{ foodItemId: number }>(from => db.from("FoodItemImages").select("foodItemId")
    .order("foodItemId").range(from, from + 999))
  const rest = [...new Set(linked.map(row => row.foodItemId))].filter(id => !logs.has(id)).map(id => ({ id, logs: 0 }))
  return [...ranked, ...rest]
}

async function foodsByIds(ids: number[]) {
  const foods = new Map<number, Food>()
  for (let i = 0; i < ids.length; i += 100) {
    const { data, error } = await db.from("FoodItem").select("id,name,brand,foodItemCategoryName," +
      "FoodItemImages(id,foodImageId,createdAt,FoodImage(id,pathToImage,downvotes,imageDescription)),Serving(servingName)")
      .in("id", ids.slice(i, i + 100)).limit(1, { foreignTable: "Serving" })
    if (error) throw error
    for (const food of data as Food[]) foods.set(food.id, food)
  }
  return foods
}

const iconFood = (food: Food) => ({ name: food.name, brand: food.brand, category: food.foodItemCategoryName,
  servingUnit: food.Serving?.[0]?.servingName ?? null })
const jev = (task: Parameters<typeof selectWithJev>[0]) =>
  selectWithJev(task, AbortSignal.timeout(30000), { timeoutMs: 25000, model: IMAGE_DECISION_MODEL })

/** Jev's pick among the food's current-style shortlist, other than the rejected icon, at REUSE_CONFIDENCE. */
async function replacement(food: Food, rejected: number, spent: { promptTokens: number; costUsd: number }) {
  const embeddingId = (await getCachedOrFetchEmbeddings("BGE_BASE", [food.name]))[0].id
  const { data: candidates, error } = await db.rpc("food_icon_candidates", { p_embedding_cache_id: embeddingId, p_limit: 16 })
  if (error) throw error
  const shortlist = (candidates as { food_image_id: number; image_description: string; cosine_similarity: number }[])
    .filter(row => isCurrentStyle(row.food_image_id) && row.food_image_id !== rejected
      && row.cosine_similarity >= MIN_CANDIDATE_SIMILARITY).slice(0, 8)
  if (!shortlist.length) return null
  const { data: images, error: imagesError } = await db.from("FoodImage").select("id,pathToImage,imageDescription")
    .in("id", shortlist.map(row => row.food_image_id))
  if (imagesError) throw imagesError
  const pictures = await iconPictures((images as Image[]).map(image => ({ id: image.id, url: image.pathToImage })),
    AbortSignal.timeout(20000))
  const pictured = shortlist.flatMap(row => pictures.has(row.food_image_id) ? [{ id: row.food_image_id,
    description: row.image_description, similarity: row.cosine_similarity, picture: pictures.get(row.food_image_id) }] : [])
  if (!pictured.length) throw new Error("no shortlist pictures")
  const result = await jev(iconDecisionTask(iconFood(food), pictured))
  spent.promptTokens += result.promptTokens; spent.costUsd += result.costUsd ?? 0
  if (result.status !== "ok") throw new Error(`jev ${result.status}`)
  const picked = pictured.find(candidate => `icon_${candidate.id}` === result.choice)
  if (!picked || (result.confidence ?? 0) < REUSE_CONFIDENCE) return null
  const image = (images as Image[]).find(row => row.id === picked.id)!
  return { imageId: picked.id, url: image.pathToImage, description: image.imageDescription, confidence: result.confidence! }
}

async function checkFood(food: Food, logs: number): Promise<Verdict> {
  const decided = plan(food)
  const spent = { promptTokens: 0, costUsd: 0 }
  const base = { id: food.id, name: food.name, logs, ...spent }
  if (decided.kind !== "check" && decided.kind !== "old_style") return { ...base, status: decided.kind }
  const link = decided.link, before = link.FoodImage!
  const verdict: Verdict = { ...base, linkId: link.id, before, status: "" }
  if (decided.kind === "check") {
    const picture = (await iconPictures([{ id: before.id, url: before.pathToImage }], AbortSignal.timeout(20000))).get(before.id)
    if (!picture) return { ...verdict, status: "error", error: "icon picture unreadable" }
    const check = await jev(iconPictureCheckTask(iconFood(food),
      { id: before.id, description: before.imageDescription ?? "", similarity: 1, picture: picture as ImagePart }))
    spent.promptTokens += check.promptTokens; spent.costUsd += check.costUsd ?? 0
    if (check.status !== "ok") return { ...verdict, ...spent, status: "error", error: `jev ${check.status}` }
    verdict.check = { choice: check.choice, confidence: check.confidence }
    if (check.choice === "yes" && (check.confidence ?? 0) >= PICTURE_CHECK_CONFIDENCE) return { ...verdict, ...spent, status: "kept" }
  }
  const after = await replacement(food, before.id, spent)
  return { ...verdict, ...spent, status: after ? "relink" : "redraw", after: after ?? undefined }
}

const readRows = (path: string): Verdict[] => existsSync(path)
  ? readFileSync(path, "utf8").trim().split("\n").filter(Boolean).map(line => JSON.parse(line)) : []
const tally = (rows: { status: string }[]) => rows.reduce<Record<string, number>>((counts, row) =>
  ({ ...counts, [row.status]: (counts[row.status] ?? 0) + 1 }), {})

async function count(all: boolean) {
  const ranked = await rankedFoodIds(all)
  const foods = await foodsByIds(ranked.map(row => row.id))
  const kinds = ranked.map(row => foods.get(row.id)).filter(Boolean).map(food => plan(food!).kind)
  const top = (n: number) => tally(kinds.slice(0, n).map(status => ({ status })))
  console.log(JSON.stringify({ foods: kinds.length, all: tally(kinds.map(status => ({ status }))),
    top100: top(100), top1000: top(1000) }, null, 1))
}

async function check(maxFoods: number, out: string, all: boolean, concurrency: number) {
  const done = new Set(readRows(out).filter(row => row.status !== "error").map(row => row.id))
  const ranked = (await rankedFoodIds(all)).slice(0, maxFoods).filter(row => !done.has(row.id))
  const foods = await foodsByIds(ranked.map(row => row.id))
  const queue = ranked.filter(row => foods.has(row.id))
  console.log(`${queue.length} foods to check`)
  await Promise.all(Array.from({ length: concurrency }, async () => {
    for (let next = queue.shift(); next; next = queue.shift()) {
      const food = foods.get(next.id)!
      const row = await checkFood(food, next.logs).catch(failure => ({ id: food.id, name: food.name, logs: next!.logs,
        status: "error", promptTokens: 0, costUsd: 0, error: failure instanceof Error ? failure.message.slice(0, 160) : "unknown" }))
      appendFileSync(out, JSON.stringify(row) + "\n")
    }
  }))
  const rows = readRows(out)
  console.log(JSON.stringify({ ...tally(rows), promptTokens: rows.reduce((sum, row) => sum + row.promptTokens, 0),
    costUsd: Number(rows.reduce((sum, row) => sum + row.costUsd, 0).toFixed(4)) }))
}

/** Makes the food show only its new icon: the shown link points at the reused image (or is replaced by the drawing),
 * and its hidden links go, so none can resurface. The app syncs foods by lastUpdated. */
async function applyRow(row: Verdict) {
  const [food] = [...(await foodsByIds([row.id])).values()]
  if (!food || shown(food)?.id !== row.linkId) return { id: row.id, name: row.name, status: "skipped_changed" }
  let imageId: number
  if (row.status === "relink") {
    imageId = row.after!.imageId
    const updated = await db.from("FoodItemImages").update({ foodImageId: imageId, similarity: null }).eq("id", row.linkId)
    if (updated.error) throw updated.error
  } else {
    // Drawn from the food's name, as the icon job does; generateAndUploadIcon links it.
    imageId = await generateAndUploadIcon(food.name, food.id)
  }
  const stale = food.FoodItemImages.filter(link => row.status === "redraw" || link.id !== row.linkId).map(link => link.id)
  if (stale.length) {
    const removed = await db.from("FoodItemImages").delete().in("id", stale)
    if (removed.error) throw removed.error
  }
  const bumped = await db.from("FoodItem").update({ lastUpdated: new Date().toISOString() }).eq("id", food.id)
  if (bumped.error) throw bumped.error
  return { id: row.id, name: row.name, status: row.status === "relink" ? "relinked" : "redrawn", imageId,
    beforeImageId: row.before!.id }
}

async function apply(input: string, maxRedraws: number) {
  const out = input.replace(/\.jsonl$/, "") + ".applied.jsonl"
  const applied = readRows(out)
  const done = new Set(applied.filter(row => !row.status.startsWith("failed")).map(row => row.id))
  let redraws = maxRedraws - applied.filter(row => row.status === "redrawn").length
  const todo = readRows(input).filter(row => (row.status === "relink" || row.status === "redraw") && !done.has(row.id))
  const log = console.log; console.log = () => {} // the icon helper's noise
  for (const row of todo) {
    if (row.status === "redraw" && redraws <= 0) continue
    const result = await applyRow(row).catch(failure => ({ id: row.id, name: row.name, status: "failed",
      error: failure instanceof Error ? failure.message.slice(0, 160) : "unknown" }))
    if (result.status === "redrawn") redraws--
    appendFileSync(out, JSON.stringify(result) + "\n")
  }
  console.log = log
  console.log(JSON.stringify(tally(readRows(out))))
}

void (async () => {
  const [step, a, b] = process.argv.slice(2)
  const flag = (name: string) => process.argv.find(arg => arg.startsWith(`--${name}`))
  const all = Boolean(flag("all"))
  if (step === "count") return count(all)
  if (step === "check" && Number(a) > 0 && b)
    return check(Number(a), b, all, Number(flag("concurrency=")?.split("=")[1] ?? 6))
  if (step === "apply" && a) return apply(a, Number(flag("max-redraws=")?.split("=")[1] ?? 0))
  throw new Error("usage: audit-icon-links.ts count [--all] | check <maxFoods> <out.jsonl> [--all] [--concurrency=6] | " +
    "apply <out.jsonl> [--max-redraws=N]")
})().catch(error => { console.error(error); process.exit(1) })
