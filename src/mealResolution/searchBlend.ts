/** Catalogue search blends two lists. The text search (letter trigrams on the name, exact brand or alias) is right
 * when the words are the food's own ("Vanilla Core Power Elite", an alias); the embedding search (meaning of name and
 * brand) finds the food when the words differ ("apples" → Apple, "sea salt rxbar" → RXBAR Chocolate Sea Salt,
 * "french press coffee" → Coffee, Brewed). A text hit that is exactly the query comes first, then the nearest foods
 * by meaning, then text hits containing every word of the query ("Apples (Bfruitful)" for "apples"), then the rest.
 * Containing hits must not crowd out meaning: every branded apple contains "apple", but "Apple" is the food meant.
 * Within exact and containing hits, foods without a brand come before brands the query doesn't name. */

export type SearchRow = { id: number; name: string; brand: string | null; knownAs: string[] | null }

const normalize = (value: string) => value.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "")
  .replace(/[^\p{L}\p{N}]+/gu, " ").trim()
// "apples" matches "apple", "tortillas" matches "tortilla".
const stem = (word: string) => word.length > 3 && word.endsWith("s") && !word.endsWith("ss") ? word.slice(0, -1) : word
const words = (value: string) => normalize(value).split(" ").filter(word => word.length >= 3 || /\d/.test(word)).map(stem)

/** Every word of the query is in the food's name, brand or an alias. */
export function containsQuery(query: string, row: SearchRow) {
  const wanted = words(query)
  if (!wanted.length) return false
  const have = new Set(words([row.name, row.brand ?? "", ...(row.knownAs ?? [])].join(" ")))
  return wanted.every(word => have.has(word))
}

/** The food's name (or name and brand) has exactly the query's words: "apple" for "apples", "Oat milk" for "oat milk". */
export function isQuery(query: string, row: SearchRow) {
  const wanted = [...new Set(words(query))].sort().join(" ")
  if (!wanted) return false
  const same = (value: string) => [...new Set(words(value))].sort().join(" ") === wanted
  return same(row.name) || (!!row.brand && same(`${row.name} ${row.brand}`)) || (row.knownAs ?? []).some(same)
}

/** Every word of the food's brand is in the query ("chosen foods avocado oil"). */
function namesBrand(query: string, row: SearchRow) {
  const brand = words(row.brand ?? "")
  const wanted = new Set(words(query))
  return brand.length > 0 && brand.every(word => wanted.has(word))
}

/** Generic foods before branded ones the query doesn't name: "avocado oil" is the plain oil before Chosen Foods'. */
const genericFirst = (query: string, rows: SearchRow[]) => {
  const generic = (row: SearchRow) => !words(row.brand ?? "").length || namesBrand(query, row)
  return [...rows.filter(generic), ...rows.filter(row => !generic(row))]
}

export function blendSearch(query: string, text: SearchRow[], near: SearchRow[], limit = 20): SearchRow[] {
  const exact = genericFirst(query, text.filter(row => isQuery(query, row)))
  const containing = genericFirst(query, text.filter(row => containsQuery(query, row)))
  const seen = new Set<number>()
  return [...exact, ...near, ...containing, ...text].filter(row => !seen.has(row.id) && seen.add(row.id)).slice(0, limit)
}
