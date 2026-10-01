// The shared catalogue for the app's on-device mirror (food-search-plan.md, tier 2): pages of foods (with servings and
// their best icon) changed since the app's last pull, and the list of live ids so the app can drop foods merged away
// or removed. Private foods never come through here (the user's own sync covers them).
import { createAdminSupabase } from "@/utils/supabase/serverAdmin"
import { microsFrom } from "@/nutrition"

type Db = ReturnType<typeof createAdminSupabase>
export const CATALOGUE_PAGE = 1000

const columns = `id,name,brand,gtin,knownAs,defaultServingWeightGram,kcalPerServing,totalFatPerServing,satFatPerServing,
  transFatPerServing,carbPerServing,sugarPerServing,addedSugarPerServing,proteinPerServing,fiberPerServing,isLiquid,
  defaultServingLiquidMl,weightUnknown,verified,lastUpdated,
  Serving(id,foodItemId,servingName,servingWeightGram,defaultServingAmount),
  Nutrient(nutrientName,nutrientUnit,nutrientAmountPerDefaultServing),
  FoodItemImages(FoodImage(id,pathToImage,downvotes))`

/** Foods changed after `since` (UTC wall clock, as lastUpdated is stored), after id `cursor`, by id. */
export async function cataloguePage(since: string | null, cursor: number, db: Db = createAdminSupabase()) {
  let query = db.from("FoodItem").select(columns).is("privateToUserId", null).gt("id", cursor).order("id")
    .limit(CATALOGUE_PAGE)
  if (since) query = query.gt("lastUpdated", since)
  const { data, error } = await query
  if (error) throw error
  const foods = ((data ?? []) as any[]).map(({ FoodItemImages, Nutrient, ...food }) => {
    // One icon per food, as the app picks it: fewest downvotes, then the newest.
    const best = (FoodItemImages ?? []).flatMap((image: any) => image.FoodImage ? [image.FoodImage] : [])
      .sort((a: any, b: any) => a.downvotes - b.downvotes || b.id - a.id)[0]
    // Vitamins and minerals per default serving by nutrient key (the app's food pages show them), mapped here once.
    const micros = microsFrom(((Nutrient ?? []) as { nutrientName: string; nutrientUnit: string | null; nutrientAmountPerDefaultServing: number }[])
      .map(row => ({ name: row.nutrientName, amount: row.nutrientAmountPerDefaultServing, unit: row.nutrientUnit })))
    const nutrients = Object.keys(micros).length
      ? JSON.stringify(Object.fromEntries(Object.entries(micros).map(([key, value]) => [key, Math.round(value! * 1e4) / 1e4]))) : null
    return { ...food, nutrients, foodImageUrl: best?.pathToImage?.split("?")[0] ?? null }
  })
  return { foods, nextCursor: foods.length === CATALOGUE_PAGE ? foods[foods.length - 1].id as number : null }
}

/** Every live shared food id, for removing the app's copies of foods that no longer exist. */
export async function catalogueIds(db: Db = createAdminSupabase()) {
  const ids: number[] = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db.from("FoodItem").select("id").is("privateToUserId", null).order("id").range(from, from + 999)
    if (error) throw error
    ids.push(...((data ?? []) as { id: number }[]).map(row => row.id))
    if (!data || data.length < 1000) return ids
  }
}
