// A22 (2026-10-05): Sabra Roasted Pine Nut Hummus (15372, barcode 00040822346139) came from an Open Food Facts record
// whose label lines were typed wrong: sodium 0 (the label says 140 mg), potassium 2 g (the label's "2% DV" typed as
// grams, so a 30 g serving logged 2000 mg), saturated fat 6 g (the total fat), sugars 2 g (0 g) and no fibre (2 g).
// Calories and macros were right. Every value becomes the owner's label photo, per 2 tbsp (30 g), edited in place:
// % DV lines are converted at the FDA daily values (calcium 2% of 1300 mg, iron 6% of 18 mg, potassium 2% of 4700 mg).
// The wrong values aren't kept; any log of it is repriced (the one logged was already deleted).
// --apply writes; otherwise a dry run (rolled back).
//   TS_NODE_TRANSPILE_ONLY=1 npm run run:ts-node-prod -- scripts/fix-sabra-pine-nut-hummus-2026-10-05.ts [--apply]
import { Client } from "pg"
import { HISTORY_NUTRIENTS, nutrientsAt } from "@/nutrition"

const FOOD_ID = 15372
const MICROS: [name: string, unit: string, amount: number][] = [["sodium", "mg", 140], ["potassium", "mg", 94],
  ["calcium", "mg", 26], ["iron", "mg", 1.08], ["cholesterol", "mg", 0], ["vitaminD", "mcg", 0]]
const finite = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value)
const round = (value: number) => Math.round(value * 1e4) / 1e4

async function main() {
  const apply = process.argv.includes("--apply")
  const pg = new Client({ connectionString: process.env.SUPABASE_PG_URI })
  await pg.connect()
  await pg.query("BEGIN")
  try {
    const before = (await pg.query(`SELECT gtin, "defaultServingWeightGram" FROM "FoodItem" WHERE id = $1`, [FOOD_ID])).rows[0]
    if (before?.gtin !== "00040822346139" || Number(before.defaultServingWeightGram) !== 30)
      throw new Error(`food ${FOOD_ID} isn't the one expected: ${JSON.stringify(before)}`)
    await pg.query(`UPDATE "FoodItem" SET "kcalPerServing" = 80, "totalFatPerServing" = 6, "satFatPerServing" = 1,
      "transFatPerServing" = 0, "carbPerServing" = 5, "fiberPerServing" = 2, "sugarPerServing" = 0, "addedSugarPerServing" = 0,
      "proteinPerServing" = 2, "lastUpdated" = now() WHERE id = $1`, [FOOD_ID])
    await pg.query(`DELETE FROM "Nutrient" WHERE "foodItemId" = $1`, [FOOD_ID])
    for (const [name, unit, amount] of MICROS)
      await pg.query(`INSERT INTO "Nutrient"("foodItemId", "nutrientName", "nutrientUnit", "nutrientAmountPerDefaultServing")
        VALUES ($1, $2, $3, $4)`, [FOOD_ID, name, unit, amount])

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
        [log.id, JSON.stringify({ correction: "Sabra label (Open Food Facts record had sodium 0, potassium 2 g)", previous })])
      console.log(`  log ${log.id} (meal ${log.messageId}):`, differs.map(key => `${key} ${log[key]} → ${next[key]}`).join(", "))
    }
    console.log(`  ${FOOD_ID}: label values per 30 g; ${logs.length} log(s)`)
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
