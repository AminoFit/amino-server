import { createAdminSupabase } from "@/utils/supabase/serverAdmin"
import { catalogueOrOwnFilter, visibleFoodFilter } from "@/userFoods/visibility"

type Db = ReturnType<typeof createAdminSupabase>

// Package barcodes (2026-10-04-package-barcodes-plan.md): a food carries its main barcode (FoodItem.gtin) and any
// number of other package sizes (FoodBarcode), each pointing at the package's serving when the source gives its size.

/** Energy per gram within 15%: the same product in another package, not another recipe or flavour. */
export const SAME_PRODUCT_DENSITY = 0.15

export type PackageSource = { gtin: string; source: string; kcal: number; grams: number
  /** The package size the source gives (grams), when it does: the serving the barcode opens at. */
  packageGrams?: number | null }

type FoodRow = { id: number; brand: string | null; gtin: string | null; privateToUserId: string | null; archivedAt: string | null
  defaultServingWeightGram: number | null; kcalPerServing: number | null
  Serving: { id: number; servingWeightGram: number | null; defaultServingAmount: number | string | null }[] }

/** Adds a barcode to a food as another package of it, when the source is the same product: a branded (or the user's
 * own) food, energy per gram within 15%, and a barcode nothing else carries. The package's serving is the food's serving
 * of the source's package size (within 2%), when there is one. */
export async function addPackageBarcode(db: Db, foodId: number, package_: PackageSource) {
  const read = await (db as any).from("FoodItem")
    .select("id,brand,gtin,privateToUserId,archivedAt,defaultServingWeightGram,kcalPerServing,Serving(id,servingWeightGram,defaultServingAmount)")
    .eq("id", foodId).maybeSingle()
  if (read.error) throw read.error
  const food = read.data as FoodRow | null
  if (!food || food.archivedAt) return { status: "skipped" as const, reason: "food_unavailable" }
  if (food.gtin === package_.gtin) return { status: "main" as const }
  // A barcode belongs to one branded product (20261004090000_clear_generic_barcodes.sql): never a generic food.
  if (!food.privateToUserId && !food.brand?.trim()) return { status: "skipped" as const, reason: "generic_food" }
  const foodDensity = Number(food.kcalPerServing) / Number(food.defaultServingWeightGram)
  const sourceDensity = package_.kcal / package_.grams
  if (!(foodDensity > 0) || !(sourceDensity > 0) || Math.abs(sourceDensity - foodDensity) / foodDensity > SAME_PRODUCT_DENSITY)
    return { status: "skipped" as const, reason: "different_values" }
  const taken = await Promise.all([
    db.from("FoodItem").select("id").eq("gtin", package_.gtin).is("archivedAt", null)
      .or(catalogueOrOwnFilter(food.privateToUserId)).limit(1),
    (db as any).from("FoodBarcode").select("foodItemId").eq("gtin", package_.gtin)
      .or(catalogueOrOwnFilter(food.privateToUserId)).limit(1)])
  if (taken[0].error || taken[1].error) throw taken[0].error ?? taken[1].error
  const owner = (taken[0].data?.[0] as { id: number } | undefined)?.id ?? (taken[1].data?.[0] as { foodItemId: number } | undefined)?.foodItemId
  if (owner != null) return owner === foodId ? { status: "exists" as const } : { status: "skipped" as const, reason: "other_food" }
  const grams = package_.packageGrams ?? null
  const serving = grams ? food.Serving.find(row => {
    const weight = Number(row.servingWeightGram) / Number(row.defaultServingAmount || 1)
    return weight > 0 && Math.abs(weight - grams) / grams <= 0.02
  }) : undefined
  const inserted = await (db as any).from("FoodBarcode").insert({ gtin: package_.gtin, foodItemId: foodId,
    servingId: serving?.id ?? null, privateToUserId: food.privateToUserId, source: package_.source })
  if (inserted.error) {
    // Another request added it first.
    if (inserted.error.code === "23505") return { status: "exists" as const }
    throw inserted.error
  }
  // The phone's catalogue mirror and the user's own-food pull follow lastUpdated.
  await db.from("FoodItem").update({ lastUpdated: new Date().toISOString() }).eq("id", foodId)
  return { status: "added" as const, servingId: serving?.id ?? null }
}

/** The food (and, for a package barcode, its package serving) that answers a barcode for this user: their own food
 * first, else the shared catalogue's; the main barcode before a package one. */
export async function foodForGtin(db: Db, userId: string, gtin: string) {
  const visible = visibleFoodFilter(userId)
  const [main, packages] = await Promise.all([
    db.from("FoodItem").select("id,privateToUserId").eq("gtin", gtin).is("archivedAt", null).or(visible)
      .order("privateToUserId", { ascending: true, nullsFirst: false }).order("id").limit(1),
    (db as any).from("FoodBarcode").select("foodItemId,servingId,privateToUserId").eq("gtin", gtin).or(visible)
      .order("privateToUserId", { ascending: true, nullsFirst: false }).limit(1)])
  if (main.error) throw main.error
  if (packages.error) throw packages.error
  const own = (main.data?.[0] as { id: number; privateToUserId: string | null } | undefined)
  const pack = (packages.data?.[0] as { foodItemId: number; servingId: number | null; privateToUserId: string | null } | undefined)
  // The user's own food answers ahead of the catalogue's, whichever table carries it.
  if (pack && pack.privateToUserId && !own?.privateToUserId) return { foodId: pack.foodItemId, servingId: pack.servingId }
  if (own) return { foodId: own.id, servingId: null as number | null }
  return pack ? { foodId: pack.foodItemId, servingId: pack.servingId } : null
}
