// One-off check of the recipe guard (historyCheck.ts refersToRecipe) against Jev, with and without the user's recipe
// context. Run: npm run run:ts-node-prod -- scripts/check-recipe-guard.ts
import { selectWithJev } from "@/ai/jev"
import { RECIPE_YES_CONFIDENCE, refersToRecipe, userRecipeContext } from "@/mealResolution/historyCheck"

const SEB = "6b005b82-88a5-457b-a1aa-60ecb1e90e21"
type Case = { words: string; recipe: string; others: string[]; expect: boolean; extraRecipe?: string }
const cases: Case[] = [
  { words: "Mission flour large burrito, 58g sauce and my custom fajita recipe [barcode:00011246999225]", recipe: "Chicken Fajita Base", others: ["Flour Tortillas", "Roasted Pineapple & Habanero Glaze & Finishing Sauce"], expect: true },
  { words: "un burrito grande con salsa y mi receta de fajitas", recipe: "Chicken Fajita Base", others: ["Flour Tortillas"], expect: true },
  { words: "une tortilla avec ma recette de fajitas maison", recipe: "Chicken Fajita Base", others: ["Flour Tortillas"], expect: true },
  { words: "Wrap mit meinem selbstgemachten Fajita-Rezept", recipe: "Chicken Fajita Base", others: ["Flour Tortillas"], expect: true },
  { words: "half a portion of my beef broccoli bowl", recipe: "Beef & Broccoli Rice Bowls", others: [], expect: true },
  { words: "spaghetti with the pasta sauce I made", recipe: "Chicken Pasta Sauce - 9/30/26", others: ["spaghetti, Cooked"], expect: true },
  { words: "fajita mix from the store in a tortilla", recipe: "Chicken Fajita Base", others: ["Flour Tortillas"], expect: false },
  { words: "chicken fajitas at Chipotle", recipe: "Chicken Fajita Base", others: [], expect: false },
  { words: "pasta at a restaurant", recipe: "Chicken Pasta Sauce - 9/30/26", others: [], expect: false },
  { words: "chili flakes on my eggs", recipe: "Turkey Chili", others: ["eggs"], expect: false, extraRecipe: "Turkey Chili" },
  { words: "grilled chicken with broccoli and rice", recipe: "Beef & Broccoli Rice Bowls", others: [], expect: false },
  { words: "pollo a la plancha con brócoli y arroz", recipe: "Beef & Broccoli Rice Bowls", others: [], expect: false },
]

async function main() {
  const theirRecipes = await userRecipeContext(SEB)
  const tally = { yesGate: 0, noGate: 0, total: 0 }
  for (const c of cases) {
    const recipes = c.extraRecipe ? [...theirRecipes, { name: c.extraRecipe, madeDaysAgo: 20, loggedLast14Days: 2, lastLoggedDaysAgo: 5 }] : theirRecipes
    const runs: string[] = []
    for (let i = 0; i < 3; i++) {
      let out: any
      const jev: typeof selectWithJev = async (task, signal) => (out = await selectWithJev(task, signal))
      await refersToRecipe({ originalText: c.words }, c.recipe, { jev }, { theirRecipes: recipes, otherFoods: c.others })
      const conf = out.confidence ?? 0
      const yesGate = out.choice === "yes" && conf >= RECIPE_YES_CONFIDENCE  // the gate as shipped
      const noGate = !(out.choice === "no" && conf >= 0.7)            // proposed: veto only a confident no
      tally.total++; if (yesGate === c.expect) tally.yesGate++; if (noGate === c.expect) tally.noGate++
      runs.push(`${out.choice}@${conf.toFixed(2)}`)
    }
    console.log(`expect ${c.expect ? "yes" : "no "} | ${runs.join(" ").padEnd(30)} | ${c.words.slice(0, 55)}`)
  }
  console.log(`\ngate as shipped (yes ≥ ${RECIPE_YES_CONFIDENCE}): ${tally.yesGate}/${tally.total}   confident-no gate: ${tally.noGate}/${tally.total}`)
}
main().catch(error => { console.error(error); process.exit(1) })
