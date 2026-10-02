// A staple's name says whether its values are cooked, dry or raw (2026-10-02): "rice" at 130 kcal/100 g is cooked rice,
// and someone weighing 100 g of dry rice who picks it logs 130 kcal instead of ~360. Grains, pasta, oats and pulses
// cooked are about a third of their dry energy, so the state is read from energy per 100 g, never guessed: a value in
// between is left unnamed. Meat and potatoes overlap raw and cooked, so only an unbranded food whose energy is USDA's
// for one state (within 3%) is named. Only plain staples ("Brown Rice", "Quick 1 Minute Oats"), never dishes
// ("Mexican Rice", "Chicken Pasta"), and never a name that already says how it's prepared.

type Staple = { core: string[]; words: string[]; cooked: [number, number]; dry: [number, number]; cookedWord?: string }

const GENERAL = ["organic", "whole", "grain", "grains", "plain", "enriched", "gluten", "free", "white", "brown", "red", "black",
  "green", "yellow", "long", "short", "medium", "and", "of", "100", "style", "premium", "natural", "traditional"]
const STAPLES: Record<string, Staple> = {
  rice: { core: ["rice"], words: ["basmati", "jasmine", "wild", "arborio", "calrose", "thai", "sushi", "sticky", "glutinous",
    "brown", "parboiled"], cooked: [80, 200], dry: [300, 400] },
  pasta: { core: ["pasta", "spaghetti", "penne", "macaroni", "fusilli", "rigatoni", "linguine", "fettuccine", "rotini", "orzo",
    "noodle", "noodles", "elbows", "elbow", "shells", "farfalle", "ziti", "bucatini", "capellini", "angel", "hair", "spaghettini"],
  words: ["wheat", "egg", "rice", "protein", "chickpea", "lentil", "durum", "semolina", "thin", "spinach", "soba", "mini"],
  cooked: [100, 220], dry: [320, 410] },
  oats: { core: ["oats", "oat", "oatmeal"], words: ["rolled", "steel", "cut", "quick", "old", "fashioned", "minute", "1", "one",
    "instant"], cooked: [50, 120], dry: [340, 420] },
  quinoa: { core: ["quinoa"], words: ["tricolor", "tri", "color", "colour"], cooked: [100, 160], dry: [340, 400] },
  lentils: { core: ["lentil", "lentils"], words: ["beluga", "french", "split", "du", "puy"], cooked: [90, 145], dry: [300, 380] },
  couscous: { core: ["couscous"], words: ["pearl", "israeli", "wheat"], cooked: [100, 160], dry: [340, 400] }
}
/** Unbranded meat and potatoes: USDA's energy per 100 g for one state (SR Legacy). */
const REFERENCES: { name: RegExp; kcal: number; state: string }[] = [
  { name: /^(boneless,? skinless )?chicken breasts?( fillets?)?$/, kcal: 120, state: "Raw" },
  { name: /^(boneless,? skinless )?chicken breasts?( fillets?)?$/, kcal: 165, state: "Cooked" },
  { name: /^(80% lean )?ground beef( 80\/20)?$/, kcal: 254, state: "Raw" },
  { name: /^(80% lean )?ground beef( 80\/20)?$/, kcal: 272, state: "Cooked" },
  { name: /^ground beef \(?85% lean ?\/ ?15% fat\)?$|^85% lean ground beef$/, kcal: 215, state: "Raw" },
  { name: /^ground beef \(?85% lean ?\/ ?15% fat\)?$|^85% lean ground beef$/, kcal: 250, state: "Cooked" },
  { name: /^ground beef \(?90% lean ?\/ ?10% fat\)?$|^90% lean ground beef$/, kcal: 176, state: "Raw" },
  { name: /^ground beef \(?90% lean ?\/ ?10% fat\)?$|^90% lean ground beef$/, kcal: 217, state: "Cooked" },
  { name: /^(russet |white |baby |diced )?potato(es)?$/, kcal: 77, state: "Raw" },
  { name: /^(russet |white |baby |diced )?potato(es)?$/, kcal: 93, state: "Baked" },
  { name: /^(russet |white |baby |diced )?potato(es)?$/, kcal: 87, state: "Boiled" }
]

export const STATED = /\b(cooked|uncooked|raw|dry|dried|boiled|steamed|grilled|baked|roasted|fried|canned|prepared|ready|microwav\w*|precooked|pre-cooked|broiled|braised|roast|sauteed|sautéed|as packaged|ready to eat|heat and eat)\b/i
const tokens = (text: string) => text.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "")
  .split(/[^a-z0-9]+/).filter(Boolean)

/** The name with its state ("White Rice, Cooked", "Oats, Dry"), or the name unchanged when it already says, isn't a plain
 * staple, or its energy doesn't tell. */
export function withState(name: string, food: { brand: string | null; kcalPer100g: number }): string {
  const kcal = food.kcalPer100g
  if (!Number.isFinite(kcal) || kcal <= 0 || STATED.test(name)) return name
  // A name that starts with its brand ("Publix, Oats") is read without it; a brand word elsewhere is the food's own
  // ("Snack Gao Rice Snack" is a snack).
  const brandWords = tokens(food.brand ?? ""), all = tokens(name)
  const words = brandWords.length && brandWords.every((word, at) => all[at] === word) ? all.slice(brandWords.length) : all
  for (const staple of Object.values(STAPLES)) {
    if (!words.some(word => staple.core.includes(word))) continue
    // Every word must belong to this staple ("rice noodles" is pasta, not rice); a dish matches none.
    const allowed = new Set([...staple.core, ...staple.words, ...GENERAL])
    if (!words.every(word => allowed.has(word))) continue
    const state = kcal >= staple.cooked[0] && kcal <= staple.cooked[1] ? "Cooked"
      : kcal >= staple.dry[0] && kcal <= staple.dry[1] ? "Dry" : null
    return state ? `${name.trim()}, ${state}` : name
  }
  if (food.brand?.trim()) return name
  const plain = tokens(name).join(" ").replace(/ (\d+) (\d+)$/, " $1/$2")
  const lowered = name.trim().toLowerCase()
  const match = REFERENCES.find(ref => (ref.name.test(lowered) || ref.name.test(plain)) && Math.abs(kcal - ref.kcal) <= 0.03 * ref.kcal)
  return match ? `${name.trim()}, ${match.state}` : name
}
