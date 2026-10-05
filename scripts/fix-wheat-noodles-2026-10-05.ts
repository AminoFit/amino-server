import { getUsdaFoodsInfo } from "@/FoodDbThirdPty/USDA/getFoodInfo"
import { createAdminSupabase } from "@/utils/supabase/serverAdmin"
import { COLUMN_NUTRIENTS, nutrientRows, nutrientsAt } from "@/nutrition"
// A21: wheat noodles (241) had whole-wheat pasta's macros and enriched egg noodles' vitamins and minerals (folate 140 µg,
// cholesterol 29 mg per 100 g). Shanghai noodles and plain wheat noodles are refined wheat flour, water and salt, not
// enriched: every value becomes USDA SR 168928 "Pasta, cooked, unenriched, without added salt", at its 160 g cup.
// Applied 2026-10-05 (backed up in CatalogueAuditBackup 'A21_wheat_noodles'); 241 also has the alias "Shanghai noodles".
//   TS_NODE_TRANSPILE_ONLY=1 npm run run:ts-node-prod -- scripts/fix-wheat-noodles-2026-10-05.ts
async function main() {
  const db = createAdminSupabase() as any
  const [usda] = (await getUsdaFoodsInfo({ fdcIds: ["168928"] })) ?? []
  const { data: food } = await db.from("FoodItem").select("*").eq("id", 241).single()
  const { data: rows } = await db.from("Nutrient").select("*").eq("foodItemId", 241)
  const grams = Number(food.defaultServingWeightGram)
  const values = nutrientsAt(usda as any, grams)!
  const { bgeBaseEmbedding: _, adaEmbedding: __, ...before } = food
  const backedUp = (await db.from("CatalogueAuditBackup").select("id", { count: "exact", head: true }).eq("audit", "A21_wheat_noodles")).count
  let error = backedUp ? null : (await db.from("CatalogueAuditBackup").insert([{ audit: "A21_wheat_noodles", tableName: "FoodItem", rowId: 241, before },
    ...(rows ?? []).map((row: any) => ({ audit: "A21_wheat_noodles", tableName: "Nutrient", rowId: row.id, before: row }))])).error
  if (error) throw error
  const columns = Object.fromEntries(Object.entries(COLUMN_NUTRIENTS).map(([key, column]) => [column, (values as any)[key] ?? null]))
  error = (await db.from("FoodItem").update({ ...columns, foodInfoSource: "USDA", externalId: "168928", lastUpdated: new Date().toISOString() }).eq("id", 241)).error
  if (error) throw error
  error = (await db.from("Nutrient").delete().eq("foodItemId", 241)).error
  if (error) throw error
  // nutrientRows gives {name, unit, amount}: the table's columns are nutrientName, nutrientUnit, nutrientAmountPerDefaultServing.
  error = (await db.from("Nutrient").insert(nutrientRows(values).map((row: any) => ({ foodItemId: 241, nutrientName: row.name,
    nutrientUnit: row.unit, nutrientAmountPerDefaultServing: row.amount })))).error
  if (error) throw error
  const after = (await db.from("FoodItem").select("kcalPerServing,proteinPerServing,carbPerServing,fiberPerServing,Nutrient(nutrientName)").eq("id", 241).single()).data
  console.log("241 per 160 g:", after.kcalPerServing, "kcal,", after.proteinPerServing, "P,", after.carbPerServing, "C,", after.fiberPerServing, "fibre,", after.Nutrient.length, "other nutrients")
  const rice = (await db.from("FoodItem").select("id,name,foodInfoSource,externalId,defaultServingWeightGram,kcalPerServing,fiberPerServing,Nutrient(nutrientName,nutrientAmountPerDefaultServing)").eq("id", 29).single()).data
  console.log("rice noodles 29:", rice.foodInfoSource, rice.externalId, Math.round(rice.kcalPerServing * 100 / rice.defaultServingWeightGram), "kcal/100g,", rice.Nutrient.length, "other nutrients")
}
main().then(() => process.exit(0), e => { console.error(e); process.exit(1) })
