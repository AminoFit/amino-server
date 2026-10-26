import { createAdminSupabase } from "@/utils/supabase/serverAdmin"
import { normalizeGtin } from "@/mealResolution/gtin"
import { createFoodSources } from "@/mealResolution/foodSources"
import { foodForBarcode } from "@/foodSearch/barcodeLookup"
import { foodForGtin } from "@/foodSearch/packageBarcodes"
import { nameBarcode } from "@/foodSearch/barcodeIdentity"
import { searchFoodsForUser } from "@/foodSearch/searchFoods"
import type { UserDatabase } from "./auth"
import { McpInputError } from "./meals"
import { cardFor } from "./foods"

// Agents add shared catalogue foods from a pointer (2026-10-05-mcp-catalogue-adds-plan.md): a USDA FoodData Central id or
// a barcode, never facts the agent wrote. A barcode is looked up in USDA and Open Food Facts, whose records carry it; a
// web search never creates a food from an agent's typed digits (they could find another product there). Failing those,
// the barcode's listings (UPCitemdb, Brave) only name the product, and the barcode is attached to the food Amino
// already has when Jev is sure that is the named product: mistyped digits name another product and attach nothing
// (fairlife strawberry 14 fl oz, 2026-10-06: the agent looked the digits up itself). The duplicate check, enrichment and
// barcode rules are the app's own (createFoodFromSource), comparing shared foods only: the user's own foods are never
// returned, matched or enriched (a USDA Pinot Noir was answered with the user's own copy, which it then changed,
// 2026-10-23). When the duplicate check is unsure it returns the candidates, and the agent answers with sameAs (one of
// them, or null for none) instead of the add failing closed. Not behind the user's "Let agents make changes" setting:
// the user's own data doesn't change, and logging the food still needs it. Every change is recorded with the user and
// the agent (CatalogueAgentChange) for repair, and every reply says what changed and what to do next.

type Db = ReturnType<typeof createAdminSupabase>
/** sameAs answers possible_duplicates: the candidate that is this USDA record's food, or null for none of them. */
export type Pointer = { kind: "barcode"; gtin: string } | { kind: "usda"; fdcId: number; sameAs?: number | null }
export type Agent = { clientId: string; name: string | null }

export const ADDS_PER_MINUTE = 5, ADDS_PER_DAY = 50
const LOOKUP_MS = 20_000
const URL_HELP = "Give a USDA FoodData Central page (fdc.nal.usda.gov/food-details/<id>) or an Open Food Facts product " +
  "page (world.openfoodfacts.org/product/<barcode>)."

/** The one pointer an agent gave: barcode digits, a USDA id, or a USDA or Open Food Facts page (with sameAs for USDA). */
export function pointerFrom(input: { barcode?: string; usdaId?: number; url?: string; sameAs?: number | null }): Pointer {
  const pointer = onePointer(input)
  if (input.sameAs === undefined) return pointer
  if (pointer.kind !== "usda") throw new McpInputError("sameAs answers possible_duplicates for a USDA record: give it " +
    "with the same usdaId (or USDA page). A barcode is never unsure.")
  return { ...pointer, sameAs: input.sameAs }
}

function onePointer(input: { barcode?: string; usdaId?: number; url?: string }): Pointer {
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

type Deps = { db?: Db
  barcode?: typeof foodForBarcode; sources?: (beforeChange: (foodId: number) => Promise<unknown>) =>
    Pick<ReturnType<typeof createFoodSources>, "usdaSource" | "createFoodFromSource">
  name?: typeof nameBarcode; search?: typeof searchFoodsForUser
  attach?: () => Pick<ReturnType<typeof createFoodSources>, "attachBarcode">
  enqueueIcon?: (foodId: number) => Promise<unknown>; card?: typeof cardFor }
type SourceKind = "USDA" | "OpenFoodFacts" | "BarcodeName"

const NOTHING = "Nothing was added or changed."
type Outcome = { foodId: number; created: boolean; sourceKind: SourceKind; sourceRef: string; label?: string }

/** Adds a USDA or Open Food Facts food to the shared catalogue (or finds the one already there) and returns its card,
 * with what changed (`changed`) and, when nothing was added, why and what to do next. */
export async function addCatalogueFood(userDb: UserDatabase, userId: string, agent: Agent, pointer: Pointer, deps: Deps = {}) {
  const db = deps.db ?? createAdminSupabase()
  const card = (foodId: number, servingId?: number | null) => (deps.card ?? cardFor)(userDb, userId, foodId, servingId)

  // Already in Amino's catalogue: no source is asked and nothing is counted.
  const already = async (foodId: number, servingId?: number | null) => ({ data: { status: "found" as const,
    food: await card(foodId, servingId), changed: "Nothing: Amino's shared catalogue already has this food." },
    targets: [foodId] })
  const known = pointer.kind === "barcode" ? await foodForGtin(db, null, pointer.gtin) : await usdaFood(db, pointer.fdcId)
  if (known) return already(known.foodId, known.servingId)
  await checkLimits(db, userId)

  // Existing foods as they were before this call changed them. (A food create_catalogue_food matches by identity after
  // the duplicate check found none is enriched with no before state, so no row records it: rare.)
  const befores = new Map<number, Snapshot | null>()
  const beforeChange = async (foodId: number) => { if (!befores.has(foodId)) befores.set(foodId, await snapshot(db, foodId)) }
  let looked: Awaited<ReturnType<typeof lookUp>>
  try {
    looked = await lookUp(db, userId, pointer, beforeChange, deps)
  } catch (error) {
    if (error instanceof McpInputError) throw error
    // A lookup that failed part way may already have filled in a food: that is recorded and said.
    const changes = await record(db, userId, agent, null, pointer, befores).catch(() => [])
    const changed = changes.length ? `Food ${changes.map(row => row.foodItemId).join(", ")} was partly filled in before ` +
      "it stopped; nothing was added." : NOTHING
    const timedOut = error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError")
    console.error("catalogue_add_failed", { userId, pointer, error: error instanceof Error ? error.message : error })
    throw new McpInputError(timedOut
      ? `Couldn't add the food: ${pointer.kind === "usda" ? "USDA" : "USDA and Open Food Facts"} didn't answer within ` +
        `${LOOKUP_MS / 1000} s. ${changed} Try again in a minute.`
      : `Couldn't add the food: Amino's catalogue or the food database didn't respond. ${changed} Try again shortly; ` +
        "if it keeps failing, use a similar food from search_foods and tell the user.", timedOut ? "source_timeout" : "unavailable")
  }
  if ("reply" in looked) return { data: looked.reply, code: looked.code }
  if ("existing" in looked) return already(looked.existing)

  const { outcome, note } = looked
  const changes = await record(db, userId, agent, outcome, pointer, befores)
  const servingId = pointer.kind === "barcode" ? (await foodForGtin(db, null, pointer.gtin))?.servingId : null
  const source = outcome.sourceKind === "USDA" ? `USDA FoodData Central ${outcome.sourceRef}`
    : outcome.sourceKind === "OpenFoodFacts" ? `Open Food Facts ${outcome.sourceRef}`
    : `Barcode listings (${outcome.label}): the barcode was added to this food`
  return { data: { status: outcome.created ? "added" as const : "found" as const, food: await card(outcome.foodId, servingId),
    source, changed: describeChanges(outcome, changes), ...(note ? { note } : {}) }, targets: [outcome.foodId] }
}

/** The source's food, created or matched in the catalogue; or the reply when nothing was added. */
async function lookUp(db: Db, userId: string, pointer: Pointer, beforeChange: (foodId: number) => Promise<unknown>,
  deps: Deps): Promise<{ outcome: Outcome; note?: string } | { reply: object; code: string } | { existing: number }> {
  const signal = AbortSignal.timeout(LOOKUP_MS)
  if (pointer.kind === "barcode") {
    const result = await (deps.barcode ?? foodForBarcode)(userId, pointer.gtin, { db, signal, web: false, beforeChange,
      catalogueOnly: true, ...(deps.enqueueIcon ? { enqueueIcon: deps.enqueueIcon } : {}) })
    if (result.status === "found" && "source" in result && result.source) {
      const usda = result.source.kind === "USDA"
      return { outcome: { foodId: result.foodId, created: result.created, sourceKind: usda ? "USDA" : "OpenFoodFacts",
        sourceRef: usda ? String(result.source.ref) : pointer.gtin } }
    }
    // Another request added it meanwhile.
    if (result.status === "found") return { existing: result.foodId }
    const named = await attachByName(db, userId, pointer.gtin, signal, beforeChange, deps)
    if (named === "not_food") return notAdded(pointer, "not_food", "The barcode's listings say this product isn't food.",
      "Check the digits with the user.")
    if (named) return { outcome: { foodId: named.foodId, created: false, sourceKind: "BarcodeName", sourceRef: pointer.gtin,
      label: named.label } }
    return notAdded(pointer, "no_record", "USDA and Open Food Facts don't have this barcode, and no food in Amino's " +
      "catalogue is the product its listings name.", "Check the digits with the user, search_foods by the product's name, " +
      "or, with the label's values, save it as the user's own food with create_food.")
  }

  const sources = deps.sources?.(beforeChange) ?? createFoodSources({ userId, messageId: null, signal, discover: () => {},
    beforeChange, catalogueOnly: true }, { db })
  const [source] = await sources.usdaSource(pointer.fdcId)
  if (!source) return notAdded(pointer, "no_usable_record", "USDA has no usable record with that id: it needs energy, " +
    "protein, carbs, fat and a weight.", "Check the id with search_foods (scope \"usda\"), or pick another USDA record.")
  let added = await sources.createFoodFromSource(source.sourceId)
  let note: string | undefined
  if (added.status === "possible_duplicates" && pointer.sameAs !== undefined) {
    const offered = added.candidates.map(candidate => candidate.id)
    if (pointer.sameAs !== null && !offered.includes(pointer.sameAs))
      return possibleDuplicates(pointer, source, added.candidates, `sameAs ${pointer.sameAs} isn't one of the candidates.`)
    added = await sources.createFoodFromSource(source.sourceId, pointer.sameAs)
  } else if (pointer.sameAs !== undefined) note = "The duplicate check decided this itself, so sameAs wasn't used."
  if (added.status === "possible_duplicates") return possibleDuplicates(pointer, source, added.candidates)
  if (added.status !== "created" && added.status !== "existing")
    return notAdded(pointer, added.status, "Amino couldn't check this USDA record against its catalogue.", "Try again shortly.")
  // Outside a meal nothing else queues a new food's icon (its category was queued when it was created).
  if (added.status === "created") await (deps.enqueueIcon ?? enqueueIcon)(added.foodId)
    .catch(() => console.error("Catalogue food added, but its icon could not be queued", { foodId: added.foodId }))
  return { outcome: { foodId: added.foodId, created: added.status === "created", sourceKind: "USDA",
    sourceRef: String(pointer.fdcId) }, note }
}

type Candidate = { id: number; name: string; brand: string | null; servingGrams: number | null; kcal: number | null
  proteinG: number | null }

/** The duplicate check was unsure which catalogue food, if any, this record is: the agent answers with sameAs. */
function possibleDuplicates(pointer: Pointer & { kind: "usda" }, source: { name: string; servingGrams?: number
  kcal?: number; proteinG?: number }, candidates: Candidate[], problem?: string) {
  return { code: "possible_duplicates", reply: { status: "possible_duplicates" as const, usdaId: pointer.fdcId,
    record: { name: source.name, servingGrams: source.servingGrams, kcal: source.kcal, proteinG: source.proteinG },
    candidates, changed: NOTHING,
    reason: `${problem ? `${problem} ` : ""}Amino's duplicate check couldn't tell whether one of these catalogue foods ` +
      "is this record's food.",
    next: `Call add_catalogue_food again with usdaId ${pointer.fdcId} and sameAs: the candidate's id when it is the ` +
      "same food (same food, variety and state: raw or cooked), or null when none is (a more specific food, such as " +
      "Pinot Noir among red wines, is not the same). Don't use create_food for it." } }
}

function notAdded(pointer: Pointer, code: string, reason: string, next: string) {
  return { code, reply: { status: "unknown" as const,
    ...(pointer.kind === "barcode" ? { barcode: pointer.gtin } : { usdaId: pointer.fdcId }), changed: NOTHING, reason, next } }
}

/** What a reply says changed, from the rows recorded. */
function describeChanges(outcome: Outcome, changes: Awaited<ReturnType<typeof record>>) {
  if (outcome.created) return "Added to Amino's shared catalogue."
  const own = changes.find(row => row.foodItemId === outcome.foodId)
  if (!own?.changes) return "Nothing: Amino's shared catalogue already has this food."
  const { fields, servingsAdded, barcodesAdded, nutrientsChanged } = own.changes
  const parts = [servingsAdded.length && `${servingsAdded.length} serving${servingsAdded.length === 1 ? "" : "s"}`,
    nutrientsChanged.length && `${nutrientsChanged.length} nutrient${nutrientsChanged.length === 1 ? "" : "s"}`,
    (barcodesAdded.length || "gtin" in fields) && "its barcode",
    Object.keys(fields).filter(key => !/knownAs|gtin/.test(key)).length && "missing values"].filter(Boolean)
  return own.action === "superseded" ? "Amino's shared catalogue had an estimate for this food: the source's values " +
    "replaced it." : `Amino's shared catalogue already has this food; filled in from the source: ${parts.join(", ") ||
    "its other names"}.`
}

/** A barcode no database has: its listings name the product, the catalogue is searched by that name, and the barcode
 * goes on the first of the closest shared foods Jev is sure is that product (attachBarcode: at least 0.9, another
 * flavour or variant is not; a food with another barcode gets it as another package size). */
async function attachByName(db: Db, userId: string, gtin: string, signal: AbortSignal,
  beforeChange: (foodId: number) => Promise<unknown>, deps: Deps): Promise<{ foodId: number; label: string } | "not_food" | null> {
  const named = await (deps.name ?? nameBarcode)(gtin, { signal }).catch(() => null)
  if (named?.status === "not_food") return "not_food"
  if (named?.status !== "identified") return null
  const brand = named.brand?.trim()
  const label = brand && !named.name.toLowerCase().includes(brand.toLowerCase()) ? `${brand} ${named.name}` : named.name
  const found = await (deps.search ?? searchFoodsForUser)(userId, label, { mode: "ingredient", db, signal })
  const candidates = found.results.filter(result => result.source === "catalogue" && result.match !== "loose").slice(0, 3)
  const sources = deps.attach?.() ?? createFoodSources({ userId, messageId: null, signal, discover: () => {}, barcodes: [gtin],
    catalogueOnly: true }, { db })
  for (const candidate of candidates) {
    await beforeChange(candidate.id)
    const attached = await sources.attachBarcode(candidate.id, gtin, label)
    // other_food: another request put the barcode on a food meanwhile.
    if (attached.status === "attached" || attached.status === "other_food") return { foodId: attached.foodId, label }
  }
  return null
}

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

/** One row per food created or changed, with the agent and, for an existing food, its state before (also when a lookup
 * failed part way, without an outcome). Returns the rows. */
async function record(db: Db, userId: string, agent: Agent, outcome: Outcome | null, pointer: Pointer,
  befores: Map<number, Snapshot | null>) {
  const base = { userId, clientId: agent.clientId, agentName: agent.name,
    sourceKind: outcome?.sourceKind ?? (pointer.kind === "usda" ? "USDA" : "OpenFoodFacts"),
    sourceRef: outcome?.sourceRef ?? (pointer.kind === "usda" ? String(pointer.fdcId) : pointer.gtin) }
  const rows: { foodItemId: number; action: string; changes?: NonNullable<ReturnType<typeof changesBetween>>["changes"]
    [key: string]: unknown }[] = outcome?.created ? [{ ...base, foodItemId: outcome.foodId, action: "created" }] : []
  for (const [foodId, before] of befores) {
    const after = before ? await snapshot(db, foodId) : null
    const change = before && after ? changesBetween(before, after) : null
    if (change) rows.push({ ...base, foodItemId: foodId, action: change.action, changes: change.changes, before })
  }
  if (!rows.length) return rows
  const { error } = await (db as any).from("CatalogueAgentChange").insert(rows)
  if (error) console.error("catalogue_agent_change_not_recorded", { userId, clientId: agent.clientId, foodIds: rows.map(row => row.foodItemId),
    error: error.message })
  return rows
}

const enqueueIcon = async (foodId: number) =>
  (await import("@/app/api/queues/generate-food-icon/generate-food-icon")).enqueueFoodIcon(foodId)
