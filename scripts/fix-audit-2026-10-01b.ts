// One-off (2026-10-01): the second audit of the owner's logs (Sep 23 – Oct 1) by their MCP agent. Each food was judged
// by hand; the food is corrected (old values backed up in CatalogueAuditBackup) and its logs repriced from it through
// nutrientsAt, previous values recorded in LoggedFoodItemMicroFill.filled as {"correction": ..., "previous": {...}}.
//  - Fairlife: "2% Reduced Fat Ultra-Filtered Milk" (65: 12 g protein, 8 g carbs, no sodium) is the same milk as 2201
//    (the label: 13 g protein, 6 g sugar, 120 mg sodium). 65 merges into 2201, which takes its name and the barcode on
//    today's bottles (00811620020992; 2201's 00856312002771 is Fairlife's earlier prefix).
//  - Chicken breast with skin, grilled (4): sodium from the same USDA survey record as its potassium and cholesterol
//    (2705967, grilled without sauce, skin eaten: 329 mg per 100 g; FatSecret's 412.8).
//  - Boar's Head Rotisserie Chicken Breast (7190): no fibre in chicken (USDA's branded record said 1.01 g).
//  - Kraft Fat Free Shredded Mozzarella (15273): potassium 0 is a missing value, not a measured zero.
//  - USDA survey foods without sugars (the importer missed "Total Sugars"): empty fibre, sugars, added sugars,
//    saturated and trans fat filled from USDA (fill-only), and their logs filled (Iced Tea / Lemonade: 7.2 g per 100 g).
// --apply writes; otherwise a dry run.
import { Client } from "pg"
import { FILL_KEYS, HISTORY_NUTRIENTS, nutrientsAt, type NutrientKey } from "@/nutrition"
import { getUsdaFoodsInfo } from "@/FoodDbThirdPty/USDA/getFoodInfo"

const AUDIT = "audit2_2026-10-01"
const finite = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value)
const round = (value: number) => Math.round(value * 1e4) / 1e4

type Pg = Client
const food = async (pg: Pg, id: number) => (await pg.query(`SELECT f.*, coalesce((SELECT json_agg(n) FROM "Nutrient" n
  WHERE n."foodItemId" = f.id), '[]') AS "Nutrient" FROM "FoodItem" f WHERE f.id = $1`, [id])).rows[0]
const backupFood = (pg: Pg, id: number) => pg.query(`INSERT INTO "CatalogueAuditBackup"(audit, "tableName", "rowId", before)
  SELECT $1, 'FoodItem', id, to_jsonb(f) - 'bgeBaseEmbedding' FROM "FoodItem" f WHERE id = $2`, [AUDIT, id])
const backupRow = (pg: Pg, id: number) => pg.query(`INSERT INTO "CatalogueAuditBackup"(audit, "tableName", "rowId", before)
  SELECT $1, 'Nutrient', id, to_jsonb(n) FROM "Nutrient" n WHERE id = $2`, [AUDIT, id])

/** Reprices `keys` of a food's logs from the food (null where it records none); returns the logs changed. */
async function reprice(pg: Pg, foodId: number, keys: readonly NutrientKey[], why: string) {
  const basis = await food(pg, foodId)
  const logs = (await pg.query(`SELECT * FROM "LoggedFoodItem" WHERE "foodItemId" = $1 AND "deletedAt" IS NULL AND grams > 0`, [foodId])).rows
  let changed = 0
  for (const log of logs) {
    const amounts = nutrientsAt(basis, Number(log.grams))
    if (!amounts) continue
    const next = Object.fromEntries(keys.map(key => [key, finite(amounts[key]) ? round(amounts[key]!) : null]))
    const differs = keys.filter(key => next[key] == null ? log[key] != null : log[key] == null || Math.abs(Number(log[key]) - next[key]!) > 1e-3)
    if (!differs.length) continue
    const previous = Object.fromEntries(differs.map(key => [key, log[key]]))
    await pg.query(`UPDATE "LoggedFoodItem" SET ${differs.map((key, at) => `"${key}" = $${at + 2}`).join(", ")} WHERE id = $1`,
      [log.id, ...differs.map(key => next[key])])
    await pg.query(`INSERT INTO "LoggedFoodItemMicroFill"("loggedFoodItemId", filled) VALUES ($1, $2)`,
      [log.id, JSON.stringify({ correction: why, previous })])
    changed++
  }
  console.log(`  ${foodId} ${basis.name}: ${changed} of ${logs.length} logs repriced (${keys.length === HISTORY_NUTRIENTS.length ? "every nutrient" : keys.join(", ")})`)
}

async function fairlife(pg: Pg) {
  await backupFood(pg, 2201)
  const merged = (await pg.query(`SELECT public.merge_catalogue_food(2201, 65, $1) AS r`, [AUDIT])).rows[0].r
  console.log("  merged", JSON.stringify(merged))
  await pg.query(`UPDATE "FoodItem" SET name = '2% Reduced Fat Ultra-Filtered Milk', gtin = '00811620020992', "UPC" = 811620020992,
    "knownAs" = array_append(coalesce("knownAs", ARRAY[]::text[]), 'Ultra-Filtered Milk'), "lastUpdated" = now() WHERE id = 2201`)
  await reprice(pg, 2201, HISTORY_NUTRIENTS, "Fairlife 2% merged into the label's values (13 g protein, 6 g sugar, 120 mg sodium)")
}

async function chickenSodium(pg: Pg) {
  const row = (await pg.query(`SELECT id, "nutrientAmountPerDefaultServing" v FROM "Nutrient" WHERE "foodItemId" = 4 AND "nutrientName" ~* '^sodium'`)).rows
  if (row.length !== 1) throw new Error(`chicken 4: expected one sodium row, found ${row.length}`)
  await backupRow(pg, row[0].id)
  // Per the food's 100 g serving.
  await pg.query(`UPDATE "Nutrient" SET "nutrientAmountPerDefaultServing" = 329 WHERE id = $1`, [row[0].id])
  await pg.query(`UPDATE "FoodItem" SET "lastUpdated" = now() WHERE id = 4`)
  await reprice(pg, 4, ["sodiumMg"], "Sodium from USDA 2705967 (grilled, skin eaten: 329 mg/100 g), as its potassium and cholesterol")
}

async function boarsHeadFibre(pg: Pg) {
  await backupFood(pg, 7190)
  await pg.query(`UPDATE "FoodItem" SET "fiberPerServing" = 0, "lastUpdated" = now() WHERE id = 7190`)
  await reprice(pg, 7190, ["fiberG"], "Chicken has no fibre")
}

async function kraftPotassium(pg: Pg) {
  const rows = (await pg.query(`SELECT id FROM "Nutrient" WHERE "foodItemId" = 15273 AND "nutrientName" ~* '^potassium' AND "nutrientAmountPerDefaultServing" = 0`)).rows
  for (const row of rows) await backupRow(pg, row.id)
  await pg.query(`DELETE FROM "Nutrient" WHERE id = ANY($1::int[])`, [rows.map(row => row.id)])
  await pg.query(`UPDATE "FoodItem" SET "lastUpdated" = now() WHERE id = 15273`)
  await reprice(pg, 15273, ["potassiumMg"], "Potassium 0 was a missing value")
}

/** The nutrients a FoodItem keeps in columns (besides energy and macros), with the column. */
const COLUMNS = { fiberG: "fiberPerServing", sugarG: "sugarPerServing", addedSugarG: "addedSugarPerServing",
  satFatG: "satFatPerServing", transFatG: "transFatPerServing" } as const

/** USDA foods without sugars: their empty column nutrients from USDA, scaled to the food's serving; then their logs. */
async function usdaColumns(pg: Pg) {
  const foods = (await pg.query(`SELECT id, name, "externalId", "defaultServingWeightGram" g FROM "FoodItem"
    WHERE "foodInfoSource" = 'USDA' AND "sugarPerServing" IS NULL AND "externalId" ~ '^[0-9]+$' AND "defaultServingWeightGram" > 0
    ORDER BY id`)).rows as { id: number; name: string; externalId: string; g: number }[]
  let filledFoods = 0, filledLogs = 0
  for (let at = 0; at < foods.length; at += 20) {
    const batch = foods.slice(at, at + 20)
    const usda = await getUsdaFoodsInfo({ fdcIds: batch.map(f => f.externalId) })
    for (const f of batch) {
      const record = (usda ?? []).find(r => String(r.externalId) === f.externalId)
      if (!record?.defaultServingWeightGram) continue
      const scale = f.g / record.defaultServingWeightGram
      const values = Object.fromEntries(Object.entries(COLUMNS).flatMap(([key, field]) => {
        // The USDA importer returns the same per-serving columns.
        const value = (record as unknown as Record<string, unknown>)[field]
        return finite(value) && value >= 0 ? [[key, round(value * scale)]] : []
      })) as Partial<Record<keyof typeof COLUMNS, number>>
      const keys = Object.keys(values) as (keyof typeof COLUMNS)[]
      if (!keys.length) continue
      // Fill-only: a column that has a value keeps it.
      const result = await pg.query(`UPDATE "FoodItem" SET ${keys.map((key, i) => `"${COLUMNS[key]}" = coalesce("${COLUMNS[key]}", $${i + 2})`).join(", ")},
        "lastUpdated" = now() WHERE id = $1 AND (${keys.map(key => `"${COLUMNS[key]}" IS NULL`).join(" OR ")}) RETURNING id`,
        [f.id, ...keys.map(key => values[key])])
      if (!result.rowCount) continue
      await pg.query(`INSERT INTO "FoodMicroFill"("foodItemId", keys, source) VALUES ($1, $2, $3)`,
        [f.id, keys, `USDA ${f.externalId} (Total Sugars)`])
      filledFoods++
      console.log(`  + ${f.id} ${f.name}: ${keys.map(key => `${key} ${values[key]}`).join(", ")}`)
      // Its logs' empty values, through the fill function (fill-only, recorded).
      const basis = await food(pg, f.id)
      const logs = (await pg.query(`SELECT * FROM "LoggedFoodItem" WHERE "foodItemId" = $1 AND "deletedAt" IS NULL AND grams > 0`, [f.id])).rows
      const rows = logs.flatMap(log => {
        const amounts = nutrientsAt(basis, Number(log.grams))
        if (!amounts) return []
        const fill = Object.fromEntries(FILL_KEYS.flatMap(key => log[key] == null && finite(amounts[key]) ? [[key, round(amounts[key]!)]] : []))
        return Object.keys(fill).length ? [{ id: log.id, values: fill }] : []
      })
      if (rows.length) filledLogs += Number((await pg.query(`SELECT public.fill_logged_micronutrients($1::jsonb) AS n`, [JSON.stringify(rows)])).rows[0].n)
    }
  }
  console.log(`  USDA foods without sugars: ${foods.length}; ${filledFoods} filled, ${filledLogs} logs filled`)
}

async function main() {
  const apply = process.argv.includes("--apply")
  if (process.env.USDA_SECOND_API_KEY) process.env.USDA_API_KEY = process.env.USDA_SECOND_API_KEY
  const pg = new Client({ connectionString: process.env.SUPABASE_PG_URI })
  await pg.connect()
  await pg.query("BEGIN")
  await pg.query("SELECT pg_catalog.set_config('app.meal_operation_write', 'true', true)")
  for (const [name, step] of [["Fairlife", fairlife], ["Chicken sodium", chickenSodium], ["Boar's Head fibre", boarsHeadFibre],
    ["Kraft potassium", kraftPotassium], ["USDA sugars", usdaColumns]] as const) {
    console.log(name)
    await step(pg)
  }
  await pg.query(apply ? "COMMIT" : "ROLLBACK")
  console.log(apply ? "applied" : "dry run (rolled back)")
  await pg.end()
}

main().catch(error => { console.error(error); process.exit(1) })
