import { normalizeGtin } from "@/mealResolution/barcode"

// Scanned products travel in a meal's text as tokens after its words, "… 2 × [barcode:00099482430092]" (amino-mobile
// common/barcode/draftBarcodes.ts withBarcodeChips), which the app shows as chips and the meal agent resolves. Agents
// read and edit the words and the scans separately (mcp_meal_json's `text` and `scans`); these split a meal's stored
// text into the two and put them back together the way the app writes it, so an edit never drops or garbles a scan.

const TOKEN = /(?:(\d+)\s*[×xX]\s*)?\[barcode:\s*(\d{6,14})\]/g
/** mcp_meal_json showed scans inline as "[scanned: Product, Brand]" for a while: never stored as words. */
const LABEL = /\[scanned:[^\]]*\]/gi
const MAX_WORDS = 500

export type Scan = { barcode: string; count: number }

const gtinOf = (digits: string) => normalizeGtin(digits) ?? digits.padStart(14, "0")
const tidy = (text: string) => text.replace(TOKEN, " ").replace(LABEL, " ").replace(/\s+/g, " ").trim()

/** A meal's stored text as its words and its scans (one entry per product, counts added up). */
export function splitMealText(content: string): { words: string; scans: Scan[] } {
  const scans: Scan[] = []
  for (const match of content.matchAll(TOKEN)) {
    const barcode = gtinOf(match[2])
    const count = Math.max(1, Number(match[1] ?? 1) || 1)
    const existing = scans.find(scan => scan.barcode === barcode)
    if (existing) existing.count += count
    else scans.push({ barcode, count })
  }
  return { words: tidy(content), scans }
}

/** The stored text for words and scans: the words, then each scan's token, as the app writes them. */
export function joinMealText(words: string, scans: Scan[]) {
  const tokens = scans.map(scan => `${scan.count > 1 ? `${scan.count} × ` : ""}[barcode:${scan.barcode}]`)
  return [tidy(words).slice(0, MAX_WORDS), ...tokens].filter(Boolean).join(" ")
}

/** An agent's scans checked and merged: valid barcode digits only, one entry per product. Null for a bad barcode. */
export function cleanScans(input: { barcode: string; count?: number }[]): { scans: Scan[]; invalid: string | null } {
  const scans: Scan[] = []
  for (const entry of input) {
    const barcode = normalizeGtin(entry.barcode)
    if (!barcode) return { scans: [], invalid: entry.barcode }
    const count = Math.max(1, Math.round(entry.count ?? 1))
    const existing = scans.find(scan => scan.barcode === barcode)
    if (existing) existing.count += count
    else scans.push({ barcode, count })
  }
  return { scans, invalid: null }
}
