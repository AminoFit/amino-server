// "My usual …" against both meal guards (historyCheck.ts): the recipe check and the past-meal check, three runs each.
// Run: npm run run:ts-node-prod -- scripts/check-usual.ts
import { selectWithJev } from "@/ai/jev"
import { refersToPastMeal, refersToRecipe, userRecipeContext } from "@/mealResolution/historyCheck"

const cases = [
  "my usual fajitas base in a tortilla",
  "my usual fajita base",
  "the usual fajita filling, same as last time",
  "mi base de fajitas de siempre",
  "my usual burrito",
  // Should not refer to a past meal:
  "a burrito with fajita base",
  "fajitas for dinner",
  "chicken fajitas, usually I'd skip the sour cream but not today",
]
async function main() {
  const theirRecipes = await userRecipeContext("6b005b82-88a5-457b-a1aa-60ecb1e90e21")
  for (const words of cases) {
    const recipe: string[] = [], past: string[] = []
    for (let i = 0; i < 3; i++) {
      let out: any
      const jev: typeof selectWithJev = async (task, signal) => (out = await selectWithJev(task, signal))
      await refersToRecipe({ originalText: words }, "Chicken Fajita Base", { jev }, { theirRecipes, otherFoods: ["Flour Tortillas"] })
      recipe.push(`${out.choice}@${(out.confidence ?? 0).toFixed(2)}`)
      await refersToPastMeal({ originalText: words }, { jev })
      past.push(`${out.choice}@${(out.confidence ?? 0).toFixed(2)}`)
    }
    console.log(`${words.padEnd(46)} recipe: ${recipe.join(" ")}   past meal: ${past.join(" ")}`)
  }
}
main().catch(error => { console.error(error); process.exit(1) })
