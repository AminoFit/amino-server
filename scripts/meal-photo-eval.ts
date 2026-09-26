// Live eval of photo meals on the owner's own logged photos (read from storage, never
// committed). Uses the production catalogue read-only; food creation is simulated so
// nothing is written. Run with production read credentials:
// npx ts-node -T -r tsconfig-paths/register scripts/meal-photo-eval.ts
import { createAdminSupabase } from "@/utils/supabase/serverAdmin"
import { resolveMeal } from "@/mealResolution/resolve"
import { compileMealPlan } from "@/mealResolution/compile"
import { compileCheckedMealPlan } from "@/mealResolution/historyCheck"
import { createMealEvidence, type CatalogFood } from "@/mealResolution/evidence"
import { createFoodSources } from "@/mealResolution/foodSources"

type Plan = ReturnType<typeof compileMealPlan>
type Case = { messageId: number; expect: (plan: Plan, foods: Map<number, CatalogFood>) => string[] }
const named = (plan: Plan, foods: Map<number, CatalogFood>) => plan.items.map(item => ({ ...item, food: foods.get(item.foodId) }))
const CASES: Case[] = [
  { messageId: 30318, expect: (plan, foods) => { const items = named(plan, foods), problems: string[] = []
    if (items.some(item => item.origin === "history")) problems.push("copied a past meal")
    if (!items.some(item => /tuna/i.test(item.food?.name ?? ""))) problems.push("no tuna ceviche")
    if (!items.some(item => /mango/i.test(item.food?.name ?? ""))) problems.push("mango dropped")
    if (!items.some(item => /avocado/i.test(item.food?.name ?? ""))) problems.push("avocado dropped")
    return problems } },
  { messageId: 30322, expect: (plan, foods) => { const drink = named(plan, foods).find(item => item.food?.gtin === "00818290015617")
    return !drink ? ["barcode product not logged"] : drink.grams < 180 || drink.grams > 240 ? [`drink ${drink.grams} g, expected ~207`] : [] } },
  { messageId: 30323, expect: (plan, foods) => { const milk = named(plan, foods).find(item => item.food?.gtin === "07501020548440")
    return !milk ? ["barcode product not logged"] : milk.grams > 400 ? [`milk ${milk.grams} g: a whole multi-serve bottle`] :
      milk.grams < 150 ? [`milk ${milk.grams} g: less than one serving`] : [] } },
  { messageId: 30321, expect: (plan, foods) => { const cereal = named(plan, foods).find(item => item.food?.gtin === "00016000229969")
    return !cereal ? ["Cheerios Protein Cookies & Creme not logged"] : Math.abs(cereal.grams - 37) > 2 ? [`${cereal.grams} g, expected 37`] : [] } }
]

async function run(test: Case) {
  const db = createAdminSupabase()
  const { data: message } = await db.from("Message").select("id,userId,content,consumedOn,createdAt").eq("id", test.messageId).single()
  const { data: photos } = await db.from("UserMessageImages").select("id").eq("messageId", test.messageId).order("id")
  const controller = new AbortController(), created: string[] = []
  const evidence = createMealEvidence(message!.userId, controller.signal), barcodes: string[] = []
  // Real sources and duplicate check (Jev); only the database writes are simulated.
  const realDb = db as any
  let fakeId = 900000001 // simulated foods use IDs far above the catalogue's
  const guardedDb = { from: (table: string) => realDb.from(table), rpc: (name: string, args: any) => {
    if (name === "create_catalogue_food") {
      const food = args.p_food, id = fakeId++
      created.push(`${food.foodInfoSource}:${food.name} ${food.defaultServingWeightGram}g ${food.kcal}kcal gtin=${food.gtin}`)
      evidence.foods.set(id, { id, name: food.name, brand: food.brand, gtin: food.gtin, description: food.source, lastUpdated: new Date().toISOString(),
        defaultServingWeightGram: food.defaultServingWeightGram, weightUnknown: false, kcalPerServing: food.kcal, proteinPerServing: food.proteinG,
        carbPerServing: food.carbG, totalFatPerServing: food.totalFatG, satFatPerServing: food.satFatG ?? null, transFatPerServing: null,
        fiberPerServing: food.fiberG ?? null, sugarPerServing: food.sugarG ?? null, addedSugarPerServing: null,
        Serving: (args.p_servings as { name: string; grams: number; amount: number }[]).map((s, i) => ({ id: id * 10 + i, foodItemId: id,
          servingName: s.name, servingWeightGram: s.grams, defaultServingAmount: s.amount })) })
      return { abortSignal: async () => ({ data: [{ food_id: id, created: true, enrichment: null }], error: null }) }
    }
    if (name === "enrich_catalogue_food") return { abortSignal: async () => ({ data: { foodId: args.p_food_id, added: [], conflict: false }, error: null }) }
    return realDb.rpc(name, args)
  } }
  const sources = createFoodSources({ userId: message!.userId, messageId: test.messageId, signal: controller.signal, barcodes,
    discover: id => evidence.discover(id) }, { db: guardedDb as never, enqueue: async () => {} })
  const input = { userId: message!.userId, operationId: "00000000-0000-4000-8000-00000000e000", messageId: test.messageId,
    originalText: message!.content ?? "", consumedOn: new Date(`${message!.consumedOn}Z`).toISOString(),
    submittedAt: new Date(`${message!.createdAt}Z`).toISOString(), timezone: "America/New_York", locale: null,
    attachmentIds: (photos ?? []).map(photo => photo.id), clarificationAllowed: false }
  const started = Date.now()
  let result = await resolveMeal(input, { evidence, sources, barcodes })
  let plan: Plan
  try { plan = await compileCheckedMealPlan(input, result, { secondLook: !result.checked }) }
  catch (error) {
    console.error(`  [${test.messageId}] first plan rejected: ${error instanceof Error ? error.message : error} after ${Date.now() - started} ms`)
    // The worker's single repair turn, with the validator's code.
    result = await resolveMeal({ ...input, validationErrorCode: error instanceof Error ? error.message : "invalid_plan" }, { evidence, sources, barcodes })
    plan = await compileCheckedMealPlan(input, result, { secondLook: false })
  }
  const problems = test.expect(plan, evidence.foods)
  return { messageId: test.messageId, pass: problems.length === 0, problems, ms: Date.now() - started, steps: result.steps, checked: result.checked,
    stages: Object.fromEntries(Object.entries((result.timeline ?? []).reduce<Record<string, number>>((sum, t) => ({ ...sum, [t.stage]: (sum[t.stage] ?? 0) + t.ms }), {}))), barcodes: result.barcodes,
    created, items: named(plan, evidence.foods).map(item => `${item.food?.name} ${Math.round(item.grams)}g ${item.loggedUnit} (${item.origin})`) }
}

void (async () => {
  process.on("unhandledRejection", () => {})
  const only = process.argv.slice(2).map(Number)
  let passed = 0
  for (const test of CASES.filter(test => !only.length || only.includes(test.messageId))) {
    try { const row = await run(test); if (row.pass) passed++; console.log(JSON.stringify(row)) }
    catch (error) { console.log(JSON.stringify({ messageId: test.messageId, pass: false, error: error instanceof Error ? error.message : "unknown" })) }
  }
  console.log(`\n${passed} passed`)
})()
