// Catalogue audit: replace one food's nutrients with a cited source (USDA, or web with --web), keeping its serving
// weight. The old row goes to CatalogueAuditBackup (<audit>) and the disagreement to FoodItemConflict; past logs
// are left as logged. Without --apply it only lists the candidate sources.
// Run: npx ts-node -T -r tsconfig-paths/register scripts/audit-supersede.ts <foodId> "<query>" <sourceIndex> [--web] [--apply] [--audit=A2_supersede]
import { createAdminSupabase } from "@/utils/supabase/serverAdmin"
import { createFoodSources, type SourceFood } from "@/mealResolution/foodSources"

void (async () => {
  const db = createAdminSupabase() as any
  const [foodId, query, index] = [Number(process.argv[2]), process.argv[3], Number(process.argv[4])]
  const [web, apply] = [process.argv.includes("--web"), process.argv.includes("--apply")]
  const audit = process.argv.find(arg => arg.startsWith("--audit="))?.slice(8) ?? "A2_supersede"
  const log = console.log; console.log = () => {}
  const sources = createFoodSources({ userId: "00000000-0000-0000-0000-000000000000", messageId: 0, signal: AbortSignal.timeout(90000), discover() {} },
    { db, enqueue: async () => {} })
  const { candidates } = await sources.searchFoodSources(query, { web })
  const found = candidates.map(c => sources.sources.get(c.sourceId)!).filter(Boolean)
  const per100 = (kcal: number, grams: number) => Math.round(kcal * 1000 / grams) / 10
  found.forEach((s, i) => log(`${i}: ${s.name} (${s.brand ?? "-"}) ${per100(s.kcal, s.defaultServingWeightGram)} kcal/100 g, ${s.source}`))
  if (!apply) return
  const src: SourceFood | undefined = found[index]
  if (!src) throw new Error(`no source ${index}`)
  const { data: food, error } = await db.from("FoodItem").select("*").eq("id", foodId).single()
  if (error) throw error
  // A source already in the catalogue as another food means this food is a duplicate: merge it (A5) instead.
  if (src.externalId) {
    const twin = await db.from("FoodItem").select("id,name").eq("externalId", src.externalId).eq("foodInfoSource", src.foodInfoSource).neq("id", foodId).limit(1)
    if (twin.error) throw twin.error
    if (twin.data?.length) throw new Error(`source is already food ${twin.data[0].id} (${twin.data[0].name}): merge instead`)
  }
  const grams = food.defaultServingWeightGram > 0 ? food.defaultServingWeightGram : src.defaultServingWeightGram
  const scale = (v: number | null) => v == null ? null : Math.round(v * grams / src.defaultServingWeightGram * 100) / 100
  const { bgeBaseEmbedding: _, ...before } = food
  let r = await db.from("CatalogueAuditBackup").insert([{ audit, tableName: "FoodItem", rowId: foodId, before }]); if (r.error) throw r.error
  r = await db.from("FoodItemConflict").insert([{ foodItemId: foodId, source: src.source,
    existing: { kcalPer100g: per100(food.kcalPerServing, food.defaultServingWeightGram), name: food.name, source: food.foodInfoSource },
    proposed: { kcalPer100g: per100(src.kcal, src.defaultServingWeightGram), name: src.name, brand: src.brand, resolution: `superseded by audit ${audit}` } }])
  if (r.error) throw r.error
  r = await db.from("FoodItem").update({ defaultServingWeightGram: grams, kcalPerServing: scale(src.kcal), proteinPerServing: scale(src.proteinG),
    carbPerServing: scale(src.carbG), totalFatPerServing: scale(src.totalFatG), fiberPerServing: scale(src.fiberG), sugarPerServing: scale(src.sugarG),
    satFatPerServing: scale(src.satFatG), foodInfoSource: src.foodInfoSource, externalId: src.externalId, weightUnknown: false,
    description: src.foodInfoSource === "Online" ? src.source : `${src.source} (audit ${audit} replaced the previous values)` }).eq("id", foodId)
  if (r.error) throw r.error
  log(`APPLIED ${foodId} ${food.name}: ${per100(food.kcalPerServing, food.defaultServingWeightGram)} -> ${per100(src.kcal, src.defaultServingWeightGram)} kcal/100 g`)
})().catch(e => { process.stdout.write(`FAILED ${e.message}\n`); process.exit(1) })
