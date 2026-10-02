// One-off (2026-10-02): the 18 barcodes on two shared foods each (2024 USDA imports, where USDA keeps two records for one
// UPC). Each pair was judged by hand against Open Food Facts' record, UPCitemdb's product and the energy arithmetic
// (protein x4 + carbs x4 + fat x9): the right food is kept and the other merged into it (its name stays as knownAs).
// The logs that move were priced from the wrong record with real portions (a 1.5 L soda at 6,000 kcal), so their
// macros are repriced from the kept food; their old values are recorded in LoggedFoodItemMicroFill.
// Two products sharing a barcode (Primal Kitchen Hot Buffalo / Hot Jalapeño Buffalo) aren't merged: the barcode stays
// on the product UPCitemdb names. --apply writes; otherwise a dry run (rolled back).
import { Client } from "pg"
import { nutrientsAt, type NutrientKey } from "@/nutrition"

const AUDIT = "same_barcode_2026-10-02"
/** keep, drop, why. */
const MERGES: [number, number, string][] = [
  [10183, 10182, "Carb Counter tortillas: 45 kcal a tortilla (wheat fibre first), not 110"],
  [3747, 3746, "Goya chickpeas: Open Food Facts' 98 kcal/100 g"],
  [9645, 12597, "Ritz peanut butter crackers: Open Food Facts' 140 kcal a 28 g pack"],
  [4889, 4888, "Hillshire salame & gouda: the label's 16/12/21 g per 100 g"],
  [12857, 12858, "V8 Splash strawberry kiwi: Open Food Facts' 21 kcal/100 g"],
  [8984, 8985, "Candy hearts: 350 kcal/100 g, not 0"],
  [12103, 11732, "Ambrosia apple slices: Open Food Facts' 50 kcal/100 g"],
  [9776, 9777, "Pork bao buns: Open Food Facts' 210 kcal/100 g"],
  [9102, 9101, "Sidral Mundet apple soda: 54 kcal/100 ml (the other put a can's 140 kcal on 35 ml)"],
  [7707, 7708, "365 two-bite brownies: Open Food Facts' 447 kcal/100 g"],
  [9290, 9292, "Jamba energy drink: Open Food Facts' 36 kcal/100 ml"],
  [13861, 13860, "Divina roasted yellow peppers: 17 kcal/100 g fits its 3.3 g carbs"],
  [5966, 5967, "Poppi strawberry lemon: 25 kcal a can"],
  [12538, 4186, "Optimum Nutrition Gold Standard double rich chocolate: 120 kcal, 24 g protein a scoop (the other was empty)"],
  [10320, 10319, "Aidells Cajun andouille (pork): the newer USDA record"],
  [11130, 11132, "Chobani Oat zero sugar: the newer USDA record"],
  [7789, 7788, "Cook's gluten-free rosemary bread: 224 kcal/100 g (110 is not bread)"]
]
const NOT_THIS_BARCODE = { id: 8424, why: "UPCitemdb: 855232007972 is Primal Kitchen Hot Buffalo (8423)" }
const MACROS: NutrientKey[] = ["kcal", "proteinG", "carbG", "totalFatG", "fiberG", "sugarG", "satFatG", "addedSugarG", "transFatG"]
const round = (value: number) => Math.round(value * 1e4) / 1e4

async function main() {
  const apply = process.argv.includes("--apply")
  const pg = new Client({ connectionString: process.env.SUPABASE_PG_URI })
  await pg.connect()
  await pg.query("BEGIN")
  try {
    for (const [keep, drop, why] of MERGES) {
      const moving = (await pg.query(`SELECT id FROM "LoggedFoodItem" WHERE "foodItemId" = $1 AND "deletedAt" IS NULL`, [drop])).rows
        .map(row => row.id)
      await pg.query(`SELECT public.merge_catalogue_food($1, $2, $3)`, [keep, drop, AUDIT])
      const basis = (await pg.query(`SELECT * FROM "FoodItem" WHERE id = $1`, [keep])).rows[0]
      const changes: string[] = []
      for (const id of moving) {
        const log = (await pg.query(`SELECT * FROM "LoggedFoodItem" WHERE id = $1`, [id])).rows[0]
        const amounts = nutrientsAt(basis, Number(log.grams))
        if (!amounts) continue
        const keys = MACROS.filter(key => Number.isFinite(amounts[key]) && Math.abs(Number(log[key] ?? NaN) - amounts[key]!) > 1e-3)
        if (!keys.length) continue
        await pg.query(`UPDATE "LoggedFoodItem" SET ${keys.map((key, at) => `"${key}" = $${at + 2}`).join(", ")}, "updatedAt" = now()
          WHERE id = $1`, [id, ...keys.map(key => round(amounts[key]!))])
        await pg.query(`INSERT INTO "LoggedFoodItemMicroFill"("loggedFoodItemId", filled) VALUES ($1, $2)`,
          [id, JSON.stringify({ correction: `Merged ${drop} into ${keep}: ${why}`, previous: Object.fromEntries(keys.map(key => [key, log[key]])) })])
        changes.push(`log ${id} ${log.grams} g: ${log.kcal} → ${round(amounts.kcal!)} kcal`)
      }
      console.log(`  ${drop} → ${keep} (${why})${changes.length ? `\n      ${changes.join("\n      ")}` : ""}`)
    }
    await pg.query(`INSERT INTO "CatalogueAuditBackup"(audit, "tableName", "rowId", before)
      SELECT $1, 'FoodItem', id, to_jsonb(f) - 'bgeBaseEmbedding' FROM "FoodItem" f WHERE id = $2`, [AUDIT, NOT_THIS_BARCODE.id])
    await pg.query(`UPDATE "FoodItem" SET gtin = NULL, "UPC" = NULL, "lastUpdated" = now() WHERE id = $1`, [NOT_THIS_BARCODE.id])
    console.log(`  ${NOT_THIS_BARCODE.id}: barcode removed (${NOT_THIS_BARCODE.why})`)
    await pg.query(`UPDATE "FoodItem" SET name = 'Gold Standard 100% Whey, Double Rich Chocolate', "lastUpdated" = now() WHERE id = 12538`)
    const left = (await pg.query(`SELECT gtin FROM "FoodItem" WHERE gtin IS NOT NULL AND "archivedAt" IS NULL AND "privateToUserId" IS NULL
      GROUP BY gtin HAVING count(*) > 1`)).rows
    console.log(`  barcodes still on two shared foods: ${left.length}`)
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
