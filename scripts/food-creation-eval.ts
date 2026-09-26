// Compares models for the food-creation step (cited web search -> nutrition record)
// against USDA FoodData Central label facts, which the model never sees.
// Reads USDA only; makes no database writes.
// Run: npx ts-node -T -r tsconfig-paths/register scripts/food-creation-eval.ts [model...]
import { getUsdaFoodsInfo } from "@/FoodDbThirdPty/USDA/getFoodInfo"
import { requestWebFood } from "@/foodResolution/webFood"
import { createFoodSources, type SourceFood } from "@/mealResolution/foodSources"

// Well-known US branded products, identified by USDA FDC id.
const FDC_IDS = [1624894, 2310555, 2613468, 1897255, 2212208, 1450115, 2178367, 2489939, 2088080, 1330840,
  1459063, 2234560, 1641545, 2140421, 2235098, 2610081, 2238398, 1646847, 2107431, 2124682]
// Ground truth from the user's own label photo (not in USDA's index).
const EXTRA = [{ name: "Cheerios Protein Cookies & Crème Cereal", brand: "Cheerios", grams: 37, kcal: 150, proteinG: 8, carbG: 24, totalFatG: 2.5 }]

type Truth = { name: string; brand: string | null; grams: number; kcal: number; proteinG: number; carbG: number; totalFatG: number }
const per100 = (value: number, grams: number) => value * 100 / grams
const close = (a: number, b: number) => Math.abs(a - b) <= Math.max(1.5, 0.1 * Math.max(a, b))
function matches(food: SourceFood, truth: Truth) {
  const keys = [["kcal", "kcal"], ["proteinG", "proteinG"], ["carbG", "carbG"], ["totalFatG", "totalFatG"]] as const
  return keys.every(([f, t]) => close(per100(food[f], food.defaultServingWeightGram), per100(truth[t], truth.grams))) &&
    Math.abs(per100(food.kcal, food.defaultServingWeightGram) - per100(truth.kcal, truth.grams)) <= Math.max(10, 0.08 * per100(truth.kcal, truth.grams))
}

// The USDA helper fires an unawaited usage write (no database here) and logs verbosely.
process.on("unhandledRejection", () => {})

async function truths(): Promise<Truth[]> {
  const log = console.log
  console.log = () => {}
  const details = await getUsdaFoodsInfo({ fdcIds: FDC_IDS.map(String) }).finally(() => { console.log = log }) ?? []
  return [...details.flatMap(food => food.defaultServingWeightGram && !food.weightUnknown ? [{ name: food.name, brand: food.brand || null,
    grams: food.defaultServingWeightGram, kcal: food.kcalPerServing, proteinG: food.proteinPerServing, carbG: food.carbPerServing,
    totalFatG: food.totalFatPerServing }] : []), ...EXTRA]
}

async function evaluate(model: string, truth: Truth) {
  let cost = 0
  const empty = { rpc: () => ({ abortSignal: async () => ({ data: [], error: null }) }) }
  const sources = createFoodSources({ userId: "eval", messageId: 0, signal: new AbortController().signal, discover() {} }, {
    db: empty as never, embed: async (_m, texts) => texts.map((text, id) => ({ id, embedding: [], text })),
    usda: async () => [], usdaSearch: async () => [], model,
    web: async (system, prompt, _user, options) => {
      const { parsed } = await requestWebFood(system, prompt, options?.model)
      cost += parsed.costUsd ?? 0
      return parsed
    } })
  const started = Date.now()
  const { candidates } = await sources.searchFoodSources(truth.brand ? `${truth.brand} ${truth.name}` : truth.name)
  const foods = candidates.map(c => sources.sources.get(c.sourceId)!).filter(Boolean)
  const outcome = !foods.length ? "declined" : matches(foods[0], truth) ? "correct" :
    foods.some(food => matches(food, truth)) ? "correct_not_first" : "wrong"
  return { model, product: truth.name.slice(0, 50), outcome, ms: Date.now() - started, costUsd: Math.round(cost * 10000) / 10000,
    got: foods[0] ? `${foods[0].defaultServingWeightGram}g ${foods[0].kcal}kcal` : null, want: `${truth.grams}g ${truth.kcal}kcal`,
    source: foods[0]?.source ?? null }
}

async function main() {
  const models = process.argv.slice(2).length ? process.argv.slice(2) : ["google/gemini-3.8-flash", "anthropic/claude-sonnet-5", "anthropic/claude-opus-5"]
  const cases = await truths()
  const rows: Awaited<ReturnType<typeof evaluate>>[] = []
  const queue = models.flatMap(model => cases.map(truth => ({ model, truth })))
  await Promise.all(Array.from({ length: 3 }, async () => {
    for (let job = queue.shift(); job; job = queue.shift()) {
      try { rows.push(await evaluate(job.model, job.truth)) }
      catch (error) { rows.push({ model: job.model, product: job.truth.name.slice(0, 50), outcome: "error", ms: 0, costUsd: 0, got: null,
        want: "", source: error instanceof Error ? error.message.slice(0, 80) : "unknown" }) }
    }
  }))
  for (const row of rows.sort((a, b) => a.product.localeCompare(b.product) || a.model.localeCompare(b.model))) console.log(JSON.stringify(row))
  console.log(`\n${cases.length} products`)
  for (const model of models) {
    const mine = rows.filter(row => row.model === model), ms = mine.map(row => row.ms).filter(Boolean).sort((a, b) => a - b)
    const count = (outcome: string) => mine.filter(row => row.outcome === outcome).length
    console.log(`${model.padEnd(28)} correct ${count("correct")}  correct_not_first ${count("correct_not_first")}  wrong ${count("wrong")}  declined ${count("declined")}  error ${count("error")}  median ${ms[Math.floor(ms.length / 2)] ?? 0} ms  cost $${mine.reduce((sum, row) => sum + row.costUsd, 0).toFixed(3)}`)
  }
}
void main()
