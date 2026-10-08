// Replays real meals through the meal agent on another model, and optionally with extra prompt text, to compare steps,
// time, cost and the foods logged against what the user kept. Read-only like report-replay: catalogue writes are
// simulated, nothing is published. The fast routes are off so every meal runs the agent.
//
// DOTENV_CONFIG_PATH=.env.prod npx ts-node -T -r dotenv/config -r tsconfig-paths/register scripts/meal-model-replay.ts \
//   --model=anthropic/claude-haiku-5.5 [--effort=low] [--variant=name] [--runs=2] [--label=x] [messageIds...]
// Claude models are pinned to Anthropic on OpenRouter, get the plan schema's oneOf as anyOf (Claude's structured output
// rejects oneOf) and a prompt-cache marker on the system prompt. Prints one JSON line per run and a summary.
import { appendFileSync } from "node:fs"
import { generateText } from "ai"
import { createAdminSupabase } from "@/utils/supabase/serverAdmin"
import { resolveMeal } from "@/mealResolution/resolve"
import { compileCheckedMealPlan } from "@/mealResolution/historyCheck"
import { createMealEvidence, type CatalogFood } from "@/mealResolution/evidence"
import { createFoodSources } from "@/mealResolution/foodSources"
import { mealRunTotals, withMealRun } from "@/mealResolution/runRecorder"
import { agentOverride } from "./mealAgentOverride"

const arg = (name: string) => process.argv.find(value => value.startsWith(`--${name}=`))?.slice(name.length + 3)
const modelId = arg("model") ?? "google/gemini-3.8-flash"
const effort = arg("effort") ?? "low"
const variant = arg("variant") ?? "none"
const runs = Number(arg("runs") ?? 2)
const label = arg("label") ?? `${modelId.split("/")[1]}-${effort}-${variant}`
const out = arg("out") ?? "meal-model-replay.jsonl"
const ids = process.argv.slice(2).filter(value => /^\d+$/.test(value)).map(Number)
const meals = ids.length ? ids : [30505, 30449, 30473, 30451]

const { model, generate } = agentOverride({ modelId, effort, variant })

const db = createAdminSupabase() as any
async function read<T>(query: PromiseLike<{ data: T | null; error: { message: string } | null }>): Promise<T> {
  const { data, error } = await query
  if (error) throw new Error(error.message)
  return data as T
}
const utc = (value: string) => new Date(/(?:Z|[+-]\d\d:?\d\d)$/.test(value) ? value : `${value}Z`)
const name = (food: { name: string; brand: string | null } | undefined | null) => food ? `${food.name}${food.brand ? ` (${food.brand})` : ""}` : "?"

async function replay(messageId: number, run: number) {
  const message = await read<{ id: number; userId: string; content: string; consumedOn: string | null; createdAt: string }>(
    db.from("Message").select("id,userId,content,consumedOn,createdAt").eq("id", messageId).single())
  const [photos, user, logged] = await Promise.all([
    read<{ id: number }[]>(db.from("UserMessageImages").select("id").eq("messageId", messageId).order("id")),
    read<{ tzIdentifier: string } | null>(db.from("User").select("tzIdentifier").eq("id", message.userId).maybeSingle()),
    read<{ foodItemId: number; grams: number; FoodItem: { name: string; brand: string | null } | null }[]>(
      db.from("LoggedFoodItem").select("foodItemId,grams,FoodItem(name,brand)").eq("messageId", messageId).is("deletedAt", null).order("id"))])
  const controller = new AbortController(), created: string[] = [], tools: string[] = []
  const timezone = user?.tzIdentifier ?? "America/New_York"
  const evidence = createMealEvidence(message.userId, controller.signal, undefined, timezone), barcodes: string[] = []
  let fakeId = 900000001
  const readOnly = (table: string) => new Proxy(db.from(table), { get: (target, key) =>
    ["insert", "update", "upsert", "delete"].includes(String(key)) ? () => { throw new Error(`replay tried to write ${table}`) } : target[key] })
  const guardedDb = { from: readOnly, rpc: (rpc: string, args: any) => {
    if (rpc === "create_catalogue_food") {
      const food = args.p_food, id = fakeId++
      created.push(`${food.foodInfoSource}: ${food.name}`)
      evidence.foods.set(id, { id, name: food.name, brand: food.brand, gtin: food.gtin, description: food.source, lastUpdated: new Date().toISOString(),
        defaultServingWeightGram: food.defaultServingWeightGram, weightUnknown: false, kcalPerServing: food.kcal, proteinPerServing: food.proteinG,
        carbPerServing: food.carbG, totalFatPerServing: food.totalFatG, satFatPerServing: food.satFatG ?? null, transFatPerServing: null,
        fiberPerServing: food.fiberG ?? null, sugarPerServing: food.sugarG ?? null, addedSugarPerServing: null,
        Serving: (args.p_servings as { name: string; grams: number; amount: number }[]).map((s, i) => ({ id: id * 10 + i, foodItemId: id,
          servingName: s.name, servingWeightGram: s.grams, defaultServingAmount: s.amount })) } as CatalogFood)
      return { abortSignal: async () => ({ data: [{ food_id: id, created: true, enrichment: null }], error: null }) }
    }
    if (rpc === "enrich_catalogue_food") { created.push(`enrich ${args.p_food_id}`)
      return { abortSignal: async () => ({ data: { foodId: args.p_food_id, added: args.p_food?.gtin ? ["gtin"] : [], conflict: false }, error: null }) } }
    if (rpc === "supersede_catalogue_estimate") { created.push(`supersede ${args.p_food_id}`)
      return { abortSignal: async () => ({ data: { foodId: args.p_food_id }, error: null }) } }
    if (!/^(search_|get_cosine_results$|food_icon_candidates$)/.test(rpc)) throw new Error(`replay tried to call ${rpc}`)
    return db.rpc(rpc, args)
  } }
  const sources = createFoodSources({ userId: message.userId, messageId, signal: controller.signal, barcodes,
    discover: id => evidence.discover(id) }, { db: guardedDb as never, enqueue: async () => {} })
  const input = { userId: message.userId, operationId: "00000000-0000-4000-8000-00000000e002", messageId,
    // --text replays the meal with other words (same user, time and photos): how a wording changes the result.
    originalText: arg("text") ?? message.content ?? "", consumedOn: utc(message.consumedOn ?? message.createdAt).toISOString(),
    submittedAt: utc(message.createdAt).toISOString(), timezone, locale: null, attachmentIds: photos.map(photo => photo.id),
    clarificationAllowed: false }
  // MEAL_AGENT=sonnet|flash runs the production agent choice instead of --model (FeatureFlag.meal_agent_sonnet).
  const deps = { evidence, sources, barcodes, fastRoute: false, photoFastRoute: false,
    ...(process.env.MEAL_AGENT ? { agent: process.env.MEAL_AGENT as "sonnet" | "flash",
      // DEBUG=1 prints what the model answered when its output fails the schema.
      ...(process.env.DEBUG ? { generate: ((request: any) => { if (process.env.DEBUG === "prompt") {
        const user = request.messages.find((message: any) => message.role === "user")
        const text = typeof user?.content === "string" ? user.content : user?.content?.[0]?.text
        try { const prompt = JSON.parse(text); console.error("prompt", JSON.stringify({ mentionedFoods: prompt.mentionedFoods,
          lockedProducts: prompt.lockedProducts?.map((food: any) => food.name), prefetched: prompt.prefetchedFoods?.map((food: any) => `${food.id} ${food.name}`) }, null, 1)) } catch {} }
        return generateText(request).catch((error: any) => {
        console.error("generate_failed", String(error?.cause ?? "").slice(0, 1500), "\n--- text:", String(error?.text ?? "").slice(0, 4000))
        throw error }) }) as typeof generateText } : {}) } : { model, generate }),
    onTool: (tool: string) => { tools.push(tool) } }
  const started = Date.now()
  const base = { label, model: modelId, effort, variant, messageId, run, text: arg("text") ?? message.content,
    kept: logged.map(item => `${item.foodItemId} ${name(item.FoodItem)} ${Math.round(item.grams)} g`) }
  try {
    const { value: { result, plan, retried }, run: recorded } = await withMealRun(async () => {
      let result = await resolveMeal(input, deps), retried = false
      try { return { result, plan: await compileCheckedMealPlan(input, result, { secondLook: !result.checked }), retried } }
      catch (error) {
        retried = true
        result = await resolveMeal({ ...input, validationErrorCode: error instanceof Error ? error.message : "invalid_plan" }, deps)
        return { result, plan: await compileCheckedMealPlan(input, result, { secondLook: false }), retried }
      }
    })
    const totals = mealRunTotals(recorded)
    const keptIds = new Set(logged.map(item => item.foodItemId))
    return { ...base, ms: Date.now() - started, steps: result.steps, toolCalls: result.toolCalls, retried, costUsd: totals.costUsd,
      tools, created,
      now: plan.items.map(item => `${item.foodId} ${name(evidence.foods.get(item.foodId))} ${Math.round(item.grams)} g`),
      stages: Object.entries((result.timeline ?? []).reduce<Record<string, number>>((sum, t) => ({ ...sum, [t.stage]: (sum[t.stage] ?? 0) + t.ms }), {})).map(([k, v]) => `${k} ${v}`).join(", "),
      // What the agent did with each mention: its items, or omitted (with why, in its evidence).
      components: result.proposal.components.map(component => `${component.sourceText} -> ${component.omitted ? "omitted" : component.itemIndexes.join(",")}`),
      sameFoods: plan.items.length === keptIds.size && plan.items.every(item => keptIds.has(item.foodId)) }
  } catch (error) {
    return { ...base, ms: Date.now() - started, tools, error: error instanceof Error ? error.message.slice(0, 200) : "unknown" }
  } finally { controller.abort() }
}

void (async () => {
  process.on("unhandledRejection", () => {})
  const rows: any[] = []
  // Meals in order, runs back to back: a second run of the same meal reads a warm prompt cache, as a busy hour would.
  for (const id of meals) for (let run = 1; run <= runs; run++) {
    const row = await replay(id, run); rows.push(row)
    console.log(JSON.stringify(row)); appendFileSync(out, JSON.stringify(row) + "\n")
  }
  const ok = rows.filter(row => !row.error)
  const mean = (values: number[]) => values.length ? values.reduce((a, b) => a + b, 0) / values.length : NaN
  console.error(JSON.stringify({ label, runs: rows.length, errors: rows.length - ok.length,
    meanSeconds: +(mean(ok.map(row => row.ms)) / 1000).toFixed(1), meanSteps: +mean(ok.map(row => row.steps)).toFixed(1),
    meanCostUsd: +mean(ok.map(row => row.costUsd ?? 0)).toFixed(4), totalCostUsd: +ok.reduce((s, row) => s + (row.costUsd ?? 0), 0).toFixed(4),
    sameFoods: ok.filter(row => row.sameFoods).length }))
})()
