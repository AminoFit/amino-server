import { existsSync, readFileSync } from "node:fs"
import path from "node:path"
import sharp from "sharp"
import { prepareZXingModule, readBarcodes, type ReaderOptions } from "zxing-wasm/reader"
import { FOOD_MODEL, providerPreferences } from "@/ai/models"
import { recordFailure, recordOpenRouterResponse } from "./runRecorder"

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
  // Load the WASM from disk (traced into the function) instead of a CDN. The path is
  // resolved at runtime so webpack does not try to bundle the binary as a module.
  const traced = path.join(process.cwd(), "node_modules", "zxing-wasm", "dist", "reader", "zxing_reader.wasm")
  const wasm = readFileSync(existsSync(traced) ? traced : (0, eval)("require").resolve("zxing-wasm/reader/zxing_reader.wasm"))
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

/** Every retail barcode ZXing reads in one image, each with the box it was found in. */
async function readAll(image: Buffer) {
  ensureReader()
  const results = await readBarcodes(new Uint8Array(image), { ...RETAIL, maxNumberOfSymbols: 8, tryHarder: true, tryDownscale: true })
  return results.flatMap(result => {
    const gtin = result.isValid ? normalizeGtin(result.text, result.format) : null
    if (!gtin) return []
    const corners = [result.position.topLeft, result.position.topRight, result.position.bottomLeft, result.position.bottomRight]
    const xs = corners.map(point => point.x), ys = corners.map(point => point.y)
    const box: Box = { left: Math.min(...xs), top: Math.min(...ys), width: Math.max(...xs) - Math.min(...xs), height: Math.max(...ys) - Math.min(...ys) }
    return [{ gtin, format: result.format, box }]
  })
}

/** Whether two boxes overlap (a located barcode is one already read). */
const overlaps = (a: Box, b: Box) => a.left < b.left + b.width && b.left < a.left + a.width && a.top < b.top + b.height && b.top < a.top + a.height

/** Every barcode in one photo (several products can share a photo): all the whole image reads, then any barcode the
 * locator boxes that wasn't read, from a full-resolution crop. Boxes that still don't decode are returned, not dropped:
 * a package is there that nobody identified. Without any whole-image read, the single-barcode chain (tiles, lighting)
 * runs as before. Digits only ever come from ZXing; the locator only says where to look. */
export async function decodeBarcodes(photo: Buffer, deps: { locate?: (jpeg: Buffer, width: number, height: number) => Promise<Box[]> } = {}):
  Promise<{ reads: BarcodeRead[]; undecodedBoxes: Box[] }> {
  const started = performance.now()
  const full = await sharp(photo).rotate().grayscale().jpeg({ quality: 95 }).toBuffer()
  const { width: fullW = 0, height: fullH = 0 } = await sharp(full).metadata()
  const jpeg = fullW > 1600 || fullH > 1600 ? await sharp(full).resize({ width: 1600, height: 1600, fit: "inside" }).jpeg({ quality: 90 }).toBuffer() : full
  const { width = 0, height = 0 } = jpeg === full ? { width: fullW, height: fullH } : await sharp(jpeg).metadata()
  const [whole, boxes] = await Promise.all([readAll(jpeg), deps.locate ? deps.locate(jpeg, width, height).catch(() => [] as Box[]) : Promise.resolve([] as Box[])])
  const ms = () => Math.round(performance.now() - started)
  const reads: BarcodeRead[] = whole.map(hit => ({ gtin: hit.gtin, format: hit.format, method: "whole", ms: ms() }))
  if (!whole.length) {
    const single = await decodeBarcode(photo, { locate: deps.locate ? async () => boxes : undefined })
    if (single) reads.push(single)
  }
  // Located barcodes that no whole-image read covers: a crop each, at full resolution.
  const undecodedBoxes: Box[] = []
  const scale = fullW / width
  for (const box of boxes.slice(0, 6)) {
    if (whole.some(hit => overlaps(hit.box, box)) || (!whole.length && reads.length && boxes.length === 1)) continue
    const padX = box.width * 0.2, padY = box.height * 0.2
    const region = await crop(full, { left: (box.left - padX) * scale, top: (box.top - padY) * scale,
      width: (box.width + 2 * padX) * scale, height: (box.height + 2 * padY) * scale }, fullW, fullH)
    const hit = region && await read(region, true)
    if (hit) reads.push({ ...hit, method: "located", ms: ms() })
    else undecodedBoxes.push(box)
  }
  // The same barcode twice in one photo is one product.
  const seen = new Set<string>()
  return { reads: reads.filter(read => !seen.has(read.gtin) && seen.add(read.gtin)), undecodedBoxes }
}

/** Pixel box in the oriented image. */
export type Box = { left: number; top: number; width: number; height: number }
export type BarcodeRead = { gtin: string; format: string; method: "whole" | "located" | "tiles" | "flattened"; ms: number }

async function crop(image: Buffer, box: Box, width: number, height: number, upscaleTo = 900) {
  const left = Math.max(0, Math.floor(box.left)), top = Math.max(0, Math.floor(box.top))
  const region = { left, top, width: Math.min(width - left, Math.ceil(box.width)), height: Math.min(height - top, Math.ceil(box.height)) }
  if (region.width < 8 || region.height < 8) return null
  const scale = Math.max(1, Math.min(3, upscaleTo / Math.max(region.width, region.height)))
  return sharp(image).extract(region).resize(Math.round(region.width * scale), Math.round(region.height * scale)).png().toBuffer()
}

/** 3x2 tiles with ~20% overlap, full effort. */
async function readTiles(image: Buffer, width: number, height: number) {
  const tileW = width / 3, tileH = height / 2
  for (let row = 0; row < 2; row++) for (let col = 0; col < 3; col++) {
    const region = await crop(image, { left: col * tileW - tileW * 0.2, top: row * tileH - tileH * 0.2, width: tileW * 1.4, height: tileH * 1.4 }, width, height, 1200)
    const hit = region && await read(region, true)
    if (hit) return hit
  }
  return null
}

/** The image divided by its own blur (a flat-field correction), stretched to full contrast. */
async function flatten(gray: Buffer, sigma: number) {
  const lighting = await sharp(gray).blur(sigma).negate().toBuffer()
  return sharp(gray).composite([{ input: lighting, blend: "colour-dodge" }]).grayscale().normalise().png().toBuffer()
}

/** Decode one photo, cheapest first: the whole image, then overlapping tiles, then both again with the lighting
 * evened out, then (only when the photo has more resolution than the working copy) a
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

  const tiles = await readTiles(jpeg, width, height)
  if (tiles) return done(tiles, "tiles")

  // Glare and shadow: ZXing sets each scan line's black/white threshold from the whole line, so a dark background
  // or a highlight on a curved bottle washes out faint bars that a tight crop reads easily (meal 30384). Dividing by
  // a heavy blur evens out the lighting; then the whole image and the tiles again, at two blur sizes. Real photos
  // gained 6 correct reads on 42 and lost none (2026-09-30, 600 photos).
  for (const divisor of [64, 32]) {
    const flat = await flatten(jpeg, Math.max(width, height) / divisor)
    const hit = await read(flat, true) ?? await readTiles(flat, width, height)
    if (hit) return done(hit, "flattened")
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
  const model = deps.model ?? FOOD_MODEL, started = performance.now()
  const response = await (deps.fetch ?? fetch)("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    signal: AbortSignal.timeout(6000),
    body: JSON.stringify({ model: deps.model ?? FOOD_MODEL, temperature: 0, reasoning: { effort: "minimal", exclude: true },
      provider: providerPreferences(deps.model ?? FOOD_MODEL), max_tokens: 400,
      response_format: { type: "json_schema", json_schema: { name: "barcodes", strict: true, schema: { type: "object", additionalProperties: false,
        required: ["boxes"], properties: { boxes: { type: "array", items: { type: "object", additionalProperties: false, required: ["box_2d"],
          properties: { box_2d: { type: "array", items: { type: "integer" } } } } } } } } },
      messages: [{ role: "user", content: [{ type: "text", text: LOCATE_PROMPT },
        { type: "image_url", image_url: { url: `data:image/jpeg;base64,${jpeg.toString("base64")}` } }] }] })
  }).catch(recordFailure("barcode_locate", model, started))
  if (!response.ok) { await response.body?.cancel(); recordOpenRouterResponse("barcode_locate", model, started, null, `http_${response.status}`); return [] }
  const body = await response.json()
  recordOpenRouterResponse("barcode_locate", model, started, body, "ok")
  let parsed: { boxes?: { box_2d?: unknown }[] }
  try { parsed = JSON.parse(body.choices?.[0]?.message?.content ?? "{}") } catch { return [] }
  return (parsed.boxes ?? []).flatMap(({ box_2d }) => {
    if (!Array.isArray(box_2d) || box_2d.length !== 4 || box_2d.some(v => typeof v !== "number")) return []
    const [ymin, xmin, ymax, xmax] = (box_2d as number[]).map(v => Math.min(1000, Math.max(0, v)))
    if (ymax <= ymin || xmax <= xmin) return []
    return [{ left: xmin / 1000 * width, top: ymin / 1000 * height, width: (xmax - xmin) / 1000 * width, height: (ymax - ymin) / 1000 * height }]
  })
}
