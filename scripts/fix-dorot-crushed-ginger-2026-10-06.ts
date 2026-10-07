// A25 (2026-10-06): Dorot Gardens Crushed Ginger Cubes (barcode 00794376100142) existed only as the owner's private food
// 15387 (a 4.4 g cube, typed from the label), though USDA has the product (FoodData Central 2640048) and its garlic
// sibling (15386) is a shared USDA food. Open Food Facts has the barcode with no nutrition. USDA's record names grams but
// no serving size, which the parser read as a size of nothing and lost every value (fixed in getFoodInfo: such a record
// stays per 100 g). The app's duplicate check (createFoodFromSource) then finds the record is 15387, whose values are
// USDA's per cube (5 kcal, 1 g carbs, 10 mg potassium, the rest 0), so 15387 itself becomes the shared food with USDA as
// its source, as 15386 is; its recipe use (Beef & Broccoli Rice Bowls), cube serving and icon stay. Nothing logged it.
// --apply writes; otherwise a dry run (checks only).
//   TS_NODE_TRANSPILE_ONLY=1 npm run run:ts-node-prod -- scripts/fix-dorot-crushed-ginger-2026-10-06.ts [--apply]
import { createAdminSupabase } from "@/utils/supabase/serverAdmin"
import { createFoodSources } from "@/mealResolution/foodSources"

const FOOD_ID = 15387, FDC_ID = 2640048, GTIN = "00794376100142"
const near = (a: number, b: number) => Math.abs(a - b) <= Math.max(0.05, 0.02 * Math.max(a, b))

async function main() {
  const apply = process.argv.includes("--apply")
  const db = createAdminSupabase() as any
  const { data: food, error } = await db.from("FoodItem")
    .select("id,gtin,privateToUserId,archivedAt,defaultServingWeightGram,kcalPerServing,carbPerServing,proteinPerServing,totalFatPerServing")
    .eq("id", FOOD_ID).single()
  if (error || food.gtin !== GTIN || !food.privateToUserId || food.archivedAt) throw new Error(`food ${FOOD_ID} isn't as expected: ${JSON.stringify(food)}`)
  const { count } = await db.from("FoodItem").select("id", { count: "exact", head: true }).eq("gtin", GTIN).is("privateToUserId", null)
  if (count) throw new Error(`a shared food already has ${GTIN}`)

  // USDA's values, scaled to 15387's cube, must be 15387's: otherwise this isn't a source change.
  const sources = createFoodSources({ userId: food.privateToUserId, messageId: null, signal: AbortSignal.timeout(30000),
    discover: () => {}, beforeChange: async () => {} } as any, { db })
  const [source] = await sources.usdaSource(FDC_ID)
  if (!source) throw new Error(`USDA ${FDC_ID} has no usable record`)
  const scale = Number(food.defaultServingWeightGram) / source.defaultServingWeightGram
  const pairs: [string, number, number][] = [["kcal", source.kcal * scale, food.kcalPerServing], ["carbs", source.carbG * scale, food.carbPerServing],
    ["protein", source.proteinG * scale, food.proteinPerServing], ["fat", source.totalFatG * scale, food.totalFatPerServing]]
  for (const [name, usda, ours] of pairs) {
    console.log(`  ${name}: USDA ${usda.toFixed(2)}, 15387 ${ours}`)
    if (!near(usda, Number(ours))) throw new Error(`${name} differs from USDA`)
  }
  if (!apply) { console.log("dry run: nothing written"); return }

  const { error: updateError } = await db.from("FoodItem").update({ privateToUserId: null, foodInfoSource: "USDA",
    externalId: String(FDC_ID), description: `USDA FoodData Central ${FDC_ID}`, verified: true,
    lastUpdated: new Date().toISOString().replace("Z", "") }).eq("id", FOOD_ID)
  if (updateError) throw updateError
  console.log(`applied: ${FOOD_ID} is a shared USDA food`)
}

main().catch(error => { console.error(error); process.exit(1) })
