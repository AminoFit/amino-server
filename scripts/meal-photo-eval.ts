// Live eval of photo meals on the owner's own logged photos (read from storage, never
// committed). Uses the production catalogue read-only; food creation is simulated so
// nothing is written. Run with production read credentials:
// npx ts-node -T -r tsconfig-paths/register scripts/meal-photo-eval.ts [messageIds...] [--model=<openrouter id>]
// --model swaps the meal agent's model (the second-look critic stays on Flash) to compare vision models.
import { createAdminSupabase } from "@/utils/supabase/serverAdmin"
import { resolveMeal } from "@/mealResolution/resolve"
import { compileMealPlan } from "@/mealResolution/compile"
import { compileCheckedMealPlan } from "@/mealResolution/historyCheck"
import { createMealEvidence, type CatalogFood } from "@/mealResolution/evidence"
import { createFoodSources } from "@/mealResolution/foodSources"
import { createOpenRouter } from "@openrouter/ai-sdk-provider"
import { generateText } from "ai"
import { FOOD_MODEL, providerPreferences } from "@/ai/models"

const modelId = process.argv.find(arg => arg.startsWith("--model="))?.slice("--model=".length) ?? FOOD_MODEL
const agentModel = () => ({ id: modelId, provider: "openrouter", model: createOpenRouter({ apiKey: process.env.OPENROUTER_API_KEY || process.env.OPEN_ROUTER_API_KEY }).chat(modelId,
  { provider: providerPreferences(modelId), reasoning: { effort: "low" }, usage: { include: true } }) })

type Plan = ReturnType<typeof compileMealPlan>
type Case = { messageId: number; expect: (plan: Plan, foods: Map<number, CatalogFood>) => string[] }
const named = (plan: Plan, foods: Map<number, CatalogFood>) => plan.items.map(item => ({ ...item, food: foods.get(item.foodId) }))
// Past photo logs: each check is [name pattern, label, min grams?, max grams?, min kcal?, max kcal?].
type Check = [RegExp, string, number?, number?, number?, number?]
const kcalOf = (item: ReturnType<typeof named>[number]) => (item.food?.kcalPerServing ?? 0) / (item.food?.defaultServingWeightGram || 1) * item.grams
const needs = (...checks: Check[]) => (plan: Plan, foods: Map<number, CatalogFood>) => checks.flatMap(([pattern, label, minG, maxG, minK, maxK]) => {
  const rows = named(plan, foods).filter(item => pattern.test(`${item.food?.brand ?? ""} ${item.food?.name ?? ""} ${item.food?.gtin ?? ""}`))
  if (!rows.length) return [`${label} missing`]
  const grams = rows.reduce((sum, row) => sum + row.grams, 0), kcal = rows.reduce((sum, row) => sum + kcalOf(row), 0)
  if (minG != null && grams < minG || maxG != null && grams > maxG) return [`${label} ${Math.round(grams)} g, expected ${minG ?? 0}-${maxG ?? "any"}`]
  if (minK != null && kcal < minK || maxK != null && kcal > maxK) return [`${label} ${Math.round(kcal)} kcal, expected ${minK ?? 0}-${maxK ?? "any"}`]
  return []
})
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
    return !cereal ? ["Cheerios Protein Cookies & Creme not logged"] : Math.abs(cereal.grams - 37) > 2 ? [`${cereal.grams} g, expected 37`] : [] } },
  // "40g of kelogs cereal and 140ml of 2% milk", photo of the Special K barcode.
  { messageId: 24416, expect: needs([/00038000251054|special k|chocolatey dipped/i, "Special K", 35, 45], [/milk/i, "2% milk", 125, 165]) },
  // "5 aplenty postickers", photo of the bag's label (140 kcal per 4 pieces).
  { messageId: 28030, expect: needs([/potsticker|dumpling|gyoza/i, "5 potstickers", 90, 180, 150, 200]) },
  // Terra bowl and its receipt, no text: chicken, jasmine rice, broccoli, tzatziki, yogurt dill.
  { messageId: 28264, expect: needs([/chicken/i, "chicken"], [/rice/i, "rice"], [/broccoli/i, "broccoli"], [/tzatziki|yogurt|dill/i, "sauce"]) },
  // "Fairlife strawberry high protein elite shake", label: 1 bottle 414 ml, 230 kcal.
  { messageId: 28295, expect: needs([/strawberr/i, "strawberry shake", 380, 450, 200, 260]) },
  // Spindrift can with a partial barcode, no text.
  { messageId: 28320, expect: needs([/00856579002279|spindrift|sparkling/i, "sparkling water", 300, 400]) },
  // "About 200g rice and 150g chicken ... at least 1tsp of olive oil", Terra bowl + receipt. Rice must be cooked (not dry) density.
  { messageId: 28557, expect: needs([/rice/i, "rice", 170, 230, 190, 380], [/chicken/i, "chicken", 130, 170], [/olive oil/i, "olive oil", 3, 10], [/egg/i, "egg"]) },
  // "Pasta with chicken and broccoli and 100g greek yogurt dressing".
  { messageId: 30160, expect: needs([/pasta|penne/i, "pasta"], [/chicken/i, "chicken"], [/broccoli/i, "broccoli"], [/yogurt/i, "yogurt dressing", 80, 120]) },
  // "Smoothie with 1.5 scoop protein and frozen fruits with milk and chia seeds".
  { messageId: 30268, expect: needs([/protein/i, "protein powder"], [/milk/i, "milk"], [/chia/i, "chia seeds"], [/fruit|berr|banana|mango|strawberr/i, "frozen fruit"]) },
  // Salad box with chicken, "a small portion of egg noodle pasta", bread on a plate, dressing on the side.
  { messageId: 30283, expect: needs([/noodle|pasta/i, "egg noodles"], [/chicken/i, "chicken"], [/salad|lettuce|greens|spinach|arugula/i, "salad"], [/bread|toast/i, "bread"], [/dressing|vinaigrette|vinegar|oil/i, "dressing"]) },
  // "Peach kefir lifeway 3.25%", one glass.
  { messageId: 30304, expect: needs([/kefir/i, "peach kefir", 150, 320]) },
  // No text: chicken, cucumber and gnocchi in a container.
  { messageId: 30310, expect: needs([/chicken/i, "chicken"], [/gnocchi/i, "gnocchi"], [/cucumber/i, "cucumber"]) },
  // Taylor ham egg cheese sandwich, latte, turkey patties, "about 1/2 cup of potato roasted".
  { messageId: 30314, expect: needs([/ham|pork roll|taylor/i, "ham egg cheese sandwich"], [/latte/i, "latte"], [/turkey/i, "turkey patties"], [/potato/i, "roasted potato", 50, 130]) }
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
    if (name === "enrich_catalogue_food") { if (args.p_food?.gtin) created.push(`barcode ${args.p_food.gtin} -> food ${args.p_food_id}`)
      return { abortSignal: async () => ({ data: { foodId: args.p_food_id, added: args.p_food?.gtin ? ["gtin"] : [], conflict: false }, error: null }) } }
    return realDb.rpc(name, args)
  } }
  const sources = createFoodSources({ userId: message!.userId, messageId: test.messageId, signal: controller.signal, barcodes,
    discover: id => evidence.discover(id) }, { db: guardedDb as never, enqueue: async () => {} })
  const input = { userId: message!.userId, operationId: "00000000-0000-4000-8000-00000000e000", messageId: test.messageId,
    originalText: message!.content ?? "", consumedOn: new Date(`${message!.consumedOn}Z`).toISOString(),
    submittedAt: new Date(`${message!.createdAt}Z`).toISOString(), timezone: "America/New_York", locale: null,
    attachmentIds: (photos ?? []).map(photo => photo.id), clarificationAllowed: false }
  let cost = 0
  // OpenRouter reports each step's cost; sum it across the agent's steps.
  const generate = (async options => { const result = await generateText(options)
    for (const step of result.steps ?? []) cost += Number((step.providerMetadata?.openrouter as { usage?: { cost?: number } } | undefined)?.usage?.cost ?? 0)
    return result }) as typeof generateText
  const deps = { evidence, sources, barcodes, generate, model: agentModel as never }
  const started = Date.now()
  let result = await resolveMeal(input, deps)
  let plan: Plan
  try { plan = await compileCheckedMealPlan(input, result, { secondLook: !result.checked }) }
  catch (error) {
    console.error(`  [${test.messageId}] first plan rejected: ${error instanceof Error ? error.message : error} after ${Date.now() - started} ms`)
    // The worker's single repair turn, with the validator's code.
    result = await resolveMeal({ ...input, validationErrorCode: error instanceof Error ? error.message : "invalid_plan" }, deps)
    plan = await compileCheckedMealPlan(input, result, { secondLook: false })
  }
  const problems = test.expect(plan, evidence.foods)
  return { messageId: test.messageId, pass: problems.length === 0, problems, ms: Date.now() - started, agentCostUsd: Number(cost.toFixed(4)), steps: result.steps, checked: result.checked,
    stages: Object.fromEntries(Object.entries((result.timeline ?? []).reduce<Record<string, number>>((sum, t) => ({ ...sum, [t.stage]: (sum[t.stage] ?? 0) + t.ms }), {}))), barcodes: result.barcodes,
    created, items: named(plan, evidence.foods).map(item => `${item.food?.name} ${Math.round(item.grams)}g ${item.loggedUnit} (${item.origin})`) }
}

void (async () => {
  process.on("unhandledRejection", () => {})
  const only = process.argv.slice(2).filter(arg => /^\d+$/.test(arg)).map(Number)
  let passed = 0
  for (const test of CASES.filter(test => !only.length || only.includes(test.messageId))) {
    try { const row = await run(test); if (row.pass) passed++; console.log(JSON.stringify(row)) }
    catch (error) { console.log(JSON.stringify({ messageId: test.messageId, pass: false, error: error instanceof Error ? error.message : "unknown" })) }
  }
  console.log(`\n${modelId}: ${passed} passed`)
})()
