// One-off (2026-10-02): Trü Frü duplicates. USDA's branded records drop the "ü" (brand "Tr Fr") and carry no barcode, so
// two came in beside the barcoded foods for the same packs: 15353 (strawberries, white & milk chocolate) is 15352, and
// 15332 (blueberries, white & dark) is 15331. They merge into the barcoded foods (no logs move; their names stay as
// knownAs). The rest are named for what they are under one brand spelling; 15354 is a different product, freeze-dried
// strawberries in crème, not frozen. Renamed foods are re-embedded. --apply writes; otherwise a dry run (rolled back).
import { Client } from "pg"
import { getCachedOrFetchEmbeddings } from "@/utils/embeddingsCache/getCachedOrFetchEmbeddings"

const AUDIT = "tru_fru_2026-10-02"
const MERGES: [keep: number, drop: number][] = [[15352, 15353], [15331, 15332]]
const BRAND = "Trü Frü"
const NAMES: Record<number, string> = {
  15352: "Frozen Strawberries in White & Milk Chocolate",
  15354: "Freeze-Dried Strawberries & Crème"
}
const ALL = [15312, 15331, 15352, 15354]

async function main() {
  const apply = process.argv.includes("--apply")
  const pg = new Client({ connectionString: process.env.SUPABASE_PG_URI })
  await pg.connect()
  await pg.query("BEGIN")
  try {
    for (const [keep, drop] of MERGES) {
      const result = (await pg.query(`SELECT public.merge_catalogue_food($1, $2, $3) AS r`, [keep, drop, AUDIT])).rows[0].r
      console.log("  merged", JSON.stringify(result))
    }
    for (const id of ALL) {
      const before = (await pg.query(`SELECT name, brand, "knownAs" FROM "FoodItem" WHERE id = $1`, [id])).rows[0]
      const name = NAMES[id] ?? before.name
      const knownAs = [...new Set([...(before.knownAs ?? []), ...(name !== before.name ? [before.name] : [])])]
      await pg.query(`INSERT INTO "CatalogueAuditBackup"(audit, "tableName", "rowId", before)
        SELECT $1, 'FoodItem', id, to_jsonb(f) - 'bgeBaseEmbedding' FROM "FoodItem" f WHERE id = $2`, [AUDIT, id])
      const [vector] = await getCachedOrFetchEmbeddings("BGE_BASE", [`${name} - ${BRAND}`])
      await pg.query(`UPDATE "FoodItem" SET name = $2, brand = $3, "knownAs" = $4, "bgeBaseEmbedding" = $5, "lastUpdated" = now()
        WHERE id = $1`, [id, name, BRAND, knownAs, JSON.stringify(vector.embedding)])
      console.log(`  ${id}: ${before.name} (${before.brand}) → ${name} (${BRAND}); knownAs ${JSON.stringify(knownAs)}`)
    }
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
