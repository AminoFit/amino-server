// A24 (2026-10-06): Aplenty Green Tea Mochi Ice Cream (15385, barcode 00195515040105) came from an Open Food Facts record
// that paired the label's per-piece column (80 kcal, 35 g) with its serving, "6 pieces (210 g)", so the box was stored as
// 80 kcal and one piece logged 13 kcal (meal 30529). Its per-100 g values were worked out from that pairing, so they are
// wrong too. The serving (6 pieces = 210 g, a piece 35 g) was right. Every value becomes the label's per-serving column
// (the whole box): it is more precise than the per-piece one, which rounds potassium (270 mg a box) and vitamin D to 0, and
// rounding means the box isn't six times a piece (500 kcal, not 480). So a piece now logs 83 kcal, not the label's rounded 80.
// The wrong values aren't kept; any live log of it is repriced (the one logged was already deleted).
// --apply writes; otherwise a dry run (rolled back).
//   TS_NODE_TRANSPILE_ONLY=1 npm run run:ts-node-prod -- scripts/fix-aplenty-green-tea-mochi-2026-10-06.ts [--apply]
import { Client } from "pg"
import { HISTORY_NUTRIENTS, nutrientsAt } from "@/nutrition"

const FOOD_ID = 15385
const MICROS: [name: string, unit: string, amount: number][] = [["sodium", "mg", 130], ["potassium", "mg", 270],
  ["calcium", "mg", 170], ["iron", "mg", 0.5], ["cholesterol", "mg", 35], ["vitaminD", "mcg", 1.7]]
const finite = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value)
const round = (value: number) => Math.round(value * 1e4) / 1e4

async function main() {
  const apply = process.argv.includes("--apply")
  const pg = new Client({ connectionString: process.env.SUPABASE_PG_URI })
  await pg.connect()
  await pg.query("BEGIN")
  try {
    const before = (await pg.query(`SELECT gtin, "defaultServingWeightGram", "kcalPerServing" FROM "FoodItem" WHERE id = $1`,
      [FOOD_ID])).rows[0]
    if (before?.gtin !== "00195515040105" || Number(before.defaultServingWeightGram) !== 210)
      throw new Error(`food ${FOOD_ID} isn't the one expected: ${JSON.stringify(before)}`)
    await pg.query(`UPDATE "FoodItem" SET "kcalPerServing" = 500, "totalFatPerServing" = 11, "satFatPerServing" = 7,
      "transFatPerServing" = 0, "carbPerServing" = 93, "fiberPerServing" = 0, "sugarPerServing" = 66, "addedSugarPerServing" = 59,
      "proteinPerServing" = 7, "lastUpdated" = now() WHERE id = $1`, [FOOD_ID])
    await pg.query(`DELETE FROM "Nutrient" WHERE "foodItemId" = $1`, [FOOD_ID])
    for (const [name, unit, amount] of MICROS)
      await pg.query(`INSERT INTO "Nutrient"("foodItemId", "nutrientName", "nutrientUnit", "nutrientAmountPerDefaultServing")
        VALUES ($1, $2, $3, $4)`, [FOOD_ID, name, unit, amount])

    const basis = (await pg.query(`SELECT f.*, coalesce((SELECT json_agg(n) FROM "Nutrient" n WHERE n."foodItemId" = f.id), '[]')
      AS "Nutrient" FROM "FoodItem" f WHERE f.id = $1`, [FOOD_ID])).rows[0]
    const piece = nutrientsAt(basis, 35)
    console.log(`  a piece (35 g) now: ${piece?.kcal} kcal, ${piece?.proteinG} g protein, ${piece?.potassiumMg} mg potassium`)
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
        [log.id, JSON.stringify({ correction: "Aplenty mochi label (Open Food Facts record put the per-piece column on the box)", previous })])
      console.log(`  log ${log.id} (meal ${log.messageId}):`, differs.map(key => `${key} ${log[key]} → ${next[key]}`).join(", "))
    }
    console.log(`  ${FOOD_ID}: label's box column per 210 g (was ${before.kcalPerServing} kcal); ${logs.length} live log(s)`)
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
