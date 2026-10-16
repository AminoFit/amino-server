// Compares the recipe guard's Jev call on meal 30774 as production ran it (barcode chip in the words, no context) with
// the chip stripped and with the recipe context. Run: npm run run:ts-node-prod -- scripts/check-recipe-guard-raw.ts
import { selectWithJev } from "@/ai/jev"
import { userRecipeContext } from "@/mealResolution/historyCheck"

const words = "Mission flour large burrito, 58g sauce and my custom fajita recipe [barcode:00011246999225]"
const policy = (require("fs").readFileSync(process.env.POLICY_FILE ?? "src/mealResolution/historyCheck.ts", "utf8") as string)
const recipePolicy = policy.slice(policy.indexOf("const RECIPE_POLICY = `") + 23, policy.indexOf("`", policy.indexOf("const RECIPE_POLICY = `") + 23))
async function ask(state: Record<string, unknown>) {
  const out: any = await selectWithJev({ options: { yes: true, no: false }, state,
    questions: { selection: { type: "choice", instructions: recipePolicy,
      criteria: { yes: "The user means this recipe of theirs.", no: "The user does not mean this recipe." } } } } as any,
    AbortSignal.timeout(8000))
  return `${out.choice}@${(out.confidence ?? 0).toFixed(2)}`
}
async function main() {
  const theirRecipes = await userRecipeContext("6b005b82-88a5-457b-a1aa-60ecb1e90e21")
  const otherFoods = ["Flour Tortillas", "Roasted Pineapple & Habanero Glaze & Finishing Sauce"]
  const stripped = words.replace(/\[barcode:\d{6,14}\]/gi, " ").replace(/\s+/g, " ").trim()
  for (const [label, state] of [
    ["chip, no context  ", { userWords: words, answers: [], recipeName: "Chicken Fajita Base" }],
    ["stripped, no ctx  ", { userWords: stripped, answers: [], recipeName: "Chicken Fajita Base" }],
    ["stripped + context", { userWords: stripped, answers: [], recipeName: "Chicken Fajita Base", theirRecipes, otherFoods }],
  ] as const) {
    if (process.env.SHOW && label.startsWith("stripped +")) console.log(JSON.stringify({ options: ["yes", "no"], state,
      question: { instructions: recipePolicy, criteria: { yes: "The user means this recipe of theirs.", no: "The user does not mean this recipe." } } }, null, 2))
    const runs = []
    for (let i = 0; i < 4; i++) runs.push(await ask(state as any))
    console.log(label, runs.join("  "))
  }
}
main().catch(error => { console.error(error); process.exit(1) })
