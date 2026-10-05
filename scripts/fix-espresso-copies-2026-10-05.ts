// A23 (2026-10-05): the catalogue had one generic espresso three times: 969 "espresso" and 1091 "espresso shot" (2024
// Nutritionix, identical) and 8713 "Coffee, Espresso" (USDA 2345938), all 9 kcal per 100 g. The duplicates split the
// fast route's choice (meal 30505, "Espresso with oat milk": 969 at 0.3, then "no" because 1091 was as likely), so the
// meal went to the agent. 1091 and 8713 merge into 969 (their names stay as knownAs, their logs move; same values per
// gram, so nothing is repriced). --apply writes; otherwise a dry run (rolled back).
//   TS_NODE_TRANSPILE_ONLY=1 npm run run:ts-node-prod -- scripts/fix-espresso-copies-2026-10-05.ts [--apply]
import { Client } from "pg"

const AUDIT = "A23_espresso_copies"
const KEEP = 969, DROP = [1091, 8713]

async function main() {
  const apply = process.argv.includes("--apply")
  const pg = new Client({ connectionString: process.env.SUPABASE_PG_URI })
  await pg.connect()
  await pg.query("BEGIN")
  try {
    const rows = (await pg.query(`SELECT id, name, "archivedAt", "privateToUserId", "kcalPerServing" / "defaultServingWeightGram" AS kcal
      FROM "FoodItem" WHERE id = ANY($1)`, [[KEEP, ...DROP]])).rows
    if (rows.length !== 3 || rows.some(row => row.archivedAt || row.privateToUserId || Math.abs(Number(row.kcal) - 0.09) > 0.001))
      throw new Error(`espresso foods changed since they were judged: ${JSON.stringify(rows)}`)
    for (const drop of DROP) {
      const logs = (await pg.query(`SELECT id FROM "LoggedFoodItem" WHERE "foodItemId" = $1 AND "deletedAt" IS NULL`, [drop])).rows.map(row => row.id)
      await pg.query(`SELECT public.merge_catalogue_food($1, $2, $3)`, [KEEP, drop, AUDIT])
      // The phone pulls logs by updatedAt: the moved ones now point at the kept food.
      if (logs.length) await pg.query(`UPDATE "LoggedFoodItem" SET "updatedAt" = now() WHERE id = ANY($1)`, [logs])
      console.log(`  ${drop} ${JSON.stringify(rows.find(row => row.id === drop).name)} → ${KEEP}: ${logs.length} logs`)
    }
    const kept = (await pg.query(`SELECT name, "knownAs", (SELECT count(*) FROM "Serving" s WHERE s."foodItemId" = f.id) AS servings,
      (SELECT count(*) FROM "LoggedFoodItem" l WHERE l."foodItemId" = f.id AND l."deletedAt" IS NULL) AS logs FROM "FoodItem" f WHERE id = $1`, [KEEP])).rows[0]
    console.log(`  ${KEEP}:`, JSON.stringify(kept))
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
