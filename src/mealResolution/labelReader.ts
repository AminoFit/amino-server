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
    body: JSON.stringify({ model: LABEL_MODEL, provider: providerPreferences(LABEL_MODEL), max_tokens: 800,
      response_format: { type: "json_schema", json_schema: { name: "label", strict: true, schema: SCHEMA } },
      messages: [{ role: "user", content: [{ type: "text", text: PROMPT },
        ...variants.map(buffer => ({ type: "image_url", image_url: { url: `data:image/jpeg;base64,${buffer.toString("base64")}` } }))] }] }) })
  if (!response.ok) throw new Error(`label_reader_failed_${response.status}`)
  const text: string = (await response.json()).choices?.[0]?.message?.content ?? ""
  const parsed = JSON.parse(text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1)) as LabelFacts & { legible: boolean }
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
