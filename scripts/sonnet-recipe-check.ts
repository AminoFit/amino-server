// Does the Sonnet meal agent log the owner's saved recipes only when they mean them, without the Jev guards? Runs the
// production agent (agent "sonnet") on the owner's real catalogue, recipes and history, read-only (food creation is
// simulated), compiles the plan WITHOUT compileCheckedMealPlan's history and recipe guards, then reports what the guards
// would have said. Text cases are new wordings; photo cases are the owner's past photo meals that only resemble a recipe.
// Run with production read credentials: npm run -s run:ts-node-prod -- scripts/sonnet-recipe-check.ts [caseId...]
import { createAdminSupabase } from "@/utils/supabase/serverAdmin"
import { resolveMeal } from "@/mealResolution/resolve"
import { compileMealPlan } from "@/mealResolution/compile"
import { compileCheckedMealPlan } from "@/mealResolution/historyCheck"
import { createMealEvidence } from "@/mealResolution/evidence"
import { createFoodSources } from "@/mealResolution/foodSources"
import { generateText } from "ai"

const OWNER = "6b005b82-88a5-457b-a1aa-60ecb1e90e21"
const R = { pastaSauce: 15315, beefBroccoli: 15384, noodleSoup: 15371, fajitaBase: 15408 }
const RECIPES = new Set<number>([15315, 15359, 15369, 15370, 15371, 15384, 15408])

/** expect: this recipe must be logged. avoid: no recipe may be logged (a question back is fine). either: report only. */
type Case = { id: string; text?: string; messageId?: number; expect?: number; avoid?: true; either?: true }
const CASES: Case[] = [
  // The meal that went wrong (30774), as sent.
  { id: "fajita_30774", messageId: 30774, expect: R.fajitaBase },
  { id: "usual_fajita", text: "my usual fajitas base in 2 mission flour tortillas", expect: R.fajitaBase },
  { id: "es_fajita", text: "una porción de mi base de fajitas de siempre con tortillas", expect: R.fajitaBase },
  { id: "fr_beef_broccoli", text: "une portion de mon bœuf brocoli maison", expect: R.beefBroccoli },
  { id: "half_sauce", text: "half a portion of my chicken pasta sauce on 100g cooked penne", expect: R.pastaSauce },
  { id: "de_soup", text: "meine Rindernudelsuppe von neulich, eine Portion", expect: R.noodleSoup },
  // Shared words that are not the recipe.
  { id: "restaurant_fajitas", text: "chicken fajitas at a Tex-Mex restaurant, with rice and beans", avoid: true },
  { id: "seasoning_packet", text: "2 tsp Old El Paso fajita seasoning on 150g grilled chicken", avoid: true },
  { id: "panda_beef_broccoli", text: "beef and broccoli from Panda Express", avoid: true },
  { id: "restaurant_pasta", text: "a plate of pasta at an Italian restaurant, about 2 cups", avoid: true },
  { id: "grilled_chicken_broccoli", text: "grilled chicken breast with broccoli and a cup of rice", avoid: true },
  // Judgement call: they make fajita base often, so either answer is defensible.
  { id: "fajitas_dinner", text: "fajitas for dinner", either: true },
  // Past photo meals that only resemble a recipe.
  { id: "photo_pasta_broccoli", messageId: 30160, avoid: true },
  { id: "photo_egg_noodles", messageId: 30283, avoid: true },
  { id: "photo_tortilla", messageId: 30364, avoid: true }
]

async function run(test: Case) {
  const db = createAdminSupabase() as any
  const message = test.messageId
    ? (await db.from("Message").select("id,content,consumedOn,createdAt").eq("id", test.messageId).single()).data
    : null
  const photos = test.messageId
    ? (await db.from("UserMessageImages").select("id").eq("messageId", test.messageId).order("id")).data ?? [] : []
  const controller = new AbortController()
  const evidence = createMealEvidence(OWNER, controller.signal), barcodes: string[] = [], created: string[] = []
  let fakeId = 900000001
  // Real sources; only catalogue writes are simulated.
  const guardedDb = { from: (table: string) => db.from(table), rpc: (name: string, args: any) => {
    if (name === "create_catalogue_food") {
      const food = args.p_food, id = fakeId++
      created.push(`${food.name} ${food.defaultServingWeightGram}g ${food.kcal}kcal`)
      evidence.foods.set(id, { id, name: food.name, brand: food.brand, gtin: food.gtin, description: food.source,
        lastUpdated: new Date().toISOString(), defaultServingWeightGram: food.defaultServingWeightGram, weightUnknown: false,
        kcalPerServing: food.kcal, proteinPerServing: food.proteinG, carbPerServing: food.carbG, totalFatPerServing: food.totalFatG,
        satFatPerServing: food.satFatG ?? null, transFatPerServing: null, fiberPerServing: food.fiberG ?? null,
        sugarPerServing: food.sugarG ?? null, addedSugarPerServing: null,
        Serving: (args.p_servings as { name: string; grams: number; amount: number }[]).map((s, i) => ({ id: id * 10 + i,
          foodItemId: id, servingName: s.name, servingWeightGram: s.grams, defaultServingAmount: s.amount })) })
      return { abortSignal: async () => ({ data: [{ food_id: id, created: true, enrichment: null }], error: null }) }
    }
    if (name === "enrich_catalogue_food")
      return { abortSignal: async () => ({ data: { foodId: args.p_food_id, added: [], conflict: false }, error: null }) }
    return db.rpc(name, args)
  } }
  const sources = createFoodSources({ userId: OWNER, messageId: test.messageId ?? 0, signal: controller.signal, barcodes,
    discover: id => evidence.discover(id) }, { db: guardedDb as never, enqueue: async () => {} })
  const now = new Date().toISOString()
  const input = { userId: OWNER, operationId: "00000000-0000-4000-8000-00000000e001", messageId: test.messageId ?? 0,
    originalText: test.text ?? message?.content ?? "",
    consumedOn: message ? new Date(`${message.consumedOn}Z`).toISOString() : now,
    submittedAt: message ? new Date(`${message.createdAt}Z`).toISOString() : now,
    timezone: "America/New_York", locale: null, attachmentIds: photos.map((photo: { id: number }) => photo.id),
    clarificationAllowed: true }
  let cost = 0
  const generate = (async options => { const result = await generateText(options)
    for (const step of result.steps ?? []) cost += Number((step.providerMetadata?.openrouter as { usage?: { cost?: number } } | undefined)?.usage?.cost ?? 0)
    return result }) as typeof generateText
  const started = Date.now()
  const result = await resolveMeal(input as never, { evidence, sources, barcodes, generate, agent: "sonnet", photoFastRoute: false })
  if (result.proposal.outcome !== "resolved")
    return { id: test.id, outcome: result.proposal.outcome, clarification: result.proposal.clarification,
      pass: !test.expect, ms: Date.now() - started, costUsd: Number(cost.toFixed(3)) }
  const plan = compileMealPlan(input as never, result)
  const ids = plan.items.map(item => item.foodId)
  const recipes = ids.filter(id => RECIPES.has(id))
  // What the production guards would have done with this plan.
  const guards = await compileCheckedMealPlan(input as never, result, { secondLook: false })
    .then(() => "pass", error => error instanceof Error ? error.message : "rejected")
  const pass = test.either ? true : test.expect ? recipes.includes(test.expect) : recipes.length === 0
  return { id: test.id, pass, guards, recipes,
    items: plan.items.map(item => `${evidence.foods.get(item.foodId)?.name ?? item.foodId} ${Math.round(item.grams)}g (${item.servingAmount} ${item.loggedUnit}, ${item.origin})`),
    created, ms: Date.now() - started, costUsd: Number(cost.toFixed(3)) }
}

void (async () => {
  process.on("unhandledRejection", () => {})
  const only = process.argv.slice(2)
  const queue = CASES.filter(test => !only.length || only.includes(test.id)), rows: Record<string, any>[] = []
  await Promise.all(Array.from({ length: 3 }, async () => {
    for (let test = queue.shift(); test; test = queue.shift()) {
      const row = await run(test).catch(error => ({ id: test!.id, pass: false, error: error instanceof Error ? error.message : "unknown" }))
      rows.push(row); console.log(JSON.stringify(row))
    }
  }))
  const cost = rows.reduce((sum, row) => sum + (row.costUsd ?? 0), 0)
  console.log(`\n${rows.filter(row => row.pass).length}/${rows.length} passed, agent cost $${cost.toFixed(2)}`)
})()
