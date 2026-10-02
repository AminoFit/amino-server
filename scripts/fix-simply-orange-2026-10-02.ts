// One-off (2026-10-02): food 15348 (barcode 00025000136825) came from an Open Food Facts record that names Blue Diamond's
// "Hint of honey, vanilla" almond milk, but the barcode is Simply Orange 100% Orange Juice (the owner's label photo; every
// other 0002500 product in the catalogue is Simply or Minute Maid). The record's facts were the juice's, so only the
// identity is corrected, plus the label's zeros (saturated fat, fibre) and the vitamins it gives as % DV (8 fl oz):
// thiamin 8% of 1.2 mg, niacin 2% of 16 mg, B6 4% of 1.7 mg, folate 10% of 400 mcg. Its icon is the shared orange juice
// icon. Old values are backed up in CatalogueAuditBackup and its logs repriced.
// --apply writes; otherwise a dry run (rolled back).
import { Client } from "pg"
import { HISTORY_NUTRIENTS, nutrientsAt } from "@/nutrition"
import { getCachedOrFetchEmbeddings } from "@/utils/embeddingsCache/getCachedOrFetchEmbeddings"

const AUDIT = "simply_orange_2026-10-02"
const FOOD_ID = 15348
const ORANGE_JUICE_ICON = 13173
const VITAMINS: [name: string, unit: string, amount: number][] =
  [["thiamin", "mg", 0.096], ["niacin", "mg", 0.32], ["vitaminB6", "mg", 0.068], ["folate", "mcg", 40]]
const finite = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value)
const round = (value: number) => Math.round(value * 1e4) / 1e4

async function main() {
  const apply = process.argv.includes("--apply")
  // Its search vector follows the name, as a user food's does.
  const [vector] = await getCachedOrFetchEmbeddings("BGE_BASE", ["100% Orange Juice - Simply Orange"])
  const pg = new Client({ connectionString: process.env.SUPABASE_PG_URI })
  await pg.connect()
  await pg.query("BEGIN")
  try {
    const before = (await pg.query(`SELECT name, brand, gtin FROM "FoodItem" WHERE id = $1`, [FOOD_ID])).rows[0]
    if (before?.gtin !== "00025000136825") throw new Error(`food ${FOOD_ID} isn't the barcode expected: ${JSON.stringify(before)}`)
    await pg.query(`INSERT INTO "CatalogueAuditBackup"(audit, "tableName", "rowId", before)
      SELECT $1, 'FoodItem', id, to_jsonb(f) - 'bgeBaseEmbedding' FROM "FoodItem" f WHERE id = $2`, [AUDIT, FOOD_ID])
    await pg.query(`UPDATE "FoodItem" SET name = '100% Orange Juice', brand = 'Simply Orange', "knownAs" = ARRAY['Simply Orange'],
      description = NULL, "foodItemCategoryID" = NULL, "foodItemCategoryName" = 'Orange Juice', "satFatPerServing" = 0,
      "fiberPerServing" = 0, "bgeBaseEmbedding" = $2, "lastUpdated" = now() WHERE id = $1`,
      [FOOD_ID, JSON.stringify(vector.embedding)])
    for (const [name, unit, amount] of VITAMINS) {
      const exists = await pg.query(`SELECT 1 FROM "Nutrient" WHERE "foodItemId" = $1 AND "nutrientName" = $2`, [FOOD_ID, name])
      if (!exists.rowCount) await pg.query(`INSERT INTO "Nutrient"("foodItemId", "nutrientName", "nutrientUnit",
        "nutrientAmountPerDefaultServing") VALUES ($1, $2, $3, $4)`, [FOOD_ID, name, unit, amount])
    }
    await pg.query(`DELETE FROM "FoodItemImages" WHERE "foodItemId" = $1`, [FOOD_ID])
    await pg.query(`INSERT INTO "FoodItemImages"("foodItemId", "foodImageId", similarity) VALUES ($1, $2, 1)`, [FOOD_ID, ORANGE_JUICE_ICON])

    const basis = (await pg.query(`SELECT f.*, coalesce((SELECT json_agg(n) FROM "Nutrient" n WHERE n."foodItemId" = f.id), '[]')
      AS "Nutrient" FROM "FoodItem" f WHERE f.id = $1`, [FOOD_ID])).rows[0]
    const logs = (await pg.query(`SELECT * FROM "LoggedFoodItem" WHERE "foodItemId" = $1 AND "deletedAt" IS NULL AND grams > 0`,
      [FOOD_ID])).rows
    for (const log of logs) {
      const amounts = nutrientsAt(basis, Number(log.grams))
      if (!amounts) continue
      const next = Object.fromEntries(HISTORY_NUTRIENTS.map(key => [key, finite(amounts[key]) ? round(amounts[key]!) : null]))
      const differs = HISTORY_NUTRIENTS.filter(key => next[key] == null ? log[key] != null
        : log[key] == null || Math.abs(Number(log[key]) - next[key]!) > 1e-3)
      if (!differs.length) continue
      const previous = Object.fromEntries(differs.map(key => [key, log[key]]))
      await pg.query(`UPDATE "LoggedFoodItem" SET ${differs.map((key, at) => `"${key}" = $${at + 2}`).join(", ")},
        "updatedAt" = now() WHERE id = $1`, [log.id, ...differs.map(key => next[key])])
      await pg.query(`INSERT INTO "LoggedFoodItemMicroFill"("loggedFoodItemId", filled) VALUES ($1, $2)`,
        [log.id, JSON.stringify({ correction: "Simply Orange label (was an almond milk's Open Food Facts record)", previous })])
      console.log(`  log ${log.id} (meal ${log.messageId}):`, differs.map(key => `${key} ${log[key]} → ${next[key]}`).join(", "))
    }
    console.log(`  ${FOOD_ID}: ${before.name} → 100% Orange Juice (Simply Orange); ${logs.length} log(s)`)
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
