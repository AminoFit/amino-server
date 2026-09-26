// Catalogue audit A3: foods whose facts are physically impossible (> 950 kcal/100 g, or macros more than 15% heavier
// than the food; label rounding on pure fats stays below that) are replaced from a matched source. Most have the
// right nutrients on a wrong serving weight (a McDouble "serving" of 45 g with 400 kcal), so the source's serving
// weight is taken too, and servings that repeated the wrong weight move with it. USDA first; cited web search only
// when USDA has no plausible record of the same food (Jev >= 0.8, names only). A source that is already another
// catalogue food is left for the merge (A5). Old rows go to CatalogueAuditBackup (A3_implausible) and the
// disagreement to FoodItemConflict; past logs are left as logged.
// Run: npx ts-node -T -r tsconfig-paths/register scripts/audit-implausible.ts <report.jsonl> [--apply]
import { appendFileSync, existsSync, readFileSync } from "fs"
import { createAdminSupabase } from "@/utils/supabase/serverAdmin"
import { createFoodSources, type SourceFood } from "@/mealResolution/foodSources"
import { selectWithJev } from "@/ai/jev"

const POLICY = `Decide which source describes the SAME food as the catalogue food: same identity, variant and
preparation. Names may differ in language, spelling, word order or punctuation. Judge from the names only: the
catalogue food's numbers are known to be wrong. A related but different food is NOT the same. Choose none when no
source is the same food.`

const db = createAdminSupabase() as any
type Food = { id: number; name: string; brand: string | null; defaultServingWeightGram: number; kcalPerServing: number;
  proteinPerServing: number | null; carbPerServing: number | null; totalFatPerServing: number | null; foodInfoSource: string }
// Zero is a real value (water, tea, diet soda); a source only needs energy when it has macros.
const plausible = (grams: number, kcal: number, macros: number) => grams > 0 && kcal >= 0 && kcal * 100 / grams <= 950 && macros <= grams * 1.15
const usableSource = (grams: number, kcal: number, macros: number) => plausible(grams, kcal, macros) && (kcal > 0 || macros < 1)
const macrosOf = (p: number | null, c: number | null, f: number | null) => (p ?? 0) + (c ?? 0) + (f ?? 0)

async function impossibleFoods(): Promise<Food[]> {
  const found: Food[] = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db.from("FoodItem").select("id,name,brand,defaultServingWeightGram,kcalPerServing,proteinPerServing,carbPerServing,totalFatPerServing,foodInfoSource")
      .gt("defaultServingWeightGram", 0).not("kcalPerServing", "is", null).order("id").range(from, from + 999)
    if (error) throw error
    found.push(...(data as Food[]).filter(f => !plausible(f.defaultServingWeightGram, f.kcalPerServing, macrosOf(f.proteinPerServing, f.carbPerServing, f.totalFatPerServing))))
    if (data.length < 1000) break
  }
  return found
}

async function match(food: Food, web: boolean) {
  const sources = createFoodSources({ userId: "00000000-0000-0000-0000-000000000000", messageId: 0, signal: AbortSignal.timeout(90000), discover() {} },
    { db, enqueue: async () => {} })
  const query = food.brand ? `${food.brand} ${food.name}` : food.name
  const { candidates } = await sources.searchFoodSources(query, { web })
  const seen = new Set<string>()
  const records = candidates.map(c => sources.sources.get(c.sourceId)!).filter(Boolean)
    .filter(s => usableSource(s.defaultServingWeightGram, s.kcal, macrosOf(s.proteinG, s.carbG, s.totalFatG)))
    .filter(s => { const key = `${s.name}|${s.brand ?? ""}`.toLowerCase(); return !seen.has(key) && !!seen.add(key) })
  if (!records.length) return null
  const options: Record<string, unknown> = { none: null }, criteria: Record<string, string> = { none: "No source is the same food." }
  records.forEach((_, i) => { options[`source_${i}`] = i; criteria[`source_${i}`] = `Source ${i} is the same food.` })
  const decision = await selectWithJev({ options, state: { catalogueFood: { name: food.name, brand: food.brand },
    sources: records.map((r, i) => ({ source: i, name: r.name, brand: r.brand })) },
    questions: { selection: { type: "choice", instructions: POLICY, criteria } } }, AbortSignal.timeout(20000))
  const ok = decision.status === "ok" && (decision.confidence ?? 0) >= 0.8 && String(decision.choice).startsWith("source_")
  return ok ? records[Number(String(decision.choice).slice(7))] : null
}

async function apply(food: Food, src: SourceFood) {
  if (src.externalId) {
    const twin = await db.from("FoodItem").select("id").eq("externalId", src.externalId).eq("foodInfoSource", src.foodInfoSource).neq("id", food.id).limit(1)
    if (twin.error) throw twin.error
    if (twin.data?.length) return { merge: twin.data[0].id }
  }
  const { data: row, error } = await db.from("FoodItem").select("*").eq("id", food.id).single()
  if (error) throw error
  const { data: servings, error: servingError } = await db.from("Serving").select("*").eq("foodItemId", food.id)
  if (servingError) throw servingError
  const old = food.defaultServingWeightGram, grams = src.defaultServingWeightGram
  // Servings that repeated the wrong default weight (per unit) move to the source's serving weight.
  const moved = (servings as any[]).filter(s => s.servingWeightGram > 0 && Math.abs(s.servingWeightGram / (Number(s.defaultServingAmount) || 1) - old) <= 0.01 * old)
  const { bgeBaseEmbedding: _, ...before } = row
  let r = await db.from("CatalogueAuditBackup").insert([{ audit: "A3_implausible", tableName: "FoodItem", rowId: food.id, before },
    ...moved.map(s => ({ audit: "A3_implausible", tableName: "Serving", rowId: s.id, before: s }))])
  if (r.error) throw r.error
  r = await db.from("FoodItemConflict").insert([{ foodItemId: food.id, source: src.source,
    existing: { kcalPer100g: Math.round(food.kcalPerServing * 1000 / old) / 10, grams: old, name: food.name, source: food.foodInfoSource },
    proposed: { kcalPer100g: Math.round(src.kcal * 1000 / grams) / 10, grams, name: src.name, brand: src.brand, resolution: "replaced by audit A3" } }])
  if (r.error) throw r.error
  r = await db.from("FoodItem").update({ defaultServingWeightGram: grams, kcalPerServing: src.kcal, proteinPerServing: src.proteinG, carbPerServing: src.carbG,
    totalFatPerServing: src.totalFatG, fiberPerServing: src.fiberG, sugarPerServing: src.sugarG, satFatPerServing: src.satFatG,
    foodInfoSource: src.foodInfoSource, externalId: src.externalId, weightUnknown: false,
    description: src.foodInfoSource === "Online" ? src.source : `${src.source} (audit A3 replaced impossible values)` }).eq("id", food.id)
  if (r.error) throw r.error
  for (const s of moved) {
    const u = await db.from("Serving").update({ servingWeightGram: grams * (Number(s.defaultServingAmount) || 1) }).eq("id", s.id)
    if (u.error) throw u.error
  }
  return { applied: true, servingsMoved: moved.length }
}

void (async () => {
  const [reportPath, doApply] = [process.argv[2], process.argv.includes("--apply")]
  if (!reportPath) throw new Error("usage: audit-implausible.ts <report.jsonl> [--apply]")
  const done = new Set(existsSync(reportPath) ? readFileSync(reportPath, "utf8").trim().split("\n").filter(Boolean).map(l => JSON.parse(l).id) : [])
  const log = console.log; console.log = () => {}; console.error = () => {}
  process.on("unhandledRejection", () => {})
  const queue = (await impossibleFoods()).filter(f => !done.has(f.id))
  log(`${queue.length} impossible foods${doApply ? " (applying)" : " (dry run)"}`)
  await Promise.all(Array.from({ length: 3 }, async () => {
    for (let food = queue.shift(); food; food = queue.shift()) {
      const row: any = { id: food.id, name: food.name, was: { grams: food.defaultServingWeightGram, kcal: food.kcalPerServing } }
      try {
        let src = await match(food, false)
        row.via = "usda"
        if (!src) { src = await match(food, true); row.via = "web" }
        if (!src) row.decision = "no_source"
        else {
          row.decision = "replace"
          row.source = { name: src.name, brand: src.brand, grams: src.defaultServingWeightGram, kcal: src.kcal, url: src.source }
          if (doApply) Object.assign(row, await apply(food, src))
        }
      } catch (failure: any) { row.decision = "error"; row.error = String(failure?.message ?? failure).slice(0, 120) }
      appendFileSync(reportPath, JSON.stringify(row) + "\n")
    }
  }))
  const rows = readFileSync(reportPath, "utf8").trim().split("\n").map(l => JSON.parse(l))
  const count = (d: string) => rows.filter(r => r.decision === d).length
  log(`replace ${count("replace")} (usda ${rows.filter(r => r.decision === "replace" && r.via === "usda").length}), no_source ${count("no_source")}, error ${count("error")}`)
})()
