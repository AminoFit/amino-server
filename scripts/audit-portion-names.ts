// Catalogue audit A10: foods named with the portion someone ate ("1/2 Cheeseburger", "Three slices of pizza",
// "big bowl of Vector cereal") are not foods. Flash decides which names carry a portion (a broad pattern only
// preselects: "Half & Half" and "Three Berry Blend" are products) and names the food itself. When Jev is sure
// (>= 0.9, names only) a catalogue food is that food, the portion food merges into it (logs keep their grams);
// otherwise it is renamed to the food itself. Backups: A10_portion_merge / A10_portion_rename.
// Run: npx ts-node -T -r tsconfig-paths/register scripts/audit-portion-names.ts <report.jsonl> [--apply]
import { appendFileSync, existsSync, readFileSync } from "fs"
import { createAdminSupabase } from "@/utils/supabase/serverAdmin"
import { selectWithJev } from "@/ai/jev"
import { FOOD_MODEL, providerPreferences } from "@/ai/models"

const db = createAdminSupabase() as any
const PRESELECT = /^\s*(\d+(\.\d+)?|\d+\/\d+|½|¼|¾|half|a half|quarter|one|two|three|four|five|six|a|an|small|medium|large|big|mini|little|huge|bowl of|plate of|cup of|glass of|slice of|slices of|piece of|pieces of|handful of|some)\b/i

const CLASSIFY = `Each line is a food name from a nutrition catalogue. Some names wrongly include the portion someone
ate ("1/2 Cheeseburger", "Two hard boiled eggs", "big bowl of cereal", "Three slices of pizza", "Half of a muffin").
Others only look like it but name a product or a standard item ("Half & Half" cream, "Three Berry Blend", "Half
Chicken" as a restaurant dish, "1/3 Less Fat Cream Cheese", "Small Fries" as a menu size). For each id return
portion true only when the name includes the amount eaten, and food: the food itself without that portion, keeping
brand, flavour and preparation (for example "Cheeseburger", "Hard-boiled egg", "Vector cereal", "Pizza").`

const JEV_POLICY = `Decide which catalogue food is the SAME food as the requested food: same identity, variant and
preparation. Names may differ in language, spelling, word order, capitalisation or punctuation. Judge from the names
only. A related but different food is NOT the same. Choose none when no catalogue food is the same food.`

async function classify(foods: { id: number; name: string }[]) {
  const key = process.env.OPENROUTER_API_KEY || process.env.OPEN_ROUTER_API_KEY
  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", { method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(60000),
    body: JSON.stringify({ model: FOOD_MODEL, provider: providerPreferences(FOOD_MODEL), reasoning: { effort: "low", exclude: true }, max_tokens: 4000,
      response_format: { type: "json_schema", json_schema: { name: "portions", strict: true, schema: { type: "object", additionalProperties: false,
        required: ["items"], properties: { items: { type: "array", items: { type: "object", additionalProperties: false, required: ["id", "portion", "food"],
          properties: { id: { type: "integer" }, portion: { type: "boolean" }, food: { type: "string" } } } } } } } },
      messages: [{ role: "user", content: `${CLASSIFY}\n\n${foods.map(f => `${f.id}: ${JSON.stringify(f.name)}`).join("\n")}` }] }) })
  if (!response.ok) throw new Error(`classify failed (${response.status})`)
  const body = await response.json()
  return JSON.parse(body.choices[0].message.content).items as { id: number; portion: boolean; food: string }[]
}

async function baseFood(food: { id: number; brand: string | null }, name: string) {
  const { data, error } = await db.rpc("search_meal_food_catalogue", { p_query: name.slice(0, 100), p_limit: 8, p_offset: 0 })
  if (error) throw error
  const candidates = (data as { id: number; name: string; brand: string | null }[]).filter(c => c.id !== food.id)
  if (!candidates.length) return null
  const options: Record<string, unknown> = { none: null }, criteria: Record<string, string> = { none: "No catalogue food is the same food." }
  candidates.forEach(c => { options[`food_${c.id}`] = c.id; criteria[`food_${c.id}`] = `Catalogue food ${c.id} is the same food.` })
  const decision = await selectWithJev({ options, state: { requested: { name, brand: food.brand }, catalogue: candidates.map(c => ({ id: c.id, name: c.name, brand: c.brand })) },
    questions: { selection: { type: "choice", instructions: JEV_POLICY, criteria } } }, AbortSignal.timeout(20000))
  const sure = decision.status === "ok" && (decision.confidence ?? 0) >= 0.9 && String(decision.choice).startsWith("food_")
  return sure ? candidates.find(c => c.id === Number(String(decision.choice).slice(5))) ?? null : null
}

void (async () => {
  const [reportPath, apply] = [process.argv[2], process.argv.includes("--apply")]
  if (!reportPath) throw new Error("usage: audit-portion-names.ts <report.jsonl> [--apply]")
  const done = new Set(existsSync(reportPath) ? readFileSync(reportPath, "utf8").trim().split("\n").filter(Boolean).map(l => JSON.parse(l).id) : [])
  const log = console.log; console.log = () => {}; console.error = () => {}
  const foods: { id: number; name: string; brand: string | null }[] = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db.from("FoodItem").select("id,name,brand").order("id").range(from, from + 999)
    if (error) throw error
    foods.push(...data.filter((f: any) => PRESELECT.test(f.name) && !done.has(f.id)))
    if (data.length < 1000) break
  }
  log(`${foods.length} preselected names${apply ? " (applying)" : " (dry run)"}`)
  for (let i = 0; i < foods.length; i += 40) {
    const batch = foods.slice(i, i + 40)
    const verdicts = await classify(batch).catch(failure => batch.map(f => ({ id: f.id, portion: false, food: "", error: String(failure?.message ?? failure) })))
    for (const food of batch) {
      const verdict: any = verdicts.find(v => v.id === food.id)
      const row: any = { id: food.id, name: food.name, portion: !!verdict?.portion, food: verdict?.food ?? null }
      if (verdict?.error) row.error = verdict.error
      if (row.portion && row.food && row.food.trim().toLowerCase() !== food.name.trim().toLowerCase()) {
        try {
          const base = await baseFood(food, row.food)
          row.decision = base ? "merge" : "rename"
          if (base) row.into = { id: base.id, name: base.name }
          if (apply && base) {
            const merged = await db.rpc("merge_catalogue_food", { p_keep: base.id, p_drop: food.id, p_audit: "A10_portion_merge" })
            if (merged.error) throw merged.error
            row.applied = true
          } else if (apply) {
            const { data: before, error } = await db.from("FoodItem").select("*").eq("id", food.id).single()
            if (error) throw error
            const { bgeBaseEmbedding: _, ...kept } = before
            const backup = await db.from("CatalogueAuditBackup").insert([{ audit: "A10_portion_rename", tableName: "FoodItem", rowId: food.id, before: kept }])
            if (backup.error) throw backup.error
            const renamed = await db.from("FoodItem").update({ name: row.food.trim() }).eq("id", food.id)
            if (renamed.error) throw renamed.error
            row.applied = true
          }
        } catch (failure: any) { row.decision = "error"; row.error = String(failure?.message ?? failure).slice(0, 140) }
      } else row.decision = "keep"
      appendFileSync(reportPath, JSON.stringify(row) + "\n")
    }
  }
  const rows = readFileSync(reportPath, "utf8").trim().split("\n").map(l => JSON.parse(l))
  const count = (d: string) => rows.filter(r => r.decision === d).length
  log(`merge ${count("merge")}, rename ${count("rename")}, keep ${count("keep")}, error ${count("error")}`)
})()
