import { readFileSync } from "node:fs"
import sharp from "sharp"
import { prepareZXingModule, readBarcodes, type ReaderOptions } from "zxing-wasm/reader"

// Barcode digits come only from ZXing. A model may help locate a barcode, never read it.

/** Normalise a retail barcode to GTIN-14, or null when the check digit fails. */
export function normalizeGtin(code: string, format?: string): string | null {
  let digits = code.replace(/\D/g, "")
  if (format === "UPCE" || (format === undefined && digits.length === 6)) digits = expandUpcE(digits)
  if (!digits || ![8, 12, 13, 14].includes(digits.length)) return null
  const gtin = digits.padStart(14, "0")
  return checkDigit(gtin.slice(0, 13)) === Number(gtin[13]) ? gtin : null
}

function checkDigit(body: string) {
  const sum = [...body].reverse().reduce((total, digit, index) => total + Number(digit) * (index % 2 === 0 ? 3 : 1), 0)
  return (10 - (sum % 10)) % 10
}

/** UPC-E (with number system and check digit) to its UPC-A equivalent. */
function expandUpcE(code: string): string {
  const upce = code.length === 6 ? `0${code}${checkDigit(`0${code}`)}` : code
  if (upce.length !== 8) return ""
  const [n, d1, d2, d3, d4, d5, last, check] = upce
  const body = ["0", "1", "2"].includes(last) ? `${d1}${d2}${last}0000${d3}${d4}${d5}` :
    last === "3" ? `${d1}${d2}${d3}00000${d4}${d5}` : last === "4" ? `${d1}${d2}${d3}${d4}00000${d5}` :
    `${d1}${d2}${d3}${d4}${d5}0000${last}`
  return `${n}${body}${check}`
}

let prepared = false
function ensureReader() {
  if (prepared) return
  // Load the WASM from disk (bundled with the function) instead of a CDN.
  const wasm = readFileSync(require.resolve("zxing-wasm/reader/zxing_reader.wasm"))
  prepareZXingModule({ overrides: { wasmBinary: wasm.buffer.slice(wasm.byteOffset, wasm.byteOffset + wasm.byteLength) as ArrayBuffer } })
  prepared = true
}

const RETAIL: ReaderOptions = { formats: ["EAN13", "EAN8", "UPCA", "UPCE"], maxNumberOfSymbols: 1, tryRotate: true, tryInvert: false }

async function read(image: Buffer, tryHarder: boolean) {
  ensureReader()
  for (const result of await readBarcodes(new Uint8Array(image), { ...RETAIL, tryHarder, tryDownscale: true })) {
    const gtin = result.isValid ? normalizeGtin(result.text, result.format) : null
    if (gtin) return { gtin, format: result.format }
  }
  return null
}

/** Pixel box in the oriented image. */
export type Box = { left: number; top: number; width: number; height: number }
export type BarcodeRead = { gtin: string; format: string; method: "whole" | "located" | "tiles"; ms: number }

async function crop(image: Buffer, box: Box, width: number, height: number, upscaleTo = 900) {
  const left = Math.max(0, Math.floor(box.left)), top = Math.max(0, Math.floor(box.top))
  const region = { left, top, width: Math.min(width - left, Math.ceil(box.width)), height: Math.min(height - top, Math.ceil(box.height)) }
  if (region.width < 8 || region.height < 8) return null
  const scale = Math.max(1, Math.min(3, upscaleTo / Math.max(region.width, region.height)))
  return sharp(image).extract(region).resize(Math.round(region.width * scale), Math.round(region.height * scale)).png().toBuffer()
}

/** Decode one photo, cheapest first: the whole image, then overlapping tiles,
 * then (only when the photo has more resolution than the working copy) a
 * full-resolution crop around the boxes an optional locator suggests. */
export async function decodeBarcode(photo: Buffer, deps: { locate?: (jpeg: Buffer, width: number, height: number) => Promise<Box[]> } = {}): Promise<BarcodeRead | null> {
  const started = performance.now()
  const full = await sharp(photo).rotate().grayscale().jpeg({ quality: 95 }).toBuffer()
  const { width: fullW = 0, height: fullH = 0 } = await sharp(full).metadata()
  const jpeg = fullW > 1600 || fullH > 1600 ? await sharp(full).resize({ width: 1600, height: 1600, fit: "inside" }).jpeg({ quality: 90 }).toBuffer() : full
  const { width = 0, height = 0 } = jpeg === full ? { width: fullW, height: fullH } : await sharp(jpeg).metadata()
  const done = (hit: { gtin: string; format: string } | null, method: BarcodeRead["method"]) =>
    hit ? { ...hit, method, ms: Math.round(performance.now() - started) } : null

  // Try-harder costs ~1 ms at upload size (<=1600 px) and finds more barcodes.
  const whole = await read(jpeg, true)
  if (whole) return done(whole, "whole")

  // 3x2 tiles with ~20% overlap, full effort.
  const tileW = width / 3, tileH = height / 2
  for (let row = 0; row < 2; row++) for (let col = 0; col < 3; col++) {
    const region = await crop(jpeg, { left: col * tileW - tileW * 0.2, top: row * tileH - tileH * 0.2, width: tileW * 1.4, height: tileH * 1.4 }, width, height, 1200)
    const hit = region && await read(region, true)
    if (hit) return done(hit, "tiles")
  }

  // A located crop only helps when the original holds detail the working copy lost.
  if (!deps.locate || jpeg === full) return null
  const scale = fullW / width
  for (const box of (await deps.locate(jpeg, width, height).catch(() => [])).slice(0, 3)) {
    const padX = box.width * 0.2, padY = box.height * 0.2
    const region = await crop(full, { left: (box.left - padX) * scale, top: (box.top - padY) * scale,
      width: (box.width + 2 * padX) * scale, height: (box.height + 2 * padY) * scale }, fullW, fullH)
    const hit = region && await read(region, true)
    if (hit) return done(hit, "located")
  }
  return null
}

const LOCATE_PROMPT = `Find every retail product barcode in this image: the block of parallel black and white vertical bars.
Box only the bars, not the printed digits or any other text or pattern. Return {"boxes":[{"box_2d":[ymin,xmin,ymax,xmax]}]}
with coordinates normalised to 0-1000. Return {"boxes":[]} when there is no barcode.`

/** Flash bounding boxes as a hint for where to crop; it never reads digits. */
export async function locateBarcodesWithFlash(jpeg: Buffer, width: number, height: number,
  deps: { fetch?: typeof fetch; model?: string; env?: NodeJS.ProcessEnv } = {}): Promise<Box[]> {
  const env = deps.env ?? process.env, key = env.OPENROUTER_API_KEY || env.OPEN_ROUTER_API_KEY
  if (!key) return []
  const response = await (deps.fetch ?? fetch)("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    signal: AbortSignal.timeout(6000),
    body: JSON.stringify({ model: deps.model ?? "google/gemini-3.8-flash", temperature: 0, reasoning: { effort: "minimal", exclude: true },
      provider: { require_parameters: true }, max_tokens: 400,
      response_format: { type: "json_schema", json_schema: { name: "barcodes", strict: true, schema: { type: "object", additionalProperties: false,
        required: ["boxes"], properties: { boxes: { type: "array", items: { type: "object", additionalProperties: false, required: ["box_2d"],
          properties: { box_2d: { type: "array", items: { type: "integer" } } } } } } } } },
      messages: [{ role: "user", content: [{ type: "text", text: LOCATE_PROMPT },
        { type: "image_url", image_url: { url: `data:image/jpeg;base64,${jpeg.toString("base64")}` } }] }] })
  })
  if (!response.ok) { await response.body?.cancel(); return [] }
  const body = await response.json()
  let parsed: { boxes?: { box_2d?: unknown }[] }
  try { parsed = JSON.parse(body.choices?.[0]?.message?.content ?? "{}") } catch { return [] }
  return (parsed.boxes ?? []).flatMap(({ box_2d }) => {
    if (!Array.isArray(box_2d) || box_2d.length !== 4 || box_2d.some(v => typeof v !== "number")) return []
    const [ymin, xmin, ymax, xmax] = (box_2d as number[]).map(v => Math.min(1000, Math.max(0, v)))
    if (ymax <= ymin || xmax <= xmin) return []
    return [{ left: xmin / 1000 * width, top: ymin / 1000 * height, width: (xmax - xmin) / 1000 * width, height: (ymax - ymin) / 1000 * height }]
  })
}
