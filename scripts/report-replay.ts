// What became of the foods and meals users reported in the app (userSubmittedBug): whether each reported food is still
// in the catalogue (or was merged) and still looks wrong, and, with --replay, what today's resolver logs for each
// reported meal next to what was logged then. Read-only: the catalogue is read, food creation is simulated (as in
// meal-photo-eval), nothing is published. Writes a Markdown summary and prints one JSON line per food and meal.
//
// DOTENV_CONFIG_PATH=<path to .env.prod> npx ts-node -T -r dotenv/config -r tsconfig-paths/register scripts/report-replay.ts \
//   [--replay] [--out=report-replay.md] [messageIds...]
// Without --replay no model is called. A replay resolves each reported meal once (about $0.03-0.05 each).
import { writeFileSync } from "node:fs"
import { createAdminSupabase } from "@/utils/supabase/serverAdmin"
import { resolveMeal } from "@/mealResolution/resolve"
import { compileCheckedMealPlan } from "@/mealResolution/historyCheck"
import { createMealEvidence, type CatalogFood } from "@/mealResolution/evidence"
import { createFoodSources } from "@/mealResolution/foodSources"
import { mealRunTotals, withMealRun } from "@/mealResolution/runRecorder"

type Report = { id: number; bug_type: string | null; created_at: string; food_item_id: number | null; logged_food_id: number | null
  message_id: number | null; created_by_user: string }
type Food = { id: number; name: string; brand: string | null; foodInfoSource: string; kcalPerServing: number; proteinPerServing: number
  carbPerServing: number; totalFatPerServing: number; defaultServingWeightGram: number | null; lastUpdated: string }

const db = createAdminSupabase() as any
const replay = process.argv.includes("--replay")
const out = process.argv.find(arg => arg.startsWith("--out="))?.slice("--out=".length) ?? "report-replay.md"
const only = process.argv.slice(2).filter(arg => /^\d+$/.test(arg)).map(Number)
const utc = (value: string) => new Date(/(?:Z|[+-]\d\d:?\d\d)$/.test(value) ? value : `${value}Z`)
const round = (value: number | null | undefined, digits = 0) => value == null ? "—" : Number(value.toFixed(digits)).toString()
const label = (food: Pick<Food, "name" | "brand"> | undefined | null) => food ? `${food.name}${food.brand ? ` (${food.brand})` : ""}` : "—"

async function read<T>(query: PromiseLike<{ data: T | null; error: { message: string } | null }>): Promise<T> {
  const { data, error } = await query
  if (error) throw new Error(error.message)
  return data as T
}

/** The food now, following merges: the catalogue audit records each dropped food's mergedInto. */
async function currentFood(id: number): Promise<{ food: Food | null; mergedInto: number | null }> {
  const columns = "id,name,brand,foodInfoSource,kcalPerServing,proteinPerServing,carbPerServing,totalFatPerServing,defaultServingWeightGram,lastUpdated"
  const food = await read<Food | null>(db.from("FoodItem").select(columns).eq("id", id).maybeSingle())
  if (food) return { food, mergedInto: null }
  const audits = await read<{ before: { mergedInto?: number } }[]>(db.from("CatalogueAuditBackup").select("before")
    .eq("tableName", "FoodItem").eq("rowId", id).order("id", { ascending: false }))
  const into = audits.find(audit => audit.before?.mergedInto)?.before.mergedInto ?? null
  return into ? { food: (await currentFood(into)).food, mergedInto: into } : { food: null, mergedInto: null }
}

/** Plausibility hints for a food's values (never proof: fibre, sugar alcohols and label rounding move 4/4/9). */
function warnings(food: Food) {
  const found: string[] = [], macros = 4 * food.proteinPerServing + 4 * food.carbPerServing + 9 * food.totalFatPerServing
  const per100 = food.defaultServingWeightGram ? food.kcalPerServing / food.defaultServingWeightGram * 100 : null
  if (food.kcalPerServing > 0 && Math.abs(macros - food.kcalPerServing) / food.kcalPerServing > 0.25)
    found.push(`4/4/9 gives ${Math.round(macros)} kcal vs ${Math.round(food.kcalPerServing)} stated`)
  if (per100 != null && (per100 > 900 || per100 < 0)) found.push(`${Math.round(per100)} kcal/100 g is impossible`)
  if (!food.defaultServingWeightGram) found.push("no serving weight")
  return found
}

async function checkFood(id: number, reports: Report[]) {
  const { food, mergedInto } = await currentFood(id)
  const since = new Date(Date.now() - 90 * 86400000).toISOString()
  const recent = food ? (await db.from("LoggedFoodItem").select("id", { count: "exact", head: true })
    .eq("foodItemId", food.id).is("deletedAt", null).gte("consumedOn", since)).count ?? 0 : 0
  const icons = food ? await read<{ FoodImage: { pathToImage: string; downvotes: number; id: number } | null }[]>(
    db.from("FoodItemImages").select("FoodImage(id,pathToImage,downvotes)").eq("foodItemId", food.id)) : []
  const icon = icons.flatMap(row => row.FoodImage ? [row.FoodImage] : []).sort((a, b) => a.downvotes - b.downvotes || b.id - a.id)[0]
  const lastReport = reports.map(report => utc(report.created_at).getTime()).sort().pop()!
  return { reportedFoodId: id, types: [...new Set(reports.map(report => report.bug_type ?? "other"))], reports: reports.length,
    status: !food ? "gone" : mergedInto ? `merged into ${mergedInto}` : "still in catalogue",
    food: food && { id: food.id, name: label(food), source: food.foodInfoSource, kcal: food.kcalPerServing, grams: food.defaultServingWeightGram,
      kcalPer100g: food.defaultServingWeightGram ? Math.round(food.kcalPerServing / food.defaultServingWeightGram * 100) : null,
      proteinCarbFat: [food.proteinPerServing, food.carbPerServing, food.totalFatPerServing] },
    changedSinceReport: food ? utc(food.lastUpdated).getTime() > lastReport : null,
    warnings: food ? warnings(food) : [], logs90d: recent, icon: icon?.pathToImage ?? null, iconDownvotes: icon?.downvotes ?? null }
}

/** Resolves the reported meal again as today's worker would, with the catalogue's writes simulated. */
async function replayMeal(messageId: number, reports: Report[]) {
  const message = await read<{ id: number; userId: string; content: string; consumedOn: string | null; createdAt: string } | null>(
    db.from("Message").select("id,userId,content,consumedOn,createdAt").eq("id", messageId).maybeSingle())
  if (!message) return { messageId, error: "message gone" }
  const [photos, user, logged] = await Promise.all([
    read<{ id: number }[]>(db.from("UserMessageImages").select("id").eq("messageId", messageId).order("id")),
    read<{ tzIdentifier: string } | null>(db.from("User").select("tzIdentifier").eq("id", message.userId).maybeSingle()),
    read<{ id: number; grams: number; kcal: number | null; FoodItem: { name: string; brand: string | null } | null }[]>(
      db.from("LoggedFoodItem").select("id,grams,kcal,FoodItem(name,brand)").eq("messageId", messageId).order("id"))
  ])
  const controller = new AbortController(), created: string[] = []
  const timezone = user?.tzIdentifier ?? "America/New_York"
  const evidence = createMealEvidence(message.userId, controller.signal, undefined, timezone), barcodes: string[] = []
  let fakeId = 900000001 // simulated foods use IDs far above the catalogue's
  // Reads go to the catalogue; the three catalogue writes are simulated and any other write throws.
  const readOnly = (table: string) => new Proxy(db.from(table), { get: (target, key) =>
    ["insert", "update", "upsert", "delete"].includes(String(key)) ? () => { throw new Error(`replay tried to write ${table}`) } : target[key] })
  const guardedDb = { from: readOnly, rpc: (name: string, args: any) => {
    if (name === "create_catalogue_food") {
      const food = args.p_food, id = fakeId++
      created.push(`${food.foodInfoSource}: ${food.name} ${food.defaultServingWeightGram} g ${food.kcal} kcal`)
      evidence.foods.set(id, { id, name: food.name, brand: food.brand, gtin: food.gtin, description: food.source, lastUpdated: new Date().toISOString(),
        defaultServingWeightGram: food.defaultServingWeightGram, weightUnknown: false, kcalPerServing: food.kcal, proteinPerServing: food.proteinG,
        carbPerServing: food.carbG, totalFatPerServing: food.totalFatG, satFatPerServing: food.satFatG ?? null, transFatPerServing: null,
        fiberPerServing: food.fiberG ?? null, sugarPerServing: food.sugarG ?? null, addedSugarPerServing: null,
        Serving: (args.p_servings as { name: string; grams: number; amount: number }[]).map((s, i) => ({ id: id * 10 + i, foodItemId: id,
          servingName: s.name, servingWeightGram: s.grams, defaultServingAmount: s.amount })) } as CatalogFood)
      return { abortSignal: async () => ({ data: [{ food_id: id, created: true, enrichment: null }], error: null }) }
    }
    // Enrichment adds a barcode (attachBarcode) or reports a conflict; the replay pretends the barcode was added.
    if (name === "enrich_catalogue_food") { if (args.p_food?.gtin) created.push(`barcode ${args.p_food.gtin} -> food ${args.p_food_id}`)
      return { abortSignal: async () => ({ data: { foodId: args.p_food_id, added: args.p_food?.gtin ? ["gtin"] : [], conflict: false }, error: null }) } }
    if (name === "supersede_catalogue_estimate") { created.push(`supersede estimate ${args.p_food_id} with ${args.p_food?.name}`)
      return { abortSignal: async () => ({ data: { foodId: args.p_food_id }, error: null }) } }
    if (!/^(search_|get_cosine_results$|food_icon_candidates$)/.test(name)) throw new Error(`replay tried to call ${name}`)
    return db.rpc(name, args)
  } }
  const sources = createFoodSources({ userId: message.userId, messageId, signal: controller.signal, barcodes,
    discover: id => evidence.discover(id) }, { db: guardedDb as never, enqueue: async () => {} })
  const input = { userId: message.userId, operationId: "00000000-0000-4000-8000-00000000e001", messageId,
    originalText: message.content ?? "", consumedOn: utc(message.consumedOn ?? message.createdAt).toISOString(),
    submittedAt: utc(message.createdAt).toISOString(), timezone, locale: null, attachmentIds: photos.map(photo => photo.id),
    clarificationAllowed: false }
  const started = Date.now()
  try {
    const deps = { evidence, sources, barcodes }
    // The run recorder sums every model call's tokens and cost, as the worker records them.
    const { value: { result, plan }, run } = await withMealRun(async () => {
      let result = await resolveMeal(input, deps)
      try { return { result, plan: await compileCheckedMealPlan(input, result, { secondLook: !result.checked }) } }
      catch (error) {
        result = await resolveMeal({ ...input, validationErrorCode: error instanceof Error ? error.message : "invalid_plan" }, deps)
        return { result, plan: await compileCheckedMealPlan(input, result, { secondLook: false }) }
      }
    })
    const totals = mealRunTotals(run)
    const reportedIds = new Set(reports.flatMap(report => report.food_item_id ? [report.food_item_id] : []))
    return { messageId, types: [...new Set(reports.map(report => report.bug_type ?? "other"))], text: message.content, photos: photos.length,
      reportedFoods: [...reportedIds], route: result.model, ms: Date.now() - started, costUsd: totals.costUsd, created,
      then: logged.map(item => `${label(item.FoodItem)} ${Math.round(item.grams)} g ${round(item.kcal)} kcal`),
      now: plan.items.map(item => `${label(evidence.foods.get(item.foodId))} ${Math.round(item.grams)} g ${round(item.nutrition?.kcal)} kcal`),
      stillPicksReported: plan.items.some(item => reportedIds.has(item.foodId)) }
  } catch (error) {
    return { messageId, error: error instanceof Error ? error.message : "unknown", ms: Date.now() - started }
  } finally { controller.abort() }
}

void (async () => {
  process.on("unhandledRejection", () => {})
  const reports = (await read<Report[]>(db.from("userSubmittedBug").select("*").order("created_at", { ascending: false })))
    .filter(report => !only.length || report.message_id != null && only.includes(report.message_id))
  const byFood = new Map<number, Report[]>(), byMessage = new Map<number, Report[]>()
  for (const report of reports) {
    if (report.food_item_id) byFood.set(report.food_item_id, [...(byFood.get(report.food_item_id) ?? []), report])
    if (report.message_id) byMessage.set(report.message_id, [...(byMessage.get(report.message_id) ?? []), report])
  }
  console.error(`${reports.length} reports: ${byFood.size} foods, ${byMessage.size} meals${replay ? " (replaying)" : ""}`)

  const foods = []
  for (const [id, rows] of byFood) { const row = await checkFood(id, rows); foods.push(row); console.log(JSON.stringify({ kind: "food", ...row })) }
  const meals: Awaited<ReturnType<typeof replayMeal>>[] = []
  if (replay) for (const [id, rows] of byMessage) {
    const row = await replayMeal(id, rows); meals.push(row); console.log(JSON.stringify({ kind: "meal", ...row }))
  }

  const lines = [`# Reported foods and meals, ${new Date().toISOString().slice(0, 10)}`, "",
    `${reports.length} reports on ${byFood.size} foods and ${byMessage.size} meals.`, "",
    "## Reported foods now", "",
    "Worth a look: still in the catalogue, logged in the last 90 days, and either a warning or unchanged since the report.", "",
    "| Food | Reports | Status | Now | kcal/100 g | Logs 90 d | Changed since | Warnings |", "|---|---|---|---|---|---|---|---|",
    ...foods.sort((a, b) => b.logs90d - a.logs90d).map(row => `| ${row.reportedFoodId} | ${row.reports} × ${row.types.join(", ")} | ${row.status} | ` +
      `${row.food ? `${row.food.id} ${row.food.name} · ${row.food.source} · ${round(row.food.kcal)} kcal / ${round(row.food.grams)} g` : "—"} | ` +
      `${row.food?.kcalPer100g ?? "—"} | ${row.logs90d} | ${row.changedSinceReport == null ? "—" : row.changedSinceReport ? "yes" : "no"} | ${row.warnings.join("; ") || ""} |`)]
  if (replay) lines.push("", "## Reported meals replayed", "",
    "`still picks` means today's resolver chose the same food that was reported (worth reading for bad matches).", "",
    ...meals.flatMap(row => "error" in row && row.error ? [`### Meal ${row.messageId}: error ${row.error}`, ""] : [
      `### Meal ${row.messageId} · ${(row as any).types.join(", ")}${(row as any).stillPicksReported ? " · **still picks the reported food**" : ""}`,
      `> ${((row as any).text || "(no text)").replace(/\n/g, " ")}${(row as any).photos ? ` · ${(row as any).photos} photo(s)` : ""}`, "",
      `- Then: ${(row as any).then.join("; ") || "—"}`,
      `- Now (${(row as any).route}, ${Math.round((row as any).ms / 1000)} s, $${round((row as any).costUsd, 4)}): ${(row as any).now.join("; ") || "—"}`,
      ...((row as any).created.length ? [`- Would create: ${(row as any).created.join("; ")}`] : []), ""]))
  if (replay) { const spent = meals.reduce((sum, row) => sum + ((row as any).costUsd ?? 0), 0)
    lines.splice(4, 0, `Replay model cost: $${spent.toFixed(2)}.`, "") }
  writeFileSync(out, lines.join("\n") + "\n")
  console.error(`Wrote ${out}`)
})()
