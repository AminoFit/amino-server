import sharp from "sharp"
import { LABEL_MODEL, providerPreferences } from "@/ai/models"

/** What a nutrition label says, transcribed exactly, for the column read. */
export type LabelFacts = {
  basis: "serving" | "100g" | "package"
  servingUnit: string | null
  servingAmount: number | null
  basisGrams: number
  packageGrams: number | null
  kcal: number | null
  kj: number | null
  proteinG: number
  carbG: number
  totalFatG: number
  satFatG: number | null
  sugarG: number | null
  fiberG: number | null
}

const PROMPT = `The photos are the same picture in three orientations: read the nutrition facts label from whichever is upright.
Transcribe it exactly as printed. Choose one column: the per-serving column when there is one, otherwise per 100 g,
otherwise per package. Copy every digit as printed (a comma is a decimal point) and never compute, convert or round:
if energy is printed only in kJ, give kj and leave kcal null. basisGrams is the grams (or mL) of the column you read
(100 for per 100 g); servingUnit and servingAmount are the printed serving ("1 package", "2 cookies") when the
column is per serving; packageGrams is the net weight or content printed on the package, if any.
If you cannot read the energy and all three macronutrients with confidence, set legible false instead of guessing.`

const number = { type: ["number", "null"] }
const SCHEMA = { type: "object", additionalProperties: false,
  required: ["legible", "basis", "servingUnit", "servingAmount", "basisGrams", "packageGrams", "kcal", "kj", "proteinG", "carbG",
    "totalFatG", "satFatG", "sugarG", "fiberG"],
  properties: { legible: { type: "boolean" }, basis: { type: "string", enum: ["serving", "100g", "package"] },
    servingUnit: { type: ["string", "null"] }, servingAmount: number, basisGrams: number, packageGrams: number, kcal: number, kj: number,
    proteinG: number, carbG: number, totalFatG: number, satFatG: number, sugarG: number, fiberG: number } }

/** Reads a nutrition label with the label model, sent upright, rotated left and rotated right (labels are often
 * photographed sideways). Returns null when the label is not legible. Transcription only: code does any arithmetic. */
export async function readNutritionLabel(photo: URL, deps: { fetch?: typeof fetch; env?: NodeJS.ProcessEnv; signal?: AbortSignal } = {}):
  Promise<LabelFacts | null> {
  const first = await readOnce(photo, deps)
  const gap = first ? energyGap(first) : null
  if (!first || gap == null || gap <= 0.2) return first
  // The digits do not add up (a 7 read as a 2): one more look with the arithmetic, done here, as a hint.
  const macros = 4 * first.proteinG + 4 * first.carbG + 9 * first.totalFatG
  const second = await readOnce(photo, deps, `A first reading gave ${first.kcal} kcal with protein ${first.proteinG} g, carbohydrate ` +
    `${first.carbG} g and fat ${first.totalFatG} g, but 4 x protein + 4 x carbohydrate + 9 x fat is ${Math.round(macros)} kcal. ` +
    `One of the digits is probably misread: look again carefully.`)
  return second && (energyGap(second) ?? 1) < gap ? second : first
}

/** How far the printed energy is from what the macros imply (4/4/9), as a fraction; null when there is no energy. */
export function energyGap(facts: Pick<LabelFacts, "kcal" | "proteinG" | "carbG" | "totalFatG">) {
  if (!facts.kcal) return null
  return Math.abs(4 * facts.proteinG + 4 * facts.carbG + 9 * facts.totalFatG - facts.kcal) / facts.kcal
}

async function readOnce(photo: URL, deps: { fetch?: typeof fetch; env?: NodeJS.ProcessEnv; signal?: AbortSignal }, hint?: string):
  Promise<LabelFacts | null> {
  const env = deps.env ?? process.env, key = env.OPENROUTER_API_KEY || env.OPEN_ROUTER_API_KEY
  if (!key) throw new Error("label_reader_unavailable")
  const doFetch = deps.fetch ?? fetch
  const image = await doFetch(photo, { signal: deps.signal })
  if (!image.ok) throw new Error("label_photo_unavailable")
  // Upright by EXIF first (sharp applies one rotation per pipeline), then the three orientations.
  const upright = await sharp(Buffer.from(await image.arrayBuffer())).rotate()
    .resize({ width: 1600, height: 1600, fit: "inside", withoutEnlargement: true }).toBuffer()
  const variants = await Promise.all([0, 90, 270].map(angle => sharp(upright).rotate(angle).jpeg({ quality: 85 }).toBuffer()))
  const response = await doFetch("https://openrouter.ai/api/v1/chat/completions", { method: "POST", signal: deps.signal,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    // The model's own thinking is what reads a dark, sideways label (with low effort it gave up in 3 s); leave room
    // for it and the answer (an 800-token cap once returned nothing).
    body: JSON.stringify({ model: LABEL_MODEL, provider: providerPreferences(LABEL_MODEL), max_tokens: 4000,
      response_format: { type: "json_schema", json_schema: { name: "label", strict: true, schema: SCHEMA } },
      messages: [{ role: "user", content: [{ type: "text", text: hint ? `${PROMPT}\n\n${hint}` : PROMPT },
        ...variants.map(buffer => ({ type: "image_url", image_url: { url: `data:image/jpeg;base64,${buffer.toString("base64")}` } }))] }] }) })
  if (!response.ok) throw new Error(`label_reader_failed_${response.status}`)
  const text: string = (await response.json()).choices?.[0]?.message?.content ?? ""
  // No JSON (an empty or prose reply) is an unreadable label, never an error that stops the meal.
  let parsed: LabelFacts & { legible: boolean }
  try { parsed = JSON.parse(text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1)) }
  catch { return null }
  const amount = (value: unknown) => typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null
  const kcal = amount(parsed.kcal) ?? (amount(parsed.kj) != null ? Math.round(amount(parsed.kj)! / 4.184 * 10) / 10 : null)
  const basisGrams = amount(parsed.basisGrams)
  const [proteinG, carbG, totalFatG] = [amount(parsed.proteinG), amount(parsed.carbG), amount(parsed.totalFatG)]
  if (!parsed.legible || kcal == null || !basisGrams || proteinG == null || carbG == null || totalFatG == null) return null
  return { basis: parsed.basis, servingUnit: parsed.servingUnit?.trim() || null, servingAmount: amount(parsed.servingAmount),
    basisGrams, packageGrams: amount(parsed.packageGrams) || null, kcal, kj: amount(parsed.kj), proteinG, carbG, totalFatG,
    satFatG: amount(parsed.satFatG), sugarG: amount(parsed.sugarG), fiberG: amount(parsed.fiberG) }
}

/** The label as a label source (proposeLabelFood's input): the column read becomes the serving; a per-100 g column
 * becomes a gram basis with the package as a serving when its weight is printed. */
export function labelSourceInput(facts: LabelFacts, product: { name: string; brand: string | null; gtin: string | null; identified: boolean }) {
  const unit = facts.basis === "100g" ? "g" : facts.basis === "package" ? "package" : facts.servingUnit?.replace(/^[\d.,/\s]+/, "") || "serving"
  const amount = facts.basis === "100g" ? 100 : facts.basis === "package" ? 1 : facts.servingAmount || 1
  return { ...product, servingUnit: unit, servingAmount: amount, servingGrams: facts.basisGrams, kcal: facts.kcal!,
    proteinG: facts.proteinG, carbG: facts.carbG, totalFatG: facts.totalFatG, fiberG: facts.fiberG, sugarG: facts.sugarG,
    satFatG: facts.satFatG, packageGrams: facts.packageGrams }
}
