// Catalogue audit A2: foods the retired gpt-4o pipeline created from model estimates (foodInfoSource GPT4) are
// checked most-logged first. An estimate is replaced only on two independent signals: its energy density is an
// outlier (> 35%) against similar trusted catalogue foods, and a USDA record Jev matches by name (>= 0.7; the
// nutrients are what is in doubt) agrees with those foods (within 20%). A single USDA name match is not enough:
// "Apples" can be a dried-apple product. Outliers without an agreeing record are flagged for review.
// Replaced nutrients are rescaled to the food's own serving weight, provenance becomes USDA, and the old row goes to
// CatalogueAuditBackup (A2_supersede) and FoodItemConflict. Past logs are left as logged.
// Run: npx ts-node -T -r tsconfig-paths/register scripts/audit-gpt4-foods.ts <limit> <report.jsonl> [--apply]
import { appendFileSync, existsSync, readFileSync } from "fs"
import { createAdminSupabase } from "@/utils/supabase/serverAdmin"
import { createFoodSources, type SourceFood } from "@/mealResolution/foodSources"
import { selectWithJev } from "@/ai/jev"
import { getCachedOrFetchEmbeddings } from "@/utils/embeddingsCache/getCachedOrFetchEmbeddings"

const IDENTITY_POLICY = `Decide which USDA record is the SAME food as the catalogue food: same identity, variant and
preparation (raw vs cooked, dry vs cooked, fried vs baked, with or without skin, flavour, fat level). Names may
differ in language, spelling, word order or punctuation. Judge from the names only; nutrition values are not
given because they are what is being checked. A related but different food (tuna vs tuna ceviche, a dish vs one
of its ingredients) is NOT the same. When neither name states a preparation, they match on it; a record that
states a preparation the catalogue food does not (or the reverse) is not the same unless it is the usual form
(an apple is raw, milk is liquid). Choose none when no record is the same food.`

const db = createAdminSupabase() as any
type Food = { id: number; name: string; brand: string | null; defaultServingWeightGram: number | null; kcalPerServing: number | null;
  proteinPerServing: number | null; carbPerServing: number | null; totalFatPerServing: number | null; description: string | null }

async function gpt4FoodsByUsage(limit: number): Promise<Food[]> {
  const foods: Food[] = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db.from("FoodItem").select("id,name,brand,defaultServingWeightGram,kcalPerServing,proteinPerServing,carbPerServing,totalFatPerServing,description")
      .eq("foodInfoSource", "GPT4").order("id").range(from, from + 999)
    if (error) throw error
    foods.push(...data)
    if (data.length < 1000) break
  }
  const uses = new Map<number, number>()
  for (let i = 0; i < foods.length; i += 300) {
    const { data, error } = await db.from("LoggedFoodItem").select("foodItemId").in("foodItemId", foods.slice(i, i + 300).map(f => f.id)).is("deletedAt", null)
    if (error) throw error
    for (const row of data) uses.set(row.foodItemId, (uses.get(row.foodItemId) ?? 0) + 1)
  }
  return foods.sort((a, b) => (uses.get(b.id) ?? 0) - (uses.get(a.id) ?? 0) || a.id - b.id).slice(0, limit)
    .map(food => Object.assign(food, { uses: uses.get(food.id) ?? 0 }))
}

const density = (kcal: number | null, grams: number | null) => kcal != null && grams ? kcal * 100 / grams : null

/** Median energy density of the nearest catalogue foods that did not come from a model estimate. */
async function trustedNeighbourDensity(food: Food) {
  const [vector] = await getCachedOrFetchEmbeddings("BGE_BASE", [food.brand ? `${food.name} - ${food.brand}` : food.name])
  const near = await db.rpc("get_cosine_results", { p_embedding_cache_id: vector.id, amount_of_results: 12 })
  if (near.error) throw near.error
  const ids = ((near.data ?? []) as { id: number }[]).map(row => row.id).filter(id => id !== food.id)
  if (!ids.length) return null
  const { data, error } = await db.from("FoodItem").select("id,foodInfoSource,defaultServingWeightGram,kcalPerServing").in("id", ids)
  if (error) throw error
  const values = (data as any[]).filter(row => row.foodInfoSource !== "GPT4").flatMap(row => {
    const d = density(row.kcalPerServing, row.defaultServingWeightGram); return d == null ? [] : [d] }).sort((a, b) => a - b).slice(0, 8)
  return values.length >= 3 ? values[Math.floor(values.length / 2)] : null
}

async function check(food: Food) {
  const sources = createFoodSources({ userId: "00000000-0000-0000-0000-000000000000", messageId: 0, signal: AbortSignal.timeout(60000), discover() {} },
    { db, enqueue: async () => {} })
  const query = food.brand ? `${food.brand} ${food.name}` : food.name
  const { candidates } = await sources.searchFoodSources(query)
  // Some USDA records carry 0 kcal for foods that plainly have energy; they cannot correct anything. Records with
  // the same name are one option for Jev.
  const was0 = density(food.kcalPerServing, food.defaultServingWeightGram) ?? 0, seen = new Set<string>()
  const records = candidates.map(c => sources.sources.get(c.sourceId)!).filter((s): s is SourceFood => !!s && s.foodInfoSource === "USDA")
    .filter(s => !(s.kcal <= 0 && was0 > 5)).filter(s => { const key = `${s.name}|${s.brand ?? ""}`.toLowerCase(); return !seen.has(key) && !!seen.add(key) })
  if (!records.length) return { id: food.id, name: food.name, decision: "no_usda" }
  const options: Record<string, unknown> = { none: null }, criteria: Record<string, string> = { none: "No USDA record is the same food." }
  records.forEach((r, i) => { options[`usda_${i}`] = i; criteria[`usda_${i}`] = `USDA record ${i} is the same food.` })
  const decision = await selectWithJev({ options, state: { catalogueFood: { name: food.name, brand: food.brand },
    usda: records.map((r, i) => ({ record: i, name: r.name, brand: r.brand })) },
    questions: { selection: { type: "choice", instructions: IDENTITY_POLICY, criteria } } }, AbortSignal.timeout(20000))
  // A confident match corrects a >10% difference; a probable match only a large (>30%) one, where even an
  // approximate record of the same food is better than the estimate.
  const confidence = decision.status === "ok" ? decision.confidence ?? 0 : 0
  const index = confidence >= 0.7 && String(decision.choice).startsWith("usda_") ? Number(String(decision.choice).slice(5)) : -1
  const jev = { choice: decision.choice, confidence }
  if (index < 0) return { id: food.id, name: food.name, decision: "no_match", candidates: records.map(r => r.name).slice(0, 3), jev }
  const usda = records[index], was = density(food.kcalPerServing, food.defaultServingWeightGram), now = density(usda.kcal, usda.defaultServingWeightGram)!
  const neighbours = await trustedNeighbourDensity(food)
  const off = (a: number | null, b: number | null, share: number) => a == null || b == null || Math.abs(a - b) > Math.max(20, share * b)
  const outlier = neighbours != null && off(was, neighbours, 0.35)
  const decisionName = !outlier ? (off(was, now, 0.1) ? "keep" : "agrees") : off(now, neighbours, 0.2) ? "flag" : "supersede"
  return { id: food.id, name: food.name, decision: decisionName, usda: { fdcId: usda.externalId, name: usda.name, brand: usda.brand },
    kcalPer100g: { was: was && Math.round(was), usda: Math.round(now), neighbours: neighbours && Math.round(neighbours) }, jev, record: usda }
}

async function supersede(food: Food, usda: SourceFood) {
  const grams = food.defaultServingWeightGram && food.defaultServingWeightGram > 0 ? food.defaultServingWeightGram : usda.defaultServingWeightGram
  const scale = (value: number | null) => value == null ? null : Math.round(value * grams / usda.defaultServingWeightGram * 100) / 100
  const { data: before, error } = await db.from("FoodItem").select("*").eq("id", food.id).single()
  if (error) throw error
  const backup = await db.from("CatalogueAuditBackup").insert([{ audit: "A2_supersede", tableName: "FoodItem", rowId: food.id,
    before: Object.fromEntries(Object.entries(before).filter(([key]) => key !== "bgeBaseEmbedding")) }])
  if (backup.error) throw backup.error
  const conflict = await db.from("FoodItemConflict").insert([{ foodItemId: food.id, source: usda.source,
    existing: { kcalPer100g: density(food.kcalPerServing, food.defaultServingWeightGram), name: food.name, brand: food.brand, source: "GPT4" },
    proposed: { kcalPer100g: density(usda.kcal, usda.defaultServingWeightGram), name: usda.name, brand: usda.brand, resolution: "superseded by audit A2" } }])
  if (conflict.error) throw conflict.error
  const updated = await db.from("FoodItem").update({ defaultServingWeightGram: grams, kcalPerServing: scale(usda.kcal), proteinPerServing: scale(usda.proteinG),
    carbPerServing: scale(usda.carbG), totalFatPerServing: scale(usda.totalFatG), fiberPerServing: scale(usda.fiberG), sugarPerServing: scale(usda.sugarG),
    satFatPerServing: scale(usda.satFatG), foodInfoSource: "USDA", externalId: usda.externalId, weightUnknown: false,
    description: `${usda.source} (audit A2 replaced a model estimate)` }).eq("id", food.id)
  if (updated.error) throw updated.error
}

void (async () => {
  const [limit, reportPath] = [Number(process.argv[2] ?? 100), process.argv[3]], apply = process.argv.includes("--apply")
  if (!reportPath) throw new Error("usage: audit-gpt4-foods.ts <limit> <report.jsonl> [--apply]")
  const done = new Set(existsSync(reportPath) ? readFileSync(reportPath, "utf8").trim().split("\n").filter(Boolean).map(l => JSON.parse(l).id) : [])
  const log = console.log, error = console.error; console.log = () => {}; console.error = () => {}
  process.on("unhandledRejection", () => {})
  const queue = (await gpt4FoodsByUsage(limit)).filter(food => !done.has(food.id))
  log(`${queue.length} GPT4 foods to check${apply ? " (applying)" : " (dry run)"}`)
  await Promise.all(Array.from({ length: 4 }, async () => {
    for (let food = queue.shift(); food; food = queue.shift()) {
      const row: any = await check(food).catch(failure => ({ id: food!.id, name: food!.name, decision: "error", error: String(failure?.message ?? failure).slice(0, 120) }))
      if (apply && row.decision === "supersede") await supersede(food, row.record).then(() => { row.applied = true },
        failure => { row.applied = false; row.error = String(failure?.message ?? failure).slice(0, 120) })
      delete row.record
      appendFileSync(reportPath, JSON.stringify({ ...row, uses: (food as any).uses }) + "\n")
    }
  }))
  const rows = readFileSync(reportPath, "utf8").trim().split("\n").map(l => JSON.parse(l))
  const count = (d: string) => rows.filter(r => r.decision === d).length
  log(`supersede ${count("supersede")}, flag ${count("flag")}, agrees ${count("agrees")}, keep ${count("keep")}, no_match ${count("no_match")}, no_usda ${count("no_usda")}, error ${count("error")}`)
  console.error = error
})()
