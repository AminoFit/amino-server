// One-off (2026-10-02): shared foods without a barcode that are a barcoded food written again (2023-24 Nutritionix,
// FatSecret, GPT-4 and USDA records: same brand, same nutrition per gram, the same name). Each of the 84 pairs found was
// judged by hand; the 55 that are the same product, flavour and variant merge into the barcoded food (their names stay
// as knownAs), so a person's history isn't split across two foods. Skipped: other flavours or lines (Dannon strawberry
// vs strawberry cheesecake, Wegmans vs Wegmans Organic, Kerrygold Naturally Softer), and copies whose flavour can't be
// told (a generic "Cup Noodles", Planet Oat creamer). Moved logs keep their values unless the kept food's differ by more
// than 5% per gram (repriced, the old values recorded). --apply writes; otherwise a dry run (rolled back).
import { Client } from "pg"
import { nutrientsAt, type NutrientKey } from "@/nutrition"

const AUDIT = "barcodeless_copies_2026-10-02"
/** [copy, barcoded food]. */
const MERGES: [number, number][] = [
  [384, 6837], [731, 4887], [840, 8964], [93, 3463], [844, 6857], [1003, 13502], [1619, 11883], [4636, 4677], [739, 361],
  [2175, 13978], [242, 2297], [886, 5313], [906, 5686], [12476, 12130], [496, 472], [1242, 6902], [1094, 2840], [1156, 2764],
  [2033, 3444], [5861, 2250], [98, 9345], [946, 922], [941, 3963], [1178, 913], [1496, 11563], [2222, 15025], [2713, 9157],
  [5831, 12827], [9658, 10323], [11992, 996], [6685, 5443], [1410, 12538], [1695, 4664], [1893, 3551], [2070, 2201],
  [4268, 4269], [7559, 13548], [8533, 6817], [13247, 7985], [13268, 12938], [14467, 4550], [4320, 8229], [11541, 11542],
  [12576, 12577], [1264, 10840], [1938, 1939], [2366, 2432], [3503, 7284], [13817, 11232], [15005, 2651], [15145, 1936],
  [3911, 3910], [5067, 5069], [10052, 10051], [13720, 5652]
]
const MACROS: NutrientKey[] = ["kcal", "proteinG", "carbG", "totalFatG", "fiberG", "sugarG", "satFatG", "addedSugarG", "transFatG"]
const round = (value: number) => Math.round(value * 1e4) / 1e4

async function main() {
  const apply = process.argv.includes("--apply")
  const pg = new Client({ connectionString: process.env.SUPABASE_PG_URI })
  await pg.connect()
  await pg.query("BEGIN")
  let moved = 0, repriced = 0
  try {
    for (const [drop, keep] of MERGES) {
      const pair = (await pg.query(`SELECT id, name, gtin, "archivedAt", "privateToUserId", "kcalPerServing" / "defaultServingWeightGram" AS kcal
        FROM "FoodItem" WHERE id = ANY($1)`, [[drop, keep]])).rows
      const copy = pair.find(row => row.id === drop), kept = pair.find(row => row.id === keep)
      if (!copy || !kept || copy.gtin || !kept.gtin || copy.archivedAt || kept.archivedAt || copy.privateToUserId || kept.privateToUserId)
        throw new Error(`pair ${drop} → ${keep} changed since it was judged`)
      const logs = (await pg.query(`SELECT id FROM "LoggedFoodItem" WHERE "foodItemId" = $1 AND "deletedAt" IS NULL`, [drop])).rows.map(row => row.id)
      await pg.query(`SELECT public.merge_catalogue_food($1, $2, $3)`, [keep, drop, AUDIT])
      // The phone pulls logs by updatedAt: the moved ones now point at the kept food.
      if (logs.length) await pg.query(`UPDATE "LoggedFoodItem" SET "updatedAt" = now() WHERE id = ANY($1)`, [logs])
      moved += logs.length
      const differs = Math.abs(Number(copy.kcal) - Number(kept.kcal)) > 0.05 * Math.max(Number(copy.kcal), Number(kept.kcal))
      let note = ""
      if (differs) {
        const basis = (await pg.query(`SELECT * FROM "FoodItem" WHERE id = $1`, [keep])).rows[0]
        for (const id of logs) {
          const log = (await pg.query(`SELECT * FROM "LoggedFoodItem" WHERE id = $1`, [id])).rows[0]
          const amounts = nutrientsAt(basis, Number(log.grams))
          if (!amounts) continue
          const keys = MACROS.filter(key => Number.isFinite(amounts[key]) && Math.abs(Number(log[key] ?? NaN) - amounts[key]!) > 1e-3)
          if (!keys.length) continue
          await pg.query(`UPDATE "LoggedFoodItem" SET ${keys.map((key, at) => `"${key}" = $${at + 2}`).join(", ")} WHERE id = $1`,
            [id, ...keys.map(key => round(amounts[key]!))])
          await pg.query(`INSERT INTO "LoggedFoodItemMicroFill"("loggedFoodItemId", filled) VALUES ($1, $2)`,
            [id, JSON.stringify({ correction: `Merged ${drop} into ${keep} (same product, barcoded)`,
              previous: Object.fromEntries(keys.map(key => [key, log[key]])) })])
          repriced++
        }
        note = " (values differ: logs repriced)"
      }
      console.log(`  ${drop} ${JSON.stringify(copy.name)} → ${keep} ${JSON.stringify(kept.name)}: ${logs.length} logs${note}`)
    }
    console.log(`${MERGES.length} merged, ${moved} logs moved, ${repriced} repriced`)
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
