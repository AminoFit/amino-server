// One-off (2026-10-01): the owner's logged foods whose values no longer matched their food after catalogue corrections
// (an MCP agent's audit found the Tuna Ceviche at 556 kcal for 175 g; the food was superseded on 2026-09-26). Each item
// was judged by hand: recompute from the corrected food, or keep the user's stated calories and correct the weight.
// Every nutrient is repriced through nutrientsAt (vitamins and minerals included). Previous values are recorded in
// LoggedFoodItemMicroFill.filled as {"correction": ..., "previous": {...}}. --apply writes; otherwise a dry run.
import { Client } from "pg"
import { HISTORY_NUTRIENTS, nutrientsAt } from "@/nutrition"

type Fix = { id: number; grams?: number; unit?: { servingId: number | null; servingAmount: number; loggedUnit: string }; why: string }
const recompute = (ids: number[], why: string): Fix[] => ids.map(id => ({ id, why }))
// "210 calories worth of a Mission flour tortilla": 210 kcal stands; 107 kcal per 36 g puts it at 70.65 g.
const tortilla210 = (id: number): Fix => ({ id, grams: 70.65, unit: { servingId: null, servingAmount: 70.65, loggedUnit: "g" },
  why: "user stated 210 kcal; weight corrected" })
const FIXES: Fix[] = [
  ...recompute([52330], "Tuna Ceviche: logged against an estimate superseded on 2026-09-26"),
  ...recompute([3390], "Big Mac: one Big Mac logged at twice its calories"),
  ...recompute([49962], "Palm sugar: 7.4 kcal/g is impossible"),
  ...recompute([4048, 4066, 4338, 18174], "Mission tortilla by weight: food corrected in A14"),
  ...recompute([5244, 5478], "Mini Babybel: 70 kcal each"),
  ...recompute([3270], "Apple: food's current values"),
  ...recompute([52162], "Sour Patch Kids: food's current values"),
  ...recompute([50435], "Four small tomatoes: food's current values"),
  ...[4647, 17990, 20768, 21782, 21855, 22849, 23337, 23679, 26295, 26597, 27308, 27681, 29166, 29433].map(tortilla210),
  { id: 50050, grams: 29.33, unit: { servingId: null, servingAmount: 29.33, loggedUnit: "g" }, why: "12 Sour Patch Kids: 110 kcal stands; weight corrected" },
  { id: 13004, grams: 160, why: "One yogurt container is 160 g, not 10 g" },
  { id: 52140, grams: 350, why: "One Turkey Stroganoff portion is 350 g, not 1 g" },
  { id: 52148, grams: 350, why: "One Turkey Stroganoff portion is 350 g, not 1 g" }
]

async function main() {
  const apply = process.argv.includes("--apply")
  const pg = new Client({ connectionString: process.env.SUPABASE_PG_URI })
  await pg.connect()
  const items = (await pg.query(`SELECT l.*, row_to_json(f) AS food,
      coalesce((SELECT json_agg(n) FROM "Nutrient" n WHERE n."foodItemId" = f.id), '[]') AS rows
    FROM "LoggedFoodItem" l JOIN "FoodItem" f ON f.id = l."foodItemId" WHERE l.id = ANY($1::int[]) AND l."deletedAt" IS NULL`,
    [FIXES.map(fix => fix.id)])).rows
  await pg.query("BEGIN")
  await pg.query("SELECT pg_catalog.set_config('app.meal_operation_write', 'true', true)")
  for (const fix of FIXES) {
    const item = items.find(row => row.id === fix.id)
    if (!item) { console.log(`  ? ${fix.id} missing`); continue }
    const grams = fix.grams ?? Number(item.grams)
    const amounts = nutrientsAt({ ...item.food, Nutrient: item.rows }, grams)
    if (!amounts) { console.log(`  ? ${fix.id} no basis`); continue }
    const values = Object.fromEntries(HISTORY_NUTRIENTS.map(key => [key, amounts[key] == null ? null : Math.round(amounts[key]! * 1e4) / 1e4]))
    const previous = Object.fromEntries([...HISTORY_NUTRIENTS, "grams", "servingId", "servingAmount", "loggedUnit"].map(key => [key, item[key]]))
    console.log(`  ${fix.id} ${item.food.name}: ${Math.round(item.grams)} g ${Math.round(item.kcal)} kcal -> ${Math.round(grams)} g ${Math.round(values.kcal ?? 0)} kcal (${fix.why})`)
    const columns = { ...values, grams, ...(fix.unit ?? {}) }
    const keys = Object.keys(columns)
    await pg.query(`UPDATE "LoggedFoodItem" SET ${keys.map((key, at) => `"${key}" = $${at + 2}`).join(", ")} WHERE id = $1`,
      [fix.id, ...keys.map(key => (columns as Record<string, unknown>)[key])])
    await pg.query(`INSERT INTO "LoggedFoodItemMicroFill"("loggedFoodItemId", filled) VALUES ($1, $2)`,
      [fix.id, JSON.stringify({ correction: fix.why, previous })])
  }
  await pg.query(apply ? "COMMIT" : "ROLLBACK")
  console.log(apply ? "applied" : "dry run (rolled back)")
  await pg.end()
}

main().catch(error => { console.error(error); process.exit(1) })
