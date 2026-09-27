// Catalogue audit A11: foods no source could fix (impossible facts, or no usable serving weight) get a clearly marked
// best-guess estimate instead of staying broken: Sonnet estimates one typical serving from the name, keeping the stored
// calories when they are a plausible portion total (usually only the weight was wrong). The estimate must be physically
// possible and within 1.8x of similar trusted catalogue foods' energy density, or the food is left for review.
// Applied estimates become foodInfoSource AgentEstimate with their basis, so a real source can supersede them later.
// Old rows go to CatalogueAuditBackup (A11_estimate) and FoodItemConflict; past logs are left as logged.
// Run: npx ts-node -T -r tsconfig-paths/register scripts/audit-estimate.ts <report.jsonl> [--apply] [--ids=1,2] [--accept=3,4]
import { appendFileSync, existsSync, readFileSync } from "fs"
import { createAdminSupabase } from "@/utils/supabase/serverAdmin"
import { getCachedOrFetchEmbeddings } from "@/utils/embeddingsCache/getCachedOrFetchEmbeddings"
import { creationModel, providerPreferences } from "@/ai/models"

const db = createAdminSupabase() as any
type Food = { id: number; name: string; brand: string | null; defaultServingWeightGram: number | null; weightUnknown: boolean; kcalPerServing: number | null;
  proteinPerServing: number | null; carbPerServing: number | null; totalFatPerServing: number | null; foodInfoSource: string }
const macros = (p: number | null, c: number | null, f: number | null) => (p ?? 0) + (c ?? 0) + (f ?? 0)
const possible = (grams: number | null, kcal: number | null, m: number) => !!grams && grams > 0 && kcal != null && kcal >= 0 && kcal * 100 / grams <= 950 && m <= grams * 1.15

const PROMPT = `Estimate nutrition for one typical serving of this catalogue food, as a nutrition database would list
it. The stored values are shown because some are wrong: when the stored calories are a plausible total for one
portion of this food, keep them and estimate the portion weight; otherwise estimate everything. Use what is known
about the brand, restaurant or dish. Weigh a drink by its volume (grams = mL). Return JSON {"servingName": unit word
such as "sandwich", "cup", "bar", "servingGrams", "kcal", "proteinG", "carbG", "totalFatG", "basis": one sentence}.`

async function estimate(food: Food, problem?: string) {
  const key = process.env.OPENROUTER_API_KEY || process.env.OPEN_ROUTER_API_KEY, model = creationModel()
  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", { method: "POST", signal: AbortSignal.timeout(60000),
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({ model, provider: providerPreferences(model), max_tokens: 2000, reasoning: { effort: "low", exclude: true },
      response_format: { type: "json_object" },
      messages: [{ role: "user", content: `${PROMPT}\n\nFood (data): ${JSON.stringify({ name: food.name, brand: food.brand,
        stored: { servingGrams: food.defaultServingWeightGram, kcal: food.kcalPerServing, proteinG: food.proteinPerServing,
          carbG: food.carbPerServing, totalFatG: food.totalFatPerServing } })}${problem ? `\n\nA previous estimate was rejected: ${problem}` : ""}` }] }) })
  if (!response.ok) throw new Error(`estimate failed (${response.status})`)
  const body = await response.json(), text: string = body.choices?.[0]?.message?.content ?? ""
  const json = JSON.parse(text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1))
  const num = (v: unknown) => typeof v === "number" && Number.isFinite(v) ? Math.round(v * 10) / 10 : NaN
  return { servingName: String(json.servingName ?? "serving").slice(0, 40), grams: num(json.servingGrams), kcal: num(json.kcal),
    proteinG: num(json.proteinG), carbG: num(json.carbG), totalFatG: num(json.totalFatG), basis: String(json.basis ?? "").slice(0, 240),
    cost: Number(body.usage?.cost ?? 0) }
}

async function trustedDensity(food: Food) {
  const [vector] = await getCachedOrFetchEmbeddings("BGE_BASE", [food.brand ? `${food.name} - ${food.brand}` : food.name])
  const near = await db.rpc("get_cosine_results", { p_embedding_cache_id: vector.id, amount_of_results: 12 })
  if (near.error) throw near.error
  const ids = ((near.data ?? []) as { id: number }[]).map(r => r.id).filter(id => id !== food.id)
  if (!ids.length) return null
  const { data, error } = await db.from("FoodItem").select("foodInfoSource,defaultServingWeightGram,kcalPerServing,proteinPerServing,carbPerServing,totalFatPerServing").in("id", ids)
  if (error) throw error
  const values = (data as any[]).filter(r => !["GPT4", "AgentEstimate"].includes(r.foodInfoSource) &&
    possible(r.defaultServingWeightGram, r.kcalPerServing, macros(r.proteinPerServing, r.carbPerServing, r.totalFatPerServing)))
    .map(r => r.kcalPerServing * 100 / r.defaultServingWeightGram).sort((a, b) => a - b).slice(0, 8)
  return values.length >= 3 ? values[Math.floor(values.length / 2)] : null
}

async function apply(food: Food, e: Awaited<ReturnType<typeof estimate>>) {
  const { data: row, error } = await db.from("FoodItem").select("*").eq("id", food.id).single()
  if (error) throw error
  const { data: servings, error: servingError } = await db.from("Serving").select("*").eq("foodItemId", food.id)
  if (servingError) throw servingError
  const old = food.defaultServingWeightGram
  // Servings that repeated the old default weight, or had none, move to the estimated serving weight.
  const moved = (servings as any[]).filter(s => !(s.servingWeightGram > 0) ||
    (old && Math.abs(s.servingWeightGram / (Number(s.defaultServingAmount) || 1) - old) <= 0.01 * old))
  const { bgeBaseEmbedding: _, ...before } = row
  let r = await db.from("CatalogueAuditBackup").insert([{ audit: "A11_estimate", tableName: "FoodItem", rowId: food.id, before },
    ...moved.map(s => ({ audit: "A11_estimate", tableName: "Serving", rowId: s.id, before: s }))])
  if (r.error) throw r.error
  r = await db.from("FoodItemConflict").insert([{ foodItemId: food.id, source: `Estimate: ${e.basis}`,
    existing: { grams: old, kcal: food.kcalPerServing, name: food.name, source: food.foodInfoSource },
    proposed: { grams: e.grams, kcal: e.kcal, resolution: "best-guess estimate by audit A11" } }])
  if (r.error) throw r.error
  r = await db.from("FoodItem").update({ defaultServingWeightGram: e.grams, kcalPerServing: e.kcal, proteinPerServing: e.proteinG,
    carbPerServing: e.carbG, totalFatPerServing: e.totalFatG, foodInfoSource: "AgentEstimate", externalId: null, weightUnknown: false,
    description: `Estimate: ${e.basis}` }).eq("id", food.id)
  if (r.error) throw r.error
  for (const s of moved) {
    const u = await db.from("Serving").update({ servingWeightGram: e.grams * (Number(s.defaultServingAmount) || 1) }).eq("id", s.id)
    if (u.error) throw u.error
  }
  if (!servings.length) {
    const added = await db.from("Serving").insert([{ foodItemId: food.id, servingName: e.servingName, servingWeightGram: e.grams, defaultServingAmount: 1 }])
    if (added.error) throw added.error
  }
  return { servingsMoved: moved.length }
}

void (async () => {
  const [reportPath, doApply] = [process.argv[2], process.argv.includes("--apply")]
  const extra = (process.argv.find(a => a.startsWith("--ids="))?.slice(6) ?? "").split(",").filter(Boolean).map(Number)
  // Reviewed on 2026-09-27: the neighbour signal, not the estimate, was off (sodas, ramen, tea, scallops).
  const accepted = (process.argv.find(a => a.startsWith("--accept="))?.slice(9) ?? "").split(",").filter(Boolean).map(Number)
  if (!reportPath) throw new Error("usage: audit-estimate.ts <report.jsonl> [--apply] [--ids=1,2]")
  const done = new Set(existsSync(reportPath) ? readFileSync(reportPath, "utf8").trim().split("\n").filter(Boolean).map(l => JSON.parse(l).id) : [])
  const log = console.log; console.log = () => {}; console.error = () => {}
  const foods: Food[] = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db.from("FoodItem").select("id,name,brand,defaultServingWeightGram,weightUnknown,kcalPerServing,proteinPerServing,carbPerServing,totalFatPerServing,foodInfoSource")
      .order("id").range(from, from + 999)
    if (error) throw error
    foods.push(...(data as Food[]).filter(f => !done.has(f.id) && (extra.includes(f.id) || f.weightUnknown ||
      !possible(f.defaultServingWeightGram, f.kcalPerServing, macros(f.proteinPerServing, f.carbPerServing, f.totalFatPerServing)))))
    if (data.length < 1000) break
  }
  log(`${foods.length} foods to estimate${doApply ? " (applying)" : " (dry run)"}`)
  await Promise.all(Array.from({ length: 4 }, async () => {
    for (let food = foods.shift(); food; food = foods.shift()) {
      const row: any = { id: food.id, name: food.name, was: { grams: food.defaultServingWeightGram, kcal: food.kcalPerServing } }
      try {
        // One retry for an empty or unparsable answer, and one for a physically impossible estimate.
        let e = await estimate(food).catch(() => estimate(food))
        if (!possible(e.grams, e.kcal, macros(e.proteinG, e.carbG, e.totalFatG)))
          e = await estimate(food, `${e.grams} g with ${e.kcal} kcal and ${macros(e.proteinG, e.carbG, e.totalFatG)} g of macros is physically impossible (at most 900 kcal per 100 g, macros no heavier than the food); the stored weight is probably wrong`)
        const neighbours = await trustedDensity(food)
        row.estimate = { servingName: e.servingName, grams: e.grams, kcal: e.kcal, p: e.proteinG, c: e.carbG, f: e.totalFatG, basis: e.basis }
        row.cost = e.cost; row.neighbours = neighbours && Math.round(neighbours)
        const density = e.kcal * 100 / e.grams
        row.decision = !possible(e.grams, e.kcal, macros(e.proteinG, e.carbG, e.totalFatG)) || [e.grams, e.kcal, e.proteinG, e.carbG, e.totalFatG].some(Number.isNaN)
          ? "implausible_estimate"
          : !accepted.includes(food.id) && neighbours != null && (density > neighbours * 1.8 + 20 || density < neighbours / 1.8 - 20) ? "review" : "estimate"
        if (doApply && row.decision === "estimate") Object.assign(row, await apply(food, e), { applied: true })
      } catch (failure: any) { row.decision = "error"; row.error = String(failure?.message ?? failure).slice(0, 140) }
      appendFileSync(reportPath, JSON.stringify(row) + "\n")
    }
  }))
  const rows = readFileSync(reportPath, "utf8").trim().split("\n").map(l => JSON.parse(l))
  const count = (d: string) => rows.filter(r => r.decision === d).length
  log(`estimate ${count("estimate")}, review ${count("review")}, implausible ${count("implausible_estimate")}, error ${count("error")}, cost $${rows.reduce((s, r) => s + (r.cost ?? 0), 0).toFixed(3)}`)
})()
