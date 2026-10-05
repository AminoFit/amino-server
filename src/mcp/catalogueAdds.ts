import { createAdminSupabase } from "@/utils/supabase/serverAdmin"
import { normalizeGtin } from "@/mealResolution/barcode"
import { createFoodSources } from "@/mealResolution/foodSources"
import { userFlagEnabled } from "@/mealResolution/fastRouteFlag"
import { foodForBarcode } from "@/foodSearch/barcodeLookup"
import { foodForGtin } from "@/foodSearch/packageBarcodes"
import type { UserDatabase } from "./auth"
import { McpInputError } from "./meals"
import { cardFor } from "./foods"

// Agents add shared catalogue foods from a pointer (2026-10-05-mcp-catalogue-adds-plan.md): a USDA FoodData Central id or
// a barcode, never facts the agent wrote. A barcode is looked up in USDA and Open Food Facts only, whose records carry it,
// never a web search (an agent's typed digits could find another product there). The duplicate check, enrichment and
// barcode rules are the app's own (createFoodFromSource). Not behind the user's "Let agents make changes" setting: the
// user's own data doesn't change, and logging the food still needs it. FeatureFlag mcp_catalogue_adds is the rollout and
// kill switch. Every change is recorded with the user and the agent (CatalogueAgentChange) for repair.

type Db = ReturnType<typeof createAdminSupabase>
export type Pointer = { kind: "barcode"; gtin: string } | { kind: "usda"; fdcId: number }
export type Agent = { clientId: string; name: string | null }

export const ADDS_PER_MINUTE = 5, ADDS_PER_DAY = 50
const LOOKUP_MS = 20_000
export const ADDS_UNAVAILABLE = "Agents can't add foods to Amino's catalogue yet. Use create_food to save it as the " +
  "user's own food."
const URL_HELP = "Give a USDA FoodData Central page (fdc.nal.usda.gov/food-details/<id>) or an Open Food Facts product " +
  "page (world.openfoodfacts.org/product/<barcode>)."

/** The one pointer an agent gave: barcode digits, a USDA id, or a USDA or Open Food Facts page. */
export function pointerFrom(input: { barcode?: string; usdaId?: number; url?: string }): Pointer {
  const given = [input.barcode, input.usdaId, input.url].filter(value => value != null && value !== "")
  if (given.length !== 1) throw new McpInputError("Give exactly one of barcode, usdaId or url.")
  if (input.usdaId != null) return { kind: "usda", fdcId: input.usdaId }
  if (input.barcode) return barcodePointer(input.barcode)
  let url: URL
  try { url = new URL(input.url!.trim()) } catch { throw new McpInputError(`That isn't a link. ${URL_HELP}`) }
  const host = url.hostname.toLowerCase()
  if (host === "fdc.nal.usda.gov") {
    // food-details/<id> in the path, or in the hash of the older fdc-app.html#/food-details/<id> pages.
    const id = Number(`${url.pathname}${url.hash}`.match(/food-details\/(\d{1,9})(?:\/|$|\?)/)?.[1])
    if (Number.isSafeInteger(id) && id > 0) return { kind: "usda", fdcId: id }
  }
  // Every language's site: world.openfoodfacts.org/product/<code>, fr.openfoodfacts.org/produit/<code>.
  if (host === "openfoodfacts.org" || host.endsWith(".openfoodfacts.org")) {
    const code = url.pathname.match(/^\/[^/]+\/(\d{6,14})(?:\/|$)/)?.[1]
    if (code) return barcodePointer(code)
  }
  throw new McpInputError(`That page isn't one Amino can read. ${URL_HELP}`)
}

function barcodePointer(code: string): Pointer {
  const gtin = normalizeGtin(code)
  if (!gtin) throw new McpInputError("That barcode isn't valid: check its digits.")
  return { kind: "barcode", gtin }
}

type Snapshot = Record<string, unknown> & { Serving: { id: number }[]; FoodBarcode: { gtin: string }[]
  Nutrient: { nutrientName: string; nutrientAmountPerDefaultServing: number | null }[] }

/** A food as it stands: its row (without embeddings), servings, package barcodes and nutrients. */
async function snapshot(db: Db, foodId: number): Promise<Snapshot | null> {
  const { data, error } = await (db as any).from("FoodItem")
    .select("*,Serving(*),FoodBarcode(gtin,servingId,source),Nutrient(nutrientName,nutrientUnit,nutrientAmountPerDefaultServing)")
    .eq("id", foodId).maybeSingle()
  if (error) throw error
  if (!data) return null
  return Object.fromEntries(Object.entries(data).filter(([key]) => !/embedding$/i.test(key))) as Snapshot
}

const IGNORED = new Set(["lastUpdated", "Serving", "FoodBarcode", "Nutrient"])

/** What a change did to a food, or null when it did nothing. */
export function changesBetween(before: Snapshot, after: Snapshot) {
  const fields = Object.fromEntries(Object.keys({ ...before, ...after })
    .filter(key => !IGNORED.has(key) && JSON.stringify(before[key] ?? null) !== JSON.stringify(after[key] ?? null))
    .map(key => [key, { before: before[key] ?? null, after: after[key] ?? null }]))
  const servingIds = new Set(before.Serving.map(serving => serving.id))
  const barcodes = new Set(before.FoodBarcode.map(row => row.gtin))
  const nutrients = new Map(before.Nutrient.map(row => [row.nutrientName, row.nutrientAmountPerDefaultServing]))
  const servingsAdded = after.Serving.filter(serving => !servingIds.has(serving.id)).map(serving => serving.id)
  const servingsRemoved = before.Serving.filter(serving => !after.Serving.some(other => other.id === serving.id)).map(serving => serving.id)
  const barcodesAdded = after.FoodBarcode.filter(row => !barcodes.has(row.gtin)).map(row => row.gtin)
  const nutrientsChanged = after.Nutrient.filter(row => nutrients.get(row.nutrientName) !== row.nutrientAmountPerDefaultServing)
    .map(row => row.nutrientName)
  const changes = { fields, servingsAdded, servingsRemoved, barcodesAdded, nutrientsChanged }
  const changed = Object.keys(fields).length + servingsAdded.length + servingsRemoved.length + barcodesAdded.length +
    nutrientsChanged.length > 0
  if (!changed) return null
  // An estimate replaced by the source changes its energy; a package barcode alone is just that.
  const action = "kcalPerServing" in fields ? "superseded" as const
    : barcodesAdded.length && !Object.keys(fields).length && !servingsAdded.length && !nutrientsChanged.length
      ? "package_barcode" as const : "enriched" as const
  return { action, changes }
}

type Deps = { db?: Db; flag?: (userId: string) => Promise<boolean>
  barcode?: typeof foodForBarcode; sources?: (beforeChange: (foodId: number) => Promise<unknown>) =>
    Pick<ReturnType<typeof createFoodSources>, "usdaSource" | "createFoodFromSource">
  enqueueIcon?: (foodId: number) => Promise<unknown>; card?: typeof cardFor }

/** Adds a USDA or Open Food Facts food to the shared catalogue (or finds the one already there) and returns its card. */
export async function addCatalogueFood(userDb: UserDatabase, userId: string, agent: Agent, pointer: Pointer, deps: Deps = {}) {
  const db = deps.db ?? createAdminSupabase()
  if (!(await (deps.flag ?? (id => userFlagEnabled("mcp_catalogue_adds", id, db)))(userId))) throw new McpInputError(ADDS_UNAVAILABLE)
  const card = (foodId: number, servingId?: number | null) => (deps.card ?? cardFor)(userDb, userId, foodId, servingId)
  const found = async (foodId: number, servingId?: number | null) => ({ status: "found" as const, food: await card(foodId, servingId) })

  // Already in Amino: no source is asked and nothing is counted.
  const known = pointer.kind === "barcode" ? await foodForGtin(db, userId, pointer.gtin) : await usdaFood(db, pointer.fdcId)
  if (known) return { data: await found(known.foodId, known.servingId), targets: [known.foodId] }
  await checkLimits(db, userId)

  // Existing foods as they were before this call changed them. (A food create_catalogue_food matches by identity after
  // the duplicate check found none is enriched with no before state, so no row records it: rare.)
  const befores = new Map<number, Snapshot | null>()
  const beforeChange = async (foodId: number) => { if (!befores.has(foodId)) befores.set(foodId, await snapshot(db, foodId)) }
  const signal = AbortSignal.timeout(LOOKUP_MS)
  let outcome: { foodId: number; created: boolean; sourceKind: "USDA" | "OpenFoodFacts"; sourceRef: string } | null = null
  if (pointer.kind === "barcode") {
    const result = await (deps.barcode ?? foodForBarcode)(userId, pointer.gtin, { db, signal, web: false, beforeChange,
      ...(deps.enqueueIcon ? { enqueueIcon: deps.enqueueIcon } : {}) })
    if (result.status === "found" && "source" in result && result.source) {
      const usda = result.source.kind === "USDA"
      outcome = { foodId: result.foodId, created: result.created, sourceKind: usda ? "USDA" : "OpenFoodFacts",
        sourceRef: usda ? String(result.source.ref) : pointer.gtin }
    } else if (result.status === "found") return { data: await found(result.foodId), targets: [result.foodId] }
  } else {
    const sources = deps.sources?.(beforeChange) ?? createFoodSources({ userId, messageId: null, signal, discover: () => {},
      beforeChange }, { db })
    const [source] = await sources.usdaSource(pointer.fdcId)
    const added = source ? await sources.createFoodFromSource(source.sourceId) : null
    if (added && (added.status === "created" || added.status === "existing")) {
      outcome = { foodId: added.foodId, created: added.status === "created", sourceKind: "USDA", sourceRef: String(pointer.fdcId) }
      // Outside a meal nothing else queues a new food's icon (its category was queued when it was created).
      if (outcome.created) await (deps.enqueueIcon ?? enqueueIcon)(added.foodId)
        .catch(() => console.error("Catalogue food added, but its icon could not be queued", { foodId: added.foodId }))
    } else if (!source) return { data: unknown(pointer, "USDA has no usable record with that id: it needs energy, " +
      "protein, carbs, fat and a weight.") }
  }
  // No record, or the duplicate check couldn't tell whether the record is a food Amino already has (it fails closed).
  if (!outcome) return { data: unknown(pointer, pointer.kind === "barcode" ? "USDA and Open Food Facts gave no food Amino " +
    "could add for this barcode." : "Amino couldn't tell whether this USDA record is a food it already has.") }

  await record(db, userId, agent, outcome, befores)
  const servingId = pointer.kind === "barcode" ? (await foodForGtin(db, userId, pointer.gtin))?.servingId : null
  return { data: { status: outcome.created ? "added" as const : "found" as const, food: await card(outcome.foodId, servingId),
    source: outcome.sourceKind === "USDA" ? `USDA FoodData Central ${outcome.sourceRef}` : `Open Food Facts ${outcome.sourceRef}` },
    targets: [outcome.foodId] }
}

const unknown = (pointer: Pointer, reason: string) => ({ status: "unknown" as const,
  ...(pointer.kind === "barcode" ? { barcode: pointer.gtin } : { usdaId: pointer.fdcId }), note: `${reason} Nothing was ` +
  "added. Search by the product's name, ask the user, or save it as their own food with create_food." })

/** The shared catalogue food made from this USDA record, if there is one. */
async function usdaFood(db: Db, fdcId: number) {
  const { data, error } = await db.from("FoodItem").select("id").eq("foodInfoSource", "USDA").eq("externalId", String(fdcId))
    .is("privateToUserId", null).is("archivedAt", null).is("recipePortions", null).order("id").limit(1)
  if (error) throw error
  const row = (data ?? [])[0] as { id: number } | undefined
  return row ? { foodId: row.id, servingId: null } : null
}

/** At most ADDS_PER_MINUTE and ADDS_PER_DAY catalogue changes per user; finding a food already there doesn't count. */
async function checkLimits(db: Db, userId: string) {
  const since = (ms: number) => (db as any).from("CatalogueAgentChange").select("id", { count: "exact", head: true })
    .eq("userId", userId).gte("createdAt", new Date(Date.now() - ms).toISOString())
  const [minute, day] = await Promise.all([since(60_000), since(86_400_000)])
  if (minute.error || day.error) throw minute.error ?? day.error
  if ((minute.count ?? 0) >= ADDS_PER_MINUTE || (day.count ?? 0) >= ADDS_PER_DAY)
    throw new McpInputError(`Too many foods added: at most ${ADDS_PER_MINUTE} a minute and ${ADDS_PER_DAY} a day.`)
}

/** One row per food created or changed, with the agent and, for an existing food, its state before. */
async function record(db: Db, userId: string, agent: Agent, outcome: { foodId: number; created: boolean
  sourceKind: string; sourceRef: string }, befores: Map<number, Snapshot | null>) {
  const base = { userId, clientId: agent.clientId, agentName: agent.name, sourceKind: outcome.sourceKind, sourceRef: outcome.sourceRef }
  const rows: Record<string, unknown>[] = outcome.created ? [{ ...base, foodItemId: outcome.foodId, action: "created" }] : []
  for (const [foodId, before] of befores) {
    const after = before ? await snapshot(db, foodId) : null
    const change = before && after ? changesBetween(before, after) : null
    if (change) rows.push({ ...base, foodItemId: foodId, action: change.action, changes: change.changes, before })
  }
  if (!rows.length) return
  const { error } = await (db as any).from("CatalogueAgentChange").insert(rows)
  if (error) console.error("catalogue_agent_change_not_recorded", { userId, clientId: agent.clientId, foodIds: rows.map(row => row.foodItemId),
    error: error.message })
}

const enqueueIcon = async (foodId: number) =>
  (await import("@/app/api/queues/generate-food-icon/generate-food-icon")).enqueueFoodIcon(foodId)
