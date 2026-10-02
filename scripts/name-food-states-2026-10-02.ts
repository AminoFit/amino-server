// One-off (2026-10-02): shared staples whose name doesn't say whether the values are cooked, dry or raw ("rice" at
// 130 kcal/100 g, logged 253 times, is cooked rice; "oats" at 379 is dry) are named for it by withState (foodState.ts):
// grains, pasta, oats and pulses by energy per 100 g, unbranded meat and potatoes only at USDA's value for one state.
// Only the name changes: the old one stays in knownAs (searching "rice" still finds it), the name is re-embedded, and no
// nutrition or log is touched. Backed up in CatalogueAuditBackup.
// Usage: ... scripts/name-food-states-2026-10-02.ts [--apply] [--csv <path>]
import { writeFileSync } from "fs"
import { Client } from "pg"
import { withState } from "@/mealResolution/foodState"
import { getCachedOrFetchEmbeddings } from "@/utils/embeddingsCache/getCachedOrFetchEmbeddings"

const AUDIT = "food_states_2026-10-02"

async function main() {
  const apply = process.argv.includes("--apply")
  const csvAt = process.argv.indexOf("--csv")
  const pg = new Client({ connectionString: process.env.SUPABASE_PG_URI })
  await pg.connect()
  const foods = (await pg.query(`SELECT f.id, f.name, f.brand, f."knownAs", f."foodInfoSource" AS source,
      f."kcalPerServing" / f."defaultServingWeightGram" * 100 AS kcal, coalesce(l.n, 0)::int AS logs
    FROM "FoodItem" f LEFT JOIN (SELECT "foodItemId", count(*) n FROM "LoggedFoodItem" WHERE "deletedAt" IS NULL GROUP BY 1) l
      ON l."foodItemId" = f.id
    WHERE f."archivedAt" IS NULL AND f."privateToUserId" IS NULL AND f."recipePortions" IS NULL AND f."defaultServingWeightGram" > 0`)).rows
  const renames = foods.flatMap(food => {
    const name = withState(food.name, { brand: food.brand, kcalPer100g: Number(food.kcal) })
    return name === food.name ? [] : [{ ...food, newName: name }]
  }).sort((a, b) => b.logs - a.logs)
  const states = renames.reduce<Record<string, number>>((count, row) => {
    const state = row.newName.split(", ").pop()!; count[state] = (count[state] ?? 0) + 1; return count }, {})
  console.log(`${renames.length} of ${foods.length} shared foods named for their state ${JSON.stringify(states)}, ` +
    `${renames.reduce((sum, row) => sum + row.logs, 0)} logs on them`)
  for (const row of renames.slice(0, 30)) console.log(`  ${row.id} ${JSON.stringify(row.name)} → ${JSON.stringify(row.newName)}` +
    ` (${Math.round(row.kcal)} kcal/100 g, ${row.logs} logs)`)
  if (csvAt > 0) {
    const quote = (value: unknown) => `"${String(value ?? "").replace(/"/g, '""')}"`
    writeFileSync(process.argv[csvAt + 1], ["id,old name,new name,brand,kcal per 100 g,logs,source",
      ...renames.map(row => [row.id, quote(row.name), quote(row.newName), quote(row.brand), Math.round(row.kcal), row.logs, row.source].join(","))]
      .join("\n") + "\n")
  }
  if (!apply) { console.log("dry run: nothing written"); await pg.end(); return }
  await pg.query("BEGIN")
  try {
    for (let at = 0; at < renames.length; at += 50) {
      const batch = renames.slice(at, at + 50)
      const vectors = await getCachedOrFetchEmbeddings("BGE_BASE", batch.map(row => row.brand ? `${row.newName} - ${row.brand}` : row.newName))
      for (const [index, row] of batch.entries()) {
        if (!vectors[index]?.embedding?.length) throw new Error(`no embedding for ${row.id}`)
        await pg.query(`INSERT INTO "CatalogueAuditBackup"(audit, "tableName", "rowId", before)
          SELECT $1, 'FoodItem', id, to_jsonb(f) - 'bgeBaseEmbedding' FROM "FoodItem" f WHERE id = $2`, [AUDIT, row.id])
        const knownAs = [...new Set([...(row.knownAs ?? []), row.name])].slice(0, 10)
        await pg.query(`UPDATE "FoodItem" SET name = $2, "knownAs" = $3, "bgeBaseEmbedding" = $4, "lastUpdated" = now() WHERE id = $1`,
          [row.id, row.newName, knownAs, JSON.stringify(vectors[index].embedding)])
      }
    }
    await pg.query("COMMIT")
    console.log(`applied: ${renames.length} renamed`)
  } catch (error) {
    await pg.query("ROLLBACK")
    throw error
  } finally {
    await pg.end()
  }
}

main().catch(error => { console.error(error); process.exit(1) })
