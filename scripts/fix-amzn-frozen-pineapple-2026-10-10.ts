// A26 (2026-10-10): AMZN Fresh Frozen Pineapple (15399, barcode 00195515039796) came from an Open Food Facts record that
// repeats two label lines under the wrong nutrient: iron 18 mg is the calcium line and vitamin C 153 mg the potassium
// line, so each half of a shared smoothie (88.5 g) logged 11.4 mg of iron. Its calories, calcium and potassium match USDA
// raw pineapple (FoodData Central 169124) per gram, so it's the plain fruit: iron and vitamin C take USDA's values per
// 140 g (0.29 and 47.8 mg per 100 g), recorded as a generic estimate (FoodMicroFill); the label's own values would
// replace them if a photo of the panel turns up. Edited in place, wrong values not kept; the two logs (meals 30596 and
// 30597) are repriced.
// --apply writes; otherwise a dry run (rolled back).
//   TS_NODE_TRANSPILE_ONLY=1 npm run run:ts-node-prod -- scripts/fix-amzn-frozen-pineapple-2026-10-10.ts [--apply]
import { Client } from "pg"
import { HISTORY_NUTRIENTS, nutrientsAt } from "@/nutrition"

const FOOD_ID = 15399, GTIN = "00195515039796", SERVING_G = 140
const USDA_PER_100G = { iron: 0.29, vitaminC: 47.8 }
const finite = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value)
const round = (value: number) => Math.round(value * 1e4) / 1e4

async function main() {
  const apply = process.argv.includes("--apply")
  const pg = new Client({ connectionString: process.env.SUPABASE_PG_URI })
  await pg.connect()
  await pg.query("BEGIN")
  try {
    const before = (await pg.query(`SELECT gtin, "defaultServingWeightGram" FROM "FoodItem" WHERE id = $1`, [FOOD_ID])).rows[0]
    if (before?.gtin !== GTIN || Number(before.defaultServingWeightGram) !== SERVING_G)
      throw new Error(`food ${FOOD_ID} isn't the one expected: ${JSON.stringify(before)}`)
    // Only the two copied lines change, and only while they still are the copies.
    const micros = Object.fromEntries((await pg.query(`SELECT "nutrientName", "nutrientAmountPerDefaultServing" AS amount
      FROM "Nutrient" WHERE "foodItemId" = $1`, [FOOD_ID])).rows.map(row => [row.nutrientName, Number(row.amount)]))
    if (micros.iron !== micros.calcium || micros.vitaminC !== micros.potassium)
      throw new Error(`iron and vitamin C aren't the copied calcium and potassium lines: ${JSON.stringify(micros)}`)
    for (const [name, per100] of Object.entries(USDA_PER_100G)) {
      const amount = round((per100 * SERVING_G) / 100)
      await pg.query(`UPDATE "Nutrient" SET "nutrientAmountPerDefaultServing" = $3 WHERE "foodItemId" = $1 AND "nutrientName" = $2`,
        [FOOD_ID, name, amount])
      console.log(`  ${FOOD_ID} ${name}: ${micros[name]} → ${amount} mg per ${SERVING_G} g`)
    }
    await pg.query(`UPDATE "FoodItem" SET "lastUpdated" = now() WHERE id = $1`, [FOOD_ID])
    await pg.query(`INSERT INTO "FoodMicroFill"("foodItemId", keys, source) VALUES ($1, $2, $3)`, [FOOD_ID,
      Object.keys(USDA_PER_100G), JSON.stringify({ estimate: "generic profile for a branded commodity",
        usda: "USDA FoodData Central 169124", judged: true,
        correction: "Open Food Facts record had iron = calcium and vitamin C = potassium" })])

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
        [log.id, JSON.stringify({ correction: "AMZN frozen pineapple iron and vitamin C (Open Food Facts copied calcium and potassium)", previous })])
      console.log(`  log ${log.id} (meal ${log.messageId}):`, differs.map(key => `${key} ${log[key]} → ${next[key]}`).join(", "))
    }
    console.log(`  ${FOOD_ID}: ${logs.length} log(s)`)
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
