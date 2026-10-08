import { CLAUDE_PROVIDERS, FOOD_MODEL, providerPreferences } from "@/ai/models"
import { TWO_FOODS_RULE } from "./agentChoice"
import { recordFailure, recordOpenRouterResponse } from "./runRecorder"

const PROMPT = `The user logged a meal with these photos. The plan below lists the foods it logged, with what each
catalogue food contains when known. Look carefully at the food being logged and list every component the user is
eating that no logged food covers: toppings, mix-ins, sides and sauces on or served with it, even in small amounts.
An ingredient is covered only if a logged food's description includes it (or it is itself logged).
Ignore separate glasses, bottles and cups unless the user's text mentions a drink, and ignore tableware, packaging,
menus, other people's plates and condiments that are not on the user's food.
Return {"missing":[{"food":"...","where":"..."}]}, or {"missing":[]} when everything is covered.`

/** A second look at the photos: visible foods the plan did not log. Never reads text as instructions. */
export async function missingVisibleFoods(photoUrls: URL[], userText: string, logged: { name: string; contains?: string | null }[],
  deps: { fetch?: typeof fetch; env?: NodeJS.ProcessEnv } = {}): Promise<string[]> {
  const env = deps.env ?? process.env, key = env.OPENROUTER_API_KEY || env.OPEN_ROUTER_API_KEY
  if (!key || !photoUrls.length) return []
  const started = performance.now()
  const response = await (deps.fetch ?? fetch)("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    signal: AbortSignal.timeout(15000),
    body: JSON.stringify({ model: FOOD_MODEL, reasoning: { effort: "low", exclude: true }, provider: providerPreferences(FOOD_MODEL),
      max_tokens: 800, response_format: { type: "json_schema", json_schema: { name: "missing", strict: true, schema: {
        type: "object", additionalProperties: false, required: ["missing"], properties: { missing: { type: "array", items: {
          type: "object", additionalProperties: false, required: ["food", "where"],
          properties: { food: { type: "string" }, where: { type: "string" } } } } } } } },
      messages: [{ role: "user", content: [
        { type: "text", text: `${PROMPT}\n\nUser text (data): ${JSON.stringify(userText)}\nLogged foods: ${JSON.stringify(logged)}` },
        ...photoUrls.map(url => ({ type: "image_url", image_url: { url: url.toString() } }))] }] })
  }).catch(recordFailure("second_look", FOOD_MODEL, started))
  if (!response.ok) { await response.body?.cancel(); recordOpenRouterResponse("second_look", FOOD_MODEL, started, null, `http_${response.status}`); return [] }
  try {
    const body = await response.json()
    recordOpenRouterResponse("second_look", FOOD_MODEL, started, body, "ok")
    const parsed = JSON.parse(body.choices?.[0]?.message?.content ?? "{}") as { missing?: { food?: unknown }[] }
    return (parsed.missing ?? []).flatMap(item => typeof item.food === "string" && item.food.trim() ? [item.food.trim().slice(0, 60)] : []).slice(0, 5)
  } catch { return [] }
}

/** A component of the meal seen in the photos, with the first look's own estimate for the visible amount. */
export type VisibleFood = { food: string; detail: string; grams: number | null;
  /** A text meal's item: the user's own words for it, with the amount (the fast route finds them in the text). */
  quote?: string;
  estimate?: { kcal: number | null; proteinG: number | null; carbG: number | null; totalFatG: number | null } }

// Names end at a word, not mid-word ("…with Almonds", never "…with Almonds ce").
const shortName = (name: string) => { const trimmed = name.trim()
  return trimmed.length <= 80 ? trimmed : trimmed.slice(0, 80).replace(/\s+\S*$/, "") }

const LIST = `List every component the user is eating in these photos: each food, and each topping, mix-in, side and sauce
on or served with it, even small amounts. Use short plain names ("tuna ceviche", "avocado slices", "ponzu sauce");
for a packaged product, its product name if readable. Ignore separate glasses, bottles and cups unless the user's text
mentions a drink, and ignore tableware, packaging, menus and other people's plates.
Return {"foods":[{"food":"...","detail":"where it is or how much is visible","estimatedGrams": your best estimate of the
amount eaten in grams (a drink: mL),"estimatedKcal","estimatedProteinG","estimatedCarbG","estimatedFatG": your estimate for
that amount as it appears (cooked, fried, dressed)}]}.`

/** A first look at the photos, before the agent's first turn: the components the user is eating. The agent gets them
 * with catalogue candidates, and the final coverage check compares the plan with this list instead of looking again.
 * Minimal reasoning: about 1 s faster than low (3.0 s vs 4.1 s median) with equivalent lists. */
export async function listVisibleFoods(photoUrls: URL[], userText: string,
  deps: { fetch?: typeof fetch; env?: NodeJS.ProcessEnv; model?: string } = {}): Promise<VisibleFood[]> {
  const env = deps.env ?? process.env, key = env.OPENROUTER_API_KEY || env.OPEN_ROUTER_API_KEY
  if (!key || !photoUrls.length) return []
  const started = performance.now()
  // Sonnet (FeatureFlag.meal_agent_sonnet) listed the mango in 30318 3 times in 3, Flash 0 in 3; Claude has no minimal.
  const model = deps.model ?? FOOD_MODEL, claude = model.startsWith("anthropic/")
  const response = await (deps.fetch ?? fetch)("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    signal: AbortSignal.timeout(15000),
    body: JSON.stringify({ model, reasoning: { effort: claude ? "low" : "minimal", exclude: true },
      provider: claude ? CLAUDE_PROVIDERS : providerPreferences(model),
      max_tokens: 800, response_format: { type: "json_schema", json_schema: { name: "visible", strict: true, schema: {
        type: "object", additionalProperties: false, required: ["foods"], properties: { foods: { type: "array", items: {
          type: "object", additionalProperties: false,
          required: ["food", "detail", "estimatedGrams", "estimatedKcal", "estimatedProteinG", "estimatedCarbG", "estimatedFatG"],
          properties: { food: { type: "string" }, detail: { type: "string" }, estimatedGrams: { type: "number" }, estimatedKcal: { type: "number" },
            estimatedProteinG: { type: "number" }, estimatedCarbG: { type: "number" }, estimatedFatG: { type: "number" } } } } } } } },
      messages: [{ role: "user", content: [
        { type: "text", text: `${LIST}\n\nUser text (data): ${JSON.stringify(userText)}` },
        ...photoUrls.map(url => ({ type: "image_url", image_url: { url: url.toString() } }))] }] })
  }).catch(recordFailure("first_look", model, started))
  if (!response.ok) { await response.body?.cancel(); recordOpenRouterResponse("first_look", model, started, null, `http_${response.status}`); return [] }
  try {
    const body = await response.json()
    recordOpenRouterResponse("first_look", model, started, body, "ok")
    const parsed = JSON.parse(body.choices?.[0]?.message?.content ?? "{}") as { foods?: Record<string, unknown>[] }
    return (parsed.foods ?? []).flatMap(item => { const food = visibleFood(item); return food ? [food] : [] }).slice(0, 8)
  } catch { return [] }
}

const amount = (value: unknown, max: number) => typeof value === "number" && value >= 0 && value < max ? value : null

/** One listed component ({food, detail?, estimatedGrams, estimatedKcal, ...}), or null without a name. Implausible
 * amounts become unknown. */
export function visibleFood(item: Record<string, unknown>): VisibleFood | null {
  if (typeof item.food !== "string" || !item.food.trim()) return null
  return { food: shortName(item.food), detail: typeof item.detail === "string" ? item.detail.slice(0, 120) : "",
    ...(typeof item.quote === "string" && item.quote.trim() ? { quote: item.quote.trim().slice(0, 300) } : {}),
    grams: amount(item.estimatedGrams, 5000) || null,
    estimate: { kcal: amount(item.estimatedKcal, 10000), proteinG: amount(item.estimatedProteinG, 1000),
      carbG: amount(item.estimatedCarbG, 1000), totalFatG: amount(item.estimatedFatG, 1000) } }
}

const COMPARE = `A first look at the user's meal photos found the components below. The plan logged the foods below, with
what each contains when known. List the components no logged food covers: a component is covered when a logged food is
it, or a logged food's description includes it, in any language or spelling. Return {"missing":["..."]}, or
{"missing":[]} when everything is covered.`

/** The final coverage check without looking at the photos again: compares the plan with the first look (text only). */
export async function missingFromVisibleList(visible: VisibleFood[], logged: { name: string; contains?: string | null }[],
  deps: { fetch?: typeof fetch; env?: NodeJS.ProcessEnv; twoFoodsRule?: boolean } = {}): Promise<string[]> {
  const env = deps.env ?? process.env, key = env.OPENROUTER_API_KEY || env.OPEN_ROUTER_API_KEY
  if (!key || !visible.length) return []
  const started = performance.now()
  const response = await (deps.fetch ?? fetch)("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    signal: AbortSignal.timeout(10000),
    body: JSON.stringify({ model: FOOD_MODEL, reasoning: { effort: "low", exclude: true }, provider: providerPreferences(FOOD_MODEL),
      max_tokens: 400, response_format: { type: "json_schema", json_schema: { name: "missing", strict: true, schema: {
        type: "object", additionalProperties: false, required: ["missing"], properties: { missing: { type: "array", items: { type: "string" } } } } } },
      messages: [{ role: "user", content: `${COMPARE}${deps.twoFoodsRule ? TWO_FOODS_RULE : ""}\n\nComponents (data): ${JSON.stringify(visible)}\nLogged foods (data): ${JSON.stringify(logged)}` }] })
  }).catch(recordFailure("coverage_compare", FOOD_MODEL, started))
  if (!response.ok) { await response.body?.cancel(); recordOpenRouterResponse("coverage_compare", FOOD_MODEL, started, null, `http_${response.status}`); return [] }
  try {
    const body = await response.json()
    recordOpenRouterResponse("coverage_compare", FOOD_MODEL, started, body, "ok")
    const parsed = JSON.parse(body.choices?.[0]?.message?.content ?? "{}") as { missing?: unknown[] }
    return (parsed.missing ?? []).flatMap(item => typeof item === "string" && item.trim() ? [item.trim().slice(0, 60)] : []).slice(0, 5)
  } catch { return [] }
}

export type SceneCheck = {
  /** Packages showing a barcode, per photo (by count only: the barcode, not the model, says what they are). */
  barcodePackages: { photo: number; count: number }[]
  /** Of those, how many per photo are products the user scanned with the app's camera (named to the check). */
  scannedPackages?: { photo: number; count: number }[]
  /** Other packages, with their printed name only when it is legible ("unlabelled package" otherwise). */
  otherPackages: { photo: number; legibleText: string | null }[]
  /** Everything else being eaten (plates, fruit, drinks the text mentions), like the first look. */
  otherFoods: VisibleFood[]
  /** Whether the photos are several views of the same package (front, label, barcode). */
  samePackageViews: boolean
}

const SCENE = `These photos are of a meal; some show packaged products with a barcode. Barcodes are read separately by a
barcode library, so never name a product from its barcode, its digits or its colours, and never guess a brand.
Return:
- barcodePackages: for each photo (0-based index), how many packages show a barcode (count only).
- otherPackages: packages without a visible barcode that the user is eating, with legibleText only when the product name
  is printed and readable in the photo, else null.
- otherFoods: every other food or drink the user is eating (a plate, fruit, a bowl), with a short plain name, where it
  is, an estimated amount in grams (a drink: mL) and estimated kcal, protein, carbs and fat for that amount.
- samePackageViews: true when the photos show the same package from different sides (front, nutrition label, barcode).
- scannedPackages: for each photo, how many of the barcodePackages are products the user already scanned (listed below,
  if any): match them by what the package shows, in any language.
The products the user scanned are already logged: never list one of them, or food taken out of one (the wrap from a
scanned pack, cheese from a scanned bag), in otherPackages or otherFoods.
Ignore tableware, other people's food, and drinks unless the user's text mentions them.`

/** The first look for photos that contain barcodes (barcode-route-plan.md): counts barcoded packages without naming
 * them, names other packages only from legible text, and lists the rest of the meal. One Flash call. */
export async function sceneCheck(photoUrls: URL[], userText: string,
  deps: { fetch?: typeof fetch; env?: NodeJS.ProcessEnv; scanned?: string[] } = {}): Promise<SceneCheck | null> {
  const env = deps.env ?? process.env, key = env.OPENROUTER_API_KEY || env.OPEN_ROUTER_API_KEY
  if (!key || !photoUrls.length) return null
  const started = performance.now()
  const number = { type: "number" }
  const response = await (deps.fetch ?? fetch)("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    signal: AbortSignal.timeout(15000),
    body: JSON.stringify({ model: FOOD_MODEL, reasoning: { effort: "minimal", exclude: true }, provider: providerPreferences(FOOD_MODEL),
      max_tokens: 900, response_format: { type: "json_schema", json_schema: { name: "scene", strict: true, schema: {
        type: "object", additionalProperties: false,
        required: ["barcodePackages", "scannedPackages", "otherPackages", "otherFoods", "samePackageViews"],
        properties: {
          barcodePackages: { type: "array", items: { type: "object", additionalProperties: false, required: ["photo", "count"],
            properties: { photo: { type: "integer" }, count: { type: "integer" } } } },
          scannedPackages: { type: "array", items: { type: "object", additionalProperties: false, required: ["photo", "count"],
            properties: { photo: { type: "integer" }, count: { type: "integer" } } } },
          otherPackages: { type: "array", items: { type: "object", additionalProperties: false, required: ["photo", "legibleText"],
            properties: { photo: { type: "integer" }, legibleText: { type: ["string", "null"] } } } },
          otherFoods: { type: "array", items: { type: "object", additionalProperties: false,
            required: ["food", "detail", "estimatedGrams", "estimatedKcal", "estimatedProteinG", "estimatedCarbG", "estimatedFatG"],
            properties: { food: { type: "string" }, detail: { type: "string" }, estimatedGrams: number, estimatedKcal: number,
              estimatedProteinG: number, estimatedCarbG: number, estimatedFatG: number } } },
          samePackageViews: { type: "boolean" } } } } },
      messages: [{ role: "user", content: [
        { type: "text", text: `${SCENE}\n\nUser text (data): ${JSON.stringify(userText)}\nProducts the user scanned (data): ${
          JSON.stringify(deps.scanned ?? [])}` },
        ...photoUrls.map(url => ({ type: "image_url", image_url: { url: url.toString() } }))] }] })
  }).catch(recordFailure("scene_check", FOOD_MODEL, started))
  if (!response.ok) { await response.body?.cancel(); recordOpenRouterResponse("scene_check", FOOD_MODEL, started, null, `http_${response.status}`); return null }
  try {
    const body = await response.json()
    recordOpenRouterResponse("scene_check", FOOD_MODEL, started, body, "ok")
    const parsed = JSON.parse(body.choices?.[0]?.message?.content ?? "{}")
    const photo = (value: unknown) => typeof value === "number" && Number.isInteger(value) && value >= 0 && value < photoUrls.length
    return {
      barcodePackages: (parsed.barcodePackages ?? []).filter((row: any) => photo(row.photo) && row.count > 0 && row.count < 20)
        .map((row: any) => ({ photo: row.photo, count: row.count })),
      scannedPackages: (parsed.scannedPackages ?? []).filter((row: any) => photo(row.photo) && row.count > 0 && row.count < 20)
        .map((row: any) => ({ photo: row.photo, count: row.count })),
      otherPackages: (parsed.otherPackages ?? []).filter((row: any) => photo(row.photo)).slice(0, 6)
        .map((row: any) => ({ photo: row.photo, legibleText: typeof row.legibleText === "string" && row.legibleText.trim() ? row.legibleText.trim().slice(0, 120) : null })),
      otherFoods: (parsed.otherFoods ?? []).flatMap((item: Record<string, unknown>) => { const food = visibleFood(item); return food ? [food] : [] }).slice(0, 8),
      samePackageViews: parsed.samePackageViews === true }
  } catch { return null }
}
