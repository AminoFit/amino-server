// One-off (2026-10-02), the owner's go-ahead:
//  - Trü Frü 15331 and 15312: imported as "Nature's Blueberries" (the pack's wording, cut short), they read as plain fruit.
//    Named for what they are; the pack's wording stays in knownAs so searching it still finds them. Re-embedded.
//  - Simply Orange 529, 7059, 7060, 8990: the same juice as 15348 (529 and 8990 are the calcium version), so they take
//    its new icon and fill the vitamins they lack from its label, per gram (fill-only: their calcium and vitamin D stay).
//    Their logs are filled the same way.
//  - Honey Nut Cheerios 5578 and 11166: values right per gram (dry cereal, 378 kcal/100 g) but defaulting to 160 g
//    ("cup with 1/2 cup skim milk", a label's milk column); the default becomes one cup, 37 g, the same per gram.
// Old values are backed up in CatalogueAuditBackup. --apply writes; otherwise a dry run (rolled back).
import { Client } from "pg"
import { nutrientsAt, type NutrientKey } from "@/nutrition"
import { getCachedOrFetchEmbeddings } from "@/utils/embeddingsCache/getCachedOrFetchEmbeddings"

const AUDIT = "catalogue_2026-10-02b"
const SIMPLY_LABEL = 15348
const SIMPLY_SIBLINGS = [529, 7059, 7060, 8990]
const ORANGE_JUICE_ICON = 14385
const RENAMES = [
  { id: 15331, name: "Frozen Blueberries in White & Dark Chocolate" },
  { id: 15312, name: "Frozen Raspberries in White & Milk Chocolate" }
]
const CHEERIOS = [5578, 11166]
const CUP_GRAMS = 37
const PER_SERVING = ["kcalPerServing", "totalFatPerServing", "satFatPerServing", "transFatPerServing", "carbPerServing",
  "sugarPerServing", "addedSugarPerServing", "proteinPerServing", "fiberPerServing"]
/** The log columns the label's vitamins fill. */
const LOG_KEY: Record<string, NutrientKey> = { thiamin: "vitaminB1Mg", niacin: "vitaminB3Mg", vitaminB6: "vitaminB6Mg",
  folate: "vitaminB9Mcg", magnesium: "magnesiumMg", vitaminC: "vitaminCMg" }
const round = (value: number) => Math.round(value * 1e4) / 1e4

type Pg = Client
const backupFood = (pg: Pg, id: number) => pg.query(`INSERT INTO "CatalogueAuditBackup"(audit, "tableName", "rowId", before)
  SELECT $1, 'FoodItem', id, to_jsonb(f) - 'bgeBaseEmbedding' FROM "FoodItem" f WHERE id = $2`, [AUDIT, id])
const food = async (pg: Pg, id: number) => (await pg.query(`SELECT f.*, coalesce((SELECT json_agg(n) FROM "Nutrient" n
  WHERE n."foodItemId" = f.id), '[]') AS "Nutrient" FROM "FoodItem" f WHERE f.id = $1`, [id])).rows[0]

async function renames(pg: Pg) {
  for (const { id, name } of RENAMES) {
    const before = await food(pg, id)
    if (!/^nature's/i.test(before.name)) throw new Error(`${id} was renamed since: ${before.name}`)
    const [vector] = await getCachedOrFetchEmbeddings("BGE_BASE", [`${name} - Trü Frü`])
    const knownAs = [...new Set([...(before.knownAs ?? []), before.name])]
    await backupFood(pg, id)
    await pg.query(`UPDATE "FoodItem" SET name = $2, brand = 'Trü Frü', "knownAs" = $3, "bgeBaseEmbedding" = $4,
      "lastUpdated" = now() WHERE id = $1`, [id, name, knownAs, JSON.stringify(vector.embedding)])
    console.log(`  ${id}: ${before.name} → ${name}; knownAs ${JSON.stringify(knownAs)}`)
  }
}

async function simplyOrange(pg: Pg) {
  const label = await food(pg, SIMPLY_LABEL)
  const perGram = (row: any) => Number(row.nutrientAmountPerDefaultServing) / Number(label.defaultServingWeightGram)
  for (const id of SIMPLY_SIBLINGS) {
    const sibling = await food(pg, id)
    const have = new Set((sibling.Nutrient as any[]).map(row => row.nutrientName))
    const missing = (label.Nutrient as any[]).filter(row => !have.has(row.nutrientName))
    await backupFood(pg, id)
    for (const row of missing) await pg.query(`INSERT INTO "Nutrient"("foodItemId", "nutrientName", "nutrientUnit",
      "nutrientAmountPerDefaultServing") VALUES ($1, $2, $3, $4)`,
      [id, row.nutrientName, row.nutrientUnit, round(perGram(row) * Number(sibling.defaultServingWeightGram))])
    await pg.query(`DELETE FROM "FoodItemImages" WHERE "foodItemId" = $1`, [id])
    await pg.query(`INSERT INTO "FoodItemImages"("foodItemId", "foodImageId", similarity) VALUES ($1, $2, 1)`, [id, ORANGE_JUICE_ICON])
    await pg.query(`UPDATE "FoodItem" SET "lastUpdated" = now() WHERE id = $1`, [id])
    // Its logs get the new vitamins, never a changed value.
    const keys = missing.map(row => LOG_KEY[row.nutrientName]).filter(Boolean)
    const basis = await food(pg, id)
    const logs = (await pg.query(`SELECT * FROM "LoggedFoodItem" WHERE "foodItemId" = $1 AND "deletedAt" IS NULL AND grams > 0`, [id])).rows
    let filled = 0
    for (const log of logs) {
      const amounts = nutrientsAt(basis, Number(log.grams))
      const fill = keys.filter(key => log[key] == null && Number.isFinite(amounts?.[key]))
      if (!fill.length) continue
      await pg.query(`UPDATE "LoggedFoodItem" SET ${fill.map((key, at) => `"${key}" = $${at + 2}`).join(", ")}, "updatedAt" = now()
        WHERE id = $1`, [log.id, ...fill.map(key => round(amounts![key]!))])
      await pg.query(`INSERT INTO "LoggedFoodItemMicroFill"("loggedFoodItemId", filled) VALUES ($1, $2)`,
        [log.id, JSON.stringify({ correction: "Simply Orange label vitamins (food 15348)", filled: fill })])
      filled++
    }
    console.log(`  ${id} ${sibling.name}: +${missing.map(row => row.nutrientName).join(", ") || "nothing"}; icon ${ORANGE_JUICE_ICON};` +
      ` ${filled} of ${logs.length} logs filled`)
  }
}

async function cheerios(pg: Pg) {
  for (const id of CHEERIOS) {
    const before = await food(pg, id)
    const from = Number(before.defaultServingWeightGram)
    if (from === CUP_GRAMS) continue
    const scale = CUP_GRAMS / from
    await backupFood(pg, id)
    await pg.query(`UPDATE "FoodItem" SET "defaultServingWeightGram" = $2, ${PER_SERVING.map(column =>
      `"${column}" = round(("${column}" * $3)::numeric, 2)`).join(", ")}, "lastUpdated" = now() WHERE id = $1`, [id, CUP_GRAMS, scale])
    for (const row of before.Nutrient as any[]) {
      await pg.query(`INSERT INTO "CatalogueAuditBackup"(audit, "tableName", "rowId", before) VALUES ($1, 'Nutrient', $2, $3)`,
        [AUDIT, row.id, JSON.stringify(row)])
      await pg.query(`UPDATE "Nutrient" SET "nutrientAmountPerDefaultServing" = $2 WHERE id = $1`,
        [row.id, round(Number(row.nutrientAmountPerDefaultServing) * scale)])
    }
    // The milk column's serving was the cereal alone (its values are dry cereal's): a cup.
    const milk = await pg.query(`UPDATE "Serving" SET "servingName" = 'cup', "servingWeightGram" = $2, "defaultServingAmount" = 1
      WHERE "foodItemId" = $1 AND "servingName" ~* 'skim milk' RETURNING id`, [id, CUP_GRAMS])
    const cup = await pg.query(`SELECT 1 FROM "Serving" WHERE "foodItemId" = $1 AND "servingName" = 'cup'`, [id])
    if (!cup.rowCount) await pg.query(`INSERT INTO "Serving"("foodItemId", "servingName", "servingWeightGram", "defaultServingAmount")
      VALUES ($1, 'cup', $2, 1)`, [id, CUP_GRAMS])
    const after = await food(pg, id)
    console.log(`  ${id} ${before.name}: ${from} g ${before.kcalPerServing} kcal → ${after.defaultServingWeightGram} g ` +
      `${after.kcalPerServing} kcal (${Math.round(after.kcalPerServing / CUP_GRAMS * 100)} kcal/100 g)` +
      `${milk.rowCount ? "; milk serving → cup" : ""}`)
  }
}

async function main() {
  const apply = process.argv.includes("--apply")
  const pg = new Client({ connectionString: process.env.SUPABASE_PG_URI })
  await pg.connect()
  await pg.query("BEGIN")
  try {
    await renames(pg)
    await simplyOrange(pg)
    await cheerios(pg)
    await pg.query(apply ? "COMMIT" : "ROLLBACK")
    console.log(apply ? "applied" : "dry run, rolled back")
  } catch (error) {
    await pg.query("ROLLBACK")
    throw error
  } finally {
    await pg.end()
  }
}

main().catch(error => { console.error(error); process.exit(1) })
