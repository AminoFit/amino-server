// Retail barcode digits: GTIN-14 normalisation and check digits. Pure arithmetic, kept apart from barcode.ts (which loads
// sharp, zxing-wasm and the AI models) so routes that only check a barcode, like saving a food, don't load those.

/** Normalise a retail barcode to GTIN-14, or null when the check digit fails. */
export function normalizeGtin(code: string, format?: string): string | null {
  let digits = code.replace(/\D/g, "")
  if (format === "UPCE" || (format === undefined && digits.length === 6)) digits = expandUpcE(digits)
  if (!digits || ![8, 12, 13, 14].includes(digits.length)) return null
  const gtin = digits.padStart(14, "0")
  return checkDigit(gtin.slice(0, 13)) === Number(gtin[13]) ? gtin : null
}

export function checkDigit(body: string) {
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
