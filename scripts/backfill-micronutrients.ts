// Backfills vitamins and minerals (docs/micronutrients-plan.md in amino-mobile). The owner's foods and the most-logged
// shared foods get the micronutrients their sources have, only where a food has none of a nutrient; then the logged
// items of those foods get theirs. Every fill is recorded (FoodMicroFill, LoggedFoodItemMicroFill) so it can be undone.
//
//   --user <uuid>        whose foods and log (required)
//   --popular <n>        also the n most-logged shared foods (default 100)
//   --plan               counts and an estimate only: no model calls, no writes (the default)
//   --apply              do it
//   --limit <n>          at most n foods looked up (a trial run)
//   --foods-only         skip the logged items
//   --items-only         only the logged items (no lookups: from the foods' rows as they are now)
//   --export <file> --ids <a,b,…>   write those foods with their USDA candidates, for judging by hand (or by Claude)
//   --matches <file>     apply judged matches: [{"foodId": 1, "fdcId": 2345}] (fdcId null for none)
//   --correct            generic foods: replace a vitamin or mineral more than 2x off its USDA match (or 0 where USDA has
//                        a real amount), then recompute those nutrients on the owner's logs (previous values recorded)
//
// Routes, by food: its own USDA record (by its FDC ID); its barcode (USDA, Open Food Facts, the shops' pages); a
// branded food without a barcode: USDA's branded record when Jev is sure it's the same product; a generic food: USDA's
// Foundation, SR Legacy or survey food when Jev is sure it's the same food in the same state. Recipes recompute from
// their ingredients. The user's own typed foods stay as typed.
import { readFileSync, writeFileSync } from "node:fs"
import { Client } from "pg"
import { selectWithJev } from "@/ai/jev"
import { FOOD_MODEL, providerPreferences } from "@/ai/models"
import { getUsdaFoodsInfo } from "@/FoodDbThirdPty/USDA/getFoodInfo"
import { createFoodSources } from "@/mealResolution/foodSources"
import { MICRO_KEYS, inKeyUnit, keyUnit, microRows, microsFrom, nutrientKey, scaleMicros, type Micros, type NutrientKey } from "@/foodResolution/micronutrients"
import { nutrientsAt, recipeValues } from "@/userFoods/nutrition"

// The backfill has its own USDA key, so it never eats into production's hourly quota (this process only).
if (process.env.USDA_SECOND_API_KEY) process.env.USDA_API_KEY = process.env.USDA_SECOND_API_KEY
const args = process.argv.slice(2)
const option = (name: string) => { const at = args.indexOf(`--${name}`); return at >= 0 ? args[at + 1] : undefined }
const userId = option("user"), popularCount = Number(option("popular") ?? 100), limit = Number(option("limit") ?? Infinity)
const apply = args.includes("--apply"), foodsOnly = args.includes("--foods-only"), itemsOnly = args.includes("--items-only")
if (!userId || !/^[0-9a-f-]{36}$/.test(userId)) throw new Error("--user <uuid> is required")

type NutrientRow = { nutrientName: string; nutrientUnit: string | null; nutrientAmountPerDefaultServing: number }
type Food = { id: number; name: string; brand: string | null; gtin: string | null; externalId: string | null; foodInfoSource: string
  defaultServingWeightGram: number | null; weightUnknown: boolean | null; kcalPerServing: number | null; proteinPerServing: number | null
  carbPerServing: number | null; totalFatPerServing: number | null; privateToUserId: string | null; recipePortions: number | null
  Nutrient: NutrientRow[] }
type Route = "full" | "own" | "no_basis" | "recipe" | "usda_record" | "barcode" | "usda_branded" | "usda_generic"

/** A food with these already has a full profile: nothing to look up. */
const CORE: NutrientKey[] = ["magnesiumMg", "potassiumMg", "zincMg", "vitaminB6Mg", "calciumMg", "ironMg"]
const GENERIC_POLICY = `Is one of the USDA foods the same food as ours, in the same state? Same food and the same form:
raw vs cooked, dried vs fresh, with or without skin, drained vs packed in liquid, whole vs skim, plain vs flavoured. A close
cousin is not the same food (a nectarine is not a peach, white rice is not brown rice, a fried egg is not a boiled egg).
Calories per 100 g should be close. Choose none unless you are sure.`
const BRANDED_POLICY = `Is one of the USDA branded records exactly our product? Same brand, product, flavour, variant and
form; calories per 100 g close. A sibling flavour or size is not the same product. Choose none unless you are sure.`

const finite = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value)
const have = (food: Food) => new Set(food.Nutrient.map(row => nutrientKey(row.nutrientName)).filter(Boolean) as NutrientKey[])
const kcalPerGram = (food: Food) => food.defaultServingWeightGram ? (food.kcalPerServing ?? 0) / food.defaultServingWeightGram : null

function routeOf(food: Food): Route {
  if (!food.defaultServingWeightGram || food.defaultServingWeightGram <= 0 || food.weightUnknown) return "no_basis"
  if (food.recipePortions != null) return "recipe"
  if (food.foodInfoSource === "User") return "own"
  if (CORE.every(key => have(food).has(key))) return "full"
  if (food.foodInfoSource === "USDA" && /^\d+$/.test(food.externalId ?? "")) return "usda_record"
  if (food.gtin) return "barcode"
  return food.brand?.trim() ? "usda_branded" : "usda_generic"
}

/** How far apart two foods' calories per gram are, as a fraction (0 when both are under 0.5 kcal/g); null if unknown. */
function kcalGap(food: Food, sourceKcal: number, sourceGrams: number) {
  const ours = kcalPerGram(food), theirs = sourceGrams > 0 ? sourceKcal / sourceGrams : null
  if (ours == null || theirs == null) return null
  if (ours < 0.5 && theirs < 0.5) return 0
  return Math.abs(ours - theirs) / Math.max(ours, theirs)
}
/** Calories per gram that agree (within 35%): the source describes this food. */
const agrees = (food: Food, sourceKcal: number, sourceGrams: number) => (kcalGap(food, sourceKcal, sourceGrams) ?? 1) <= 0.35

/** USDA's search is keyword-based and weak on one word ("rice" finds rice cakes): Flash writes two USDA-style
 * descriptions from the name and its calories ("Rice, white, cooked"), searched with the name itself. */
async function usdaQueries(food: Food): Promise<string[]> {
  const key = process.env.OPENROUTER_API_KEY || process.env.OPEN_ROUTER_API_KEY
  const per100 = kcalPerGram(food) == null ? null : Math.round(kcalPerGram(food)! * 100)
  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", { method: "POST", signal: AbortSignal.timeout(20_000),
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({ model: FOOD_MODEL, provider: providerPreferences(FOOD_MODEL), max_tokens: 300, reasoning: { effort: "low", exclude: true },
      response_format: { type: "json_schema", json_schema: { name: "queries", strict: true, schema: { type: "object", additionalProperties: false,
        required: ["queries"], properties: { queries: { type: "array", items: { type: "string" } } } } } },
      messages: [{ role: "user", content: `Food: ${JSON.stringify(food.name)}${per100 != null ? `, ${per100} kcal per 100 g` : ""}. ` +
        "Write two USDA FoodData Central style descriptions to search for it (for example \"Rice, white, long-grain, cooked\", " +
        "\"Milk, reduced fat, 2%\"), using the calories to tell raw from cooked or dried. JSON {\"queries\": [two strings]}." }] }) })
  if (!response.ok) { await response.body?.cancel(); return [food.name] }
  try {
    const queries = JSON.parse((await response.json()).choices?.[0]?.message?.content ?? "{}").queries
    return [...new Set([...(Array.isArray(queries) ? queries.filter((q: unknown) => typeof q === "string").slice(0, 2) : []), food.name])]
  } catch { return [food.name] }
}

// A USDA key allows 3,600 requests an hour: at most one per 1.2 s (2.6 s on production's key).
let usdaNext = 0
async function usdaTurn() {
  const wait = usdaNext - Date.now()
  usdaNext = Math.max(Date.now(), usdaNext) + (process.env.USDA_SECOND_API_KEY ? 1200 : 2600)
  if (wait > 0) await new Promise(resolve => setTimeout(resolve, wait))
}

/** USDA calls wait out the hourly limit (429): a minute at a time, at most 15 times. */
async function patiently<T>(call: () => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try { return await call() } catch (error) {
      if (attempt >= 15 || !String(error instanceof Error ? error.message : error).includes("429")) throw error
      console.log("  (USDA limit reached: waiting a minute)")
      await new Promise(resolve => setTimeout(resolve, 60_000))
    }
  }
}

async function searchUsda(query: string, dataType: string) {
  return patiently(() => searchUsdaOnce(query, dataType))
}
async function searchUsdaOnce(query: string, dataType: string) {
  await usdaTurn()
  // POST: USDA's front end rejects some plain GET queries (a bare "Cookie" gets an nginx 400).
  const url = new URL("https://api.nal.usda.gov/fdc/v1/foods/search")
  url.search = new URLSearchParams({ api_key: process.env.USDA_API_KEY ?? "" }).toString()
  const response = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, signal: AbortSignal.timeout(10_000),
    body: JSON.stringify({ query: query.slice(0, 120), dataType: dataType.split(","), pageSize: 5 }) })
  if (!response.ok) { await response.body?.cancel(); throw new Error(`usda_search_${response.status}`) }
  const hits = ((await response.json()).foods ?? []) as { fdcId: number; description: string; dataType: string; brandOwner?: string
    brandName?: string; foodNutrients?: { nutrientName: string; unitName: string; value: number }[] }[]
  return hits.map(hit => ({ fdcId: hit.fdcId, description: hit.description, dataType: hit.dataType,
    brand: hit.brandName ?? hit.brandOwner ?? null,
    kcalPer100g: hit.foodNutrients?.find(n => n.nutrientName.startsWith("Energy") && n.unitName === "KCAL")?.value ?? null }))
}

let jevCost = 0, jevCalls = 0, webLookups = 0
/** USDA's candidates for a food: its branded records, or the generic foods for its name and Flash's descriptions. */
async function candidatesFor(food: Food, branded: boolean) {
  const searches = branded ? [searchUsda(`${food.brand} ${food.name}`, "Branded"), searchUsda(food.name, "Branded")]
    : (await usdaQueries(food)).map(query => searchUsda(query, "Foundation,SR Legacy,Survey (FNDDS)"))
  const seen = new Set<number>()
  return (await Promise.all(searches.map(search => search.catch(() => [])))).flat()
    .filter(hit => !seen.has(hit.fdcId) && seen.add(hit.fdcId)).slice(0, 12)
}

/** USDA's record for a food, chosen by Jev among the search hits; its micronutrients per the food's own serving. */
async function usdaMatch(food: Food, branded: boolean): Promise<{ micros: Micros; source: string } | null> {
  const hits = await candidatesFor(food, branded)
  if (!hits.length) return null
  const options: Record<string, unknown> = { none: null }, criteria: Record<string, string> = { none: "None is the same food." }
  for (const hit of hits) { options[`usda_${hit.fdcId}`] = hit.fdcId; criteria[`usda_${hit.fdcId}`] = `USDA ${hit.dataType} food ${hit.fdcId}.` }
  const ours = kcalPerGram(food)
  jevCalls++
  const decision = await selectWithJev({ options, state: {
    ours: { name: food.name, brand: food.brand, kcalPer100g: ours == null ? null : Math.round(ours * 1000) / 10 },
    usda: hits.map(hit => ({ id: `usda_${hit.fdcId}`, description: hit.description, brand: hit.brand, kcalPer100g: hit.kcalPer100g })) },
    questions: { selection: { type: "choice", instructions: branded ? BRANDED_POLICY : GENERIC_POLICY, criteria } } },
    AbortSignal.timeout(30_000))
  jevCost += decision.costUsd ?? 0
  if (!(decision.status === "ok" && decision.choice?.startsWith("usda_"))) return null
  // Sure (0.9), or fairly sure with calories within 20% (two equally right records split Jev's confidence: kiwi).
  const confidence = decision.confidence ?? 0, chosen = hits.find(hit => `usda_${hit.fdcId}` === decision.choice)
  const gap = chosen?.kcalPer100g != null ? kcalGap(food, chosen.kcalPer100g, 100) : null
  if (!(confidence >= 0.9 || (!branded && confidence >= 0.65 && gap != null && gap <= 0.2))) return null
  return usdaRecord(food, decision.choice.slice(5))
}

async function usdaRecord(food: Food, fdcId: string): Promise<{ micros: Micros; source: string } | null> {
  const [record] = (await patiently(async () => { await usdaTurn(); return getUsdaFoodsInfo({ fdcIds: [fdcId] }) })) ?? []
  const grams = record?.defaultServingWeightGram
  // Some Foundation records have no energy value: their macros give it.
  const kcal = record?.kcalPerServing || 4 * (record?.proteinPerServing ?? 0) + 4 * (record?.carbPerServing ?? 0) + 9 * (record?.totalFatPerServing ?? 0)
  if (!record || !grams || !agrees(food, kcal, grams)) return null
  const rows = ((record as unknown as { Nutrient?: NutrientRow[] }).Nutrient ?? [])
  const micros = microsFrom(rows.map(row => ({ name: row.nutrientName, amount: row.nutrientAmountPerDefaultServing, unit: row.nutrientUnit })))
  return { micros: scaleMicros(micros, food.defaultServingWeightGram! / grams), source: `USDA FoodData Central ${fdcId}` }
}

async function barcodeMatch(food: Food): Promise<{ micros: Micros; source: string } | null> {
  const sources = createFoodSources({ userId: userId!, messageId: null, signal: AbortSignal.timeout(90_000), discover: () => {}, barcodes: [food.gtin!] })
  webLookups++
  const lookup = await sources.barcodeProduct(food.gtin!)
  const found = lookup.foods.find(candidate => candidate.micros && Object.keys(candidate.micros).length && agrees(food, candidate.kcal, candidate.defaultServingWeightGram))
  return found ? { micros: scaleMicros(found.micros!, food.defaultServingWeightGram! / found.defaultServingWeightGram), source: found.source } : null
}

async function main() {
  const pg = new Client({ connectionString: process.env.SUPABASE_PG_URI })
  await pg.connect()
  const mine = (await pg.query(`SELECT DISTINCT "foodItemId" AS id FROM "LoggedFoodItem" WHERE "userId" = $1 AND "deletedAt" IS NULL
    UNION SELECT id FROM "FoodItem" WHERE "privateToUserId" = $1`, [userId])).rows.map(row => Number(row.id))
  const popular = (await pg.query(`SELECT l."foodItemId" AS id, count(*) AS n FROM "LoggedFoodItem" l JOIN "FoodItem" f ON f.id = l."foodItemId"
    WHERE l."deletedAt" IS NULL AND f."privateToUserId" IS NULL AND f."archivedAt" IS NULL AND NOT (l."foodItemId" = ANY($1::int[]))
    GROUP BY 1 ORDER BY n DESC LIMIT $2`, [mine, popularCount])).rows.map(row => Number(row.id))
  const loadFoods = async (ids: number[]) => (await pg.query(`SELECT f.id, f.name, f.brand, f.gtin, f."externalId", f."foodInfoSource",
    f."defaultServingWeightGram", f."weightUnknown", f."kcalPerServing", f."proteinPerServing", f."carbPerServing", f."totalFatPerServing",
    f."privateToUserId", f."recipePortions",
    coalesce((SELECT json_agg(json_build_object('nutrientName', n."nutrientName", 'nutrientUnit', n."nutrientUnit",
      'nutrientAmountPerDefaultServing', n."nutrientAmountPerDefaultServing")) FROM "Nutrient" n WHERE n."foodItemId" = f.id), '[]') AS "Nutrient"
    FROM "FoodItem" f WHERE f.id = ANY($1::int[])`, [ids])).rows.map(row => ({ ...row,
      // numeric columns arrive as strings
      recipePortions: row.recipePortions == null ? null : Number(row.recipePortions) })) as Food[]
  const sources0 = createFoodSources({ userId: userId!, messageId: null, signal: AbortSignal.timeout(3_600_000), discover: () => {} })
  // Judging by hand: export candidates, or apply judged matches.
  if (option("export")) {
    const ids = (option("ids") ?? "").split(",").map(Number).filter(Boolean)
    const out = []
    for (const food of await loadFoods(ids)) {
      const branded = !!food.brand?.trim() && routeOf(food) !== "usda_generic"
      const per = kcalPerGram(food)
      out.push({ foodId: food.id, name: food.name, brand: food.brand, servingGrams: food.defaultServingWeightGram,
        kcalPer100g: per == null ? null : Math.round(per * 1000) / 10,
        candidates: await candidatesFor(food, branded).catch(() => []) })
    }
    writeFileSync(option("export")!, JSON.stringify(out, null, 1))
    console.log(`exported ${out.length} foods`)
    await pg.end(); return
  }
  if (option("matches")) {
    const matches = JSON.parse(readFileSync(option("matches")!, "utf8")) as { foodId: number; fdcId: number | null }[]
    const byId = new Map((await loadFoods(matches.map(match => match.foodId))).map(food => [food.id, food]))
    let filled = 0, refused = 0
    for (const match of matches) {
      const food = byId.get(match.foodId)
      if (!food || !match.fdcId) continue
      const found = await usdaRecord(food, String(match.fdcId)).catch(() => null)
      if (!found) { refused++; console.log(`  ? ${food.id} ${food.name}: USDA ${match.fdcId} refused (calories disagree)`); continue }
      const owned = have(food)
      const missing = Object.fromEntries(Object.entries(found.micros).filter(([key]) => !owned.has(key as NutrientKey))) as Micros
      const added = Object.keys(missing).length ? await sources0.fillMicros(food.id, { defaultServingWeightGram: food.defaultServingWeightGram!, micros: missing }) : 0
      if (added) {
        await pg.query(`INSERT INTO "FoodMicroFill"("foodItemId", keys, source) VALUES ($1, $2, $3)`, [food.id, Object.keys(missing), `${found.source} (judged)`])
        filled++
        console.log(`  + ${food.id} ${food.name}: ${added} from ${found.source}`)
      }
    }
    console.log(`matches: ${filled} filled, ${refused} refused`)
    await pg.end(); return
  }
  const foods = await loadFoods([...mine, ...popular])
  if (args.includes("--correct")) { await correct(pg, foods, sources0); await pg.end(); return }
  // The rest after a first pass: USDA-record foods retried; generic and branded foods exported for judging.
  if (args.includes("--remaining")) {
    const filled = new Set((await pg.query(`SELECT DISTINCT "foodItemId" FROM "FoodMicroFill"`)).rows.map(row => Number(row.foodItemId)))
    const open = foods.filter(food => !filled.has(food.id))
    const lacksCore = (food: Food) => !CORE.every(key => have(food).has(key))
    const records = open.filter(food => routeOf(food) === "usda_record" && lacksCore(food))
    const judge = open.filter(food => (routeOf(food) === "usda_generic" && lacksCore(food)) ||
      (routeOf(food) === "usda_branded" && have(food).size < 3))
    console.log(`remaining: ${records.length} USDA records to retry, ${judge.length} foods to judge`)
    if (!apply) { await pg.end(); return }
    let retried = 0
    for (const food of records) {
      const found = await usdaRecord(food, food.externalId!).catch(() => null)
      const owned = have(food)
      const missing = found ? Object.fromEntries(Object.entries(found.micros).filter(([key]) => !owned.has(key as NutrientKey))) as Micros : {}
      if (!Object.keys(missing).length) continue
      if (await sources0.fillMicros(food.id, { defaultServingWeightGram: food.defaultServingWeightGram!, micros: missing })) {
        await pg.query(`INSERT INTO "FoodMicroFill"("foodItemId", keys, source) VALUES ($1, $2, $3)`, [food.id, Object.keys(missing), found!.source])
        retried++
      }
    }
    console.log(`records: ${retried} filled`)
    const out = []
    for (const food of judge) {
      const per = kcalPerGram(food)
      out.push({ foodId: food.id, name: food.name, brand: food.brand, servingGrams: food.defaultServingWeightGram,
        kcalPer100g: per == null ? null : Math.round(per * 1000) / 10,
        candidates: await candidatesFor(food, routeOf(food) === "usda_branded").catch(() => []) })
      if (out.length % 25 === 0) console.log(`  exported ${out.length}/${judge.length}`)
    }
    writeFileSync(option("out") ?? "remaining.json", JSON.stringify(out, null, 1))
    console.log(`exported ${out.length} foods`)
    await pg.end(); return
  }
  const routes = new Map<Route, Food[]>()
  for (const food of foods) routes.set(routeOf(food), [...(routes.get(routeOf(food)) ?? []), food])
  console.log(`foods: ${mine.length} yours + ${popular.length} popular`)
  for (const [route, list] of [...routes].sort()) console.log(`  ${route}: ${list.length}`)

  // Round-robin across routes, so a trial (--limit) samples every route.
  const byRoute = ["usda_record", "barcode", "usda_branded", "usda_generic"].map(route => [...(routes.get(route as Route) ?? [])])
  const lookups: Food[] = []
  while (byRoute.some(list => list.length)) for (const list of byRoute) { const next = list.shift(); if (next) lookups.push(next) }
  if (!apply) {
    const jev = (routes.get("usda_branded")?.length ?? 0) + (routes.get("usda_generic")?.length ?? 0)
    console.log(`plan: ${lookups.length} lookups (${jev} Jev matches, up to ${routes.get("barcode")?.length ?? 0} barcode web lookups)`)
    console.log(`estimated cost: Jev about $${(jev * 0.00005).toFixed(2)}, web at most $${((routes.get("barcode")?.length ?? 0) * 0.015).toFixed(2)}`)
  }

  // Foods: look up their sources and fill what's missing.
  const sources = createFoodSources({ userId: userId!, messageId: null, signal: AbortSignal.timeout(3_600_000), discover: () => {} })
  const outcome = { filled: 0, keys: 0, noMatch: 0, nothingNew: 0, failed: 0 }
  if (apply && !itemsOnly) {
    const queue = lookups.slice(0, limit)
    // A lookup that never settles must not end the run silently (Node exits when nothing is pending): each gets two
    // minutes, and a heartbeat keeps the process alive and shows what's in flight.
    const inFlight = new Set<string>(), total = queue.length
    const heartbeat = setInterval(() => console.log(`  … ${total - queue.length}/${total}, in flight: ${[...inFlight].join(", ")}`), 30_000)
    const withTimeout = <T,>(work: Promise<T>) => Promise.race([work, new Promise<never>((_, reject) => setTimeout(() => reject(new Error("lookup_timeout")), 120_000))])
    const work = async () => {
      for (let food = queue.shift(); food; food = queue.shift()) {
        const route = routeOf(food), label = `${food.id} ${food.name}`
        inFlight.add(label)
        try {
          const found = await withTimeout(route === "usda_record" ? usdaRecord(food, food.externalId!)
            : route === "barcode" ? barcodeMatch(food) : usdaMatch(food, route === "usda_branded"))
          if (!found) { outcome.noMatch++; console.log(`  - ${food.id} ${food.name}${food.brand ? ` (${food.brand})` : ""} [${route}]`); continue }
          const owned = have(food)
          const missing = Object.fromEntries(Object.entries(found.micros).filter(([key]) => !owned.has(key as NutrientKey))) as Micros
          if (!Object.keys(missing).length) { outcome.nothingNew++; continue }
          const added = await sources.fillMicros(food.id, { defaultServingWeightGram: food.defaultServingWeightGram!, micros: missing })
          if (added) {
            await pg.query(`INSERT INTO "FoodMicroFill"("foodItemId", keys, source) VALUES ($1, $2, $3)`, [food.id, Object.keys(missing), found.source])
            outcome.filled++; outcome.keys += added
            console.log(`  + ${food.id} ${food.name}${food.brand ? ` (${food.brand})` : ""}: ${Object.keys(missing).length} from ${found.source}`)
          }
        } catch (error) {
          outcome.failed++
          console.warn(`  ! ${food.id} ${food.name}: ${error instanceof Error ? error.message : error}`)
        } finally { inFlight.delete(label) }
      }
    }
    await Promise.all(Array.from({ length: 5 }, work))
    clearInterval(heartbeat)
    // Recipes: per portion from their ingredients (now richer).
    for (const recipe of routes.get("recipe") ?? []) {
      const ingredients = (await pg.query(`SELECT "foodItemId", grams::float8 AS grams FROM "RecipeIngredient" WHERE "recipeFoodItemId" = $1`, [recipe.id])).rows
      const parts = await loadFoods(ingredients.map(row => Number(row.foodItemId)))
      try {
        const values = recipeValues(ingredients.map(row => ({ food: parts.find(part => part.id === Number(row.foodItemId))!, grams: Number(row.grams) })),
          recipe.recipePortions!)
        const micros = Object.fromEntries(MICRO_KEYS.flatMap(key => finite(values.perPortion[key]) ? [[key, values.perPortion[key]]] : [])) as Micros
        const owned = have(recipe)
        const missing = Object.fromEntries(Object.entries(micros).filter(([key]) => !owned.has(key as NutrientKey))) as Micros
        const added = Object.keys(missing).length ? await sources.fillMicros(recipe.id, { defaultServingWeightGram: recipe.defaultServingWeightGram!, micros: missing }) : 0
        if (added) {
          await pg.query(`INSERT INTO "FoodMicroFill"("foodItemId", keys, source) VALUES ($1, $2, $3)`, [recipe.id, Object.keys(missing), "Recipe ingredients"])
          outcome.filled++; outcome.keys += added
          console.log(`  + recipe ${recipe.id} ${recipe.name}: ${added}`)
        }
      } catch (error) { console.warn(`  ! recipe ${recipe.id}: ${error instanceof Error ? error.message : error}`) }
    }
    console.log(`foods: ${outcome.filled} filled (${outcome.keys} nutrients), ${outcome.noMatch} no confident match, ` +
      `${outcome.nothingNew} nothing new, ${outcome.failed} failed; Jev ${jevCalls} calls $${jevCost.toFixed(3)}, ${webLookups} barcode lookups`)
  }

  if (foodsOnly) { await pg.end(); return }
  // Logged items: each empty micronutrient column from its food's (now richer) rows, scaled by the logged grams.
  const items = (await pg.query(`SELECT * FROM "LoggedFoodItem" WHERE ("userId" = $1 OR "foodItemId" = ANY($2::int[])) AND "deletedAt" IS NULL
    AND grams > 0`, [userId, popular])).rows as (Record<string, number | null> & { id: number; foodItemId: number; grams: number; userId: string })[]
  const fresh = new Map((await loadFoods([...new Set(items.map(item => item.foodItemId))])).map(food => [food.id, food]))
  const rows = items.flatMap(item => {
    const food = fresh.get(item.foodItemId)
    const amounts = food ? nutrientsAt(food, item.grams) : null
    if (!amounts) return []
    const values = Object.fromEntries(MICRO_KEYS.flatMap(key => item[key] == null && finite(amounts[key]) ? [[key, Math.round(amounts[key]! * 1e4) / 1e4]] : []))
    return Object.keys(values).length ? [{ id: item.id, values, others: item.userId !== userId }] : []
  })
  console.log(`logged items: ${items.length} read, ${rows.length} would gain values (${rows.filter(row => row.others).length} of other users)`)
  if (apply) {
    let changed = 0
    for (let at = 0; at < rows.length; at += 300) {
      const batch = rows.slice(at, at + 300).map(({ id, values }) => ({ id, values }))
      changed += Number((await pg.query(`SELECT public.fill_logged_micronutrients($1::jsonb) AS n`, [JSON.stringify(batch)])).rows[0].n)
    }
    console.log(`logged items: ${changed} filled`)
  }
  await pg.end()
}

/** Below these, a difference is noise (a trace of copper), not an error. */
const FLOOR: Record<string, number> = { mg: 2, mcg: 2, g: 0.3, ml: 5 }

async function correct(pg: Client, foods: Food[], sources: ReturnType<typeof createFoodSources>) {
  const generic = foods.filter(food => !food.brand?.trim() && !food.privateToUserId && food.recipePortions == null &&
    food.defaultServingWeightGram && !food.weightUnknown)
  const recorded = new Map((await pg.query(`SELECT DISTINCT ON ("foodItemId") "foodItemId", source FROM "FoodMicroFill"
    WHERE source ~ '^USDA FoodData Central [0-9]+' ORDER BY "foodItemId", id`)).rows.map(row => [Number(row.foodItemId), String(row.source)]))
  console.log(`correct: ${generic.length} generic foods, ${generic.filter(food => recorded.has(food.id)).length} with a USDA match`)
  const corrected: { food: Food; changes: Record<string, { from: number; to: number }> }[] = []
  for (const food of generic) {
    const fdcId = recorded.get(food.id)?.match(/USDA FoodData Central (\d+)/)?.[1]
    const usda = (fdcId ? await usdaRecord(food, fdcId).catch(() => null) : await usdaMatch(food, false).catch(() => null))
    if (!usda) continue
    const changes: Record<string, { from: number; to: number }> = {}
    for (const key of MICRO_KEYS) {
      const rows = food.Nutrient.filter(row => nutrientKey(row.nutrientName) === key)
      const to = usda.micros[key], first = rows[0]
      if (!first || to == null) continue
      const from = inKeyUnit(key, first.nutrientAmountPerDefaultServing, first.nutrientUnit)
      const floor = FLOOR[keyUnit(key)] ?? 1
      if (from == null || to < floor || Math.abs(from - to) < floor) continue
      if (from === 0 || from > 2 * to || from < to / 2) changes[key] = { from, to }
    }
    if (!Object.keys(changes).length) continue
    corrected.push({ food, changes })
    console.log(`  ~ ${food.id} ${food.name}: ${Object.entries(changes).map(([key, c]) => `${key} ${Math.round(c.from * 10) / 10}->${Math.round(c.to * 10) / 10}`).join(", ")}`)
    if (!apply) continue
    const removed = food.Nutrient.filter(row => (nutrientKey(row.nutrientName) ?? "") in changes)
    await pg.query("BEGIN")
    await pg.query(`DELETE FROM "Nutrient" WHERE "foodItemId" = $1 AND "nutrientName" = ANY($2::text[])`, [food.id, removed.map(row => row.nutrientName)])
    for (const row of microRows(Object.fromEntries(Object.entries(changes).map(([key, c]) => [key, c.to])) as Micros))
      await pg.query(`INSERT INTO "Nutrient"("foodItemId", "nutrientName", "nutrientUnit", "nutrientAmountPerDefaultServing") VALUES ($1, $2, $3, $4)`,
        [food.id, row.nutrientName, row.nutrientUnit, row.nutrientAmountPerDefaultServing])
    await pg.query(`UPDATE "FoodItem" SET "lastUpdated" = now() AT TIME ZONE 'UTC' WHERE id = $1`, [food.id])
    await pg.query(`INSERT INTO "FoodMicroFill"("foodItemId", keys, source) VALUES ($1, $2, $3)`, [food.id, Object.keys(changes),
      JSON.stringify({ correction: "more than 2x off USDA", usda: usda.source, changes, removed })])
    await pg.query("COMMIT")
  }
  console.log(`correct: ${corrected.length} foods ${apply ? "corrected" : "would be corrected"}`)
  if (!apply || !corrected.length) return
  // The owner's logs of those foods: the corrected nutrients recomputed at each log's grams.
  let logs = 0
  await pg.query("BEGIN")
  await pg.query("SELECT pg_catalog.set_config('app.meal_operation_write', 'true', true)")
  for (const { food, changes } of corrected) {
    const fresh = (await pg.query(`SELECT coalesce(json_agg(n), '[]') AS rows FROM "Nutrient" n WHERE n."foodItemId" = $1`, [food.id])).rows[0].rows
    const items = (await pg.query(`SELECT * FROM "LoggedFoodItem" WHERE "foodItemId" = $1 AND "userId" = $2 AND "deletedAt" IS NULL AND grams > 0`,
      [food.id, userId])).rows
    for (const item of items) {
      const amounts = nutrientsAt({ ...food, Nutrient: fresh }, Number(item.grams))
      if (!amounts) continue
      const keys = Object.keys(changes).filter(key => amounts[key as NutrientKey] != null)
      if (!keys.length) continue
      await pg.query(`UPDATE "LoggedFoodItem" SET ${keys.map((key, at) => `"${key}" = $${at + 2}`).join(", ")} WHERE id = $1`,
        [item.id, ...keys.map(key => Math.round(amounts[key as NutrientKey]! * 1e4) / 1e4)])
      await pg.query(`INSERT INTO "LoggedFoodItemMicroFill"("loggedFoodItemId", filled) VALUES ($1, $2)`,
        [item.id, JSON.stringify({ correction: "more than 2x off USDA", previous: Object.fromEntries(keys.map(key => [key, item[key]])) })])
      logs++
    }
  }
  await pg.query("COMMIT")
  console.log(`correct: ${logs} of the owner's logs recomputed`)
}

main().catch(error => { console.error(error); process.exit(1) })
