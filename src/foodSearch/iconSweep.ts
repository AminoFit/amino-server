import { createAdminSupabase } from "@/utils/supabase/serverAdmin"

// The safety net for food icons: a food can end up without one (a queue job that failed, or a path that didn't queue
// one, as the camera's barcode lookup didn't until 2026-10-02). Every 6 hours, the newest foods without an icon are queued
// again, a few at a time (the queue keeps one job per food, so a pending one isn't doubled).

type Db=ReturnType<typeof createAdminSupabase>
const PER_RUN=25

export async function queueMissingFoodIcons(options:{db?:Db;enqueue?:(foodId:number)=>Promise<unknown>;limit?:number}={}) {
  const db=options.db??createAdminSupabase()
  const {data,error}=await db.from("FoodItem").select("id,FoodItemImages()").is("FoodItemImages",null)
    .is("archivedAt",null).order("id",{ascending:false}).limit(options.limit??PER_RUN)
  if (error) throw error
  const enqueue=options.enqueue??(async(foodId:number)=>
    (await import("@/app/api/queues/generate-food-icon/generate-food-icon")).enqueueFoodIcon(foodId))
  const ids=(data??[]).map(row=>(row as {id:number}).id)
  let queued=0
  for (const id of ids) {
    try {await enqueue(id);queued++}
    catch (queueError) {console.error("food_icon_sweep_enqueue_failed",{foodId:id,queueError})}
  }
  return {missing:ids.length,queued}
}

/** Logged foods without a current-style icon (none, or only old styles) go to the icon queue, which links a close
 * current icon or draws one. Every way of logging calls this (the meal worker, Add Food's direct log), so an old icon
 * is replaced the next time the food is logged however it's logged (meal 30471's Spindrift came from Add Food).
 * A logged recipe brings its ingredients, which its page lists: logging Beef & Broccoli Rice Bowls never reached its
 * sesame oil and cornstarch, which kept their 2024 stickers. */
export async function queueIconsForLoggedFoods(foodIds:number[],db:Db=createAdminSupabase(),
  enqueue?:(foodId:number)=>Promise<unknown>) {
  const logged=[...new Set(foodIds)]
  if (!logged.length) return
  // Generated types predate RecipeIngredient.
  const {data:parts,error:partsError}=await (db as any).from("RecipeIngredient").select("foodItemId").in("recipeFoodItemId",logged)
  if (partsError) throw partsError
  const ids=[...new Set([...logged,...((parts??[]) as {foodItemId:number}[]).map(row=>row.foodItemId)])]
  const {data,error}=await db.from("FoodItemImages").select("foodItemId,foodImageId").in("foodItemId",ids)
  if (error) throw error
  const {isCurrentStyle}=await import("@/app/api/queues/generate-food-icon/iconStyle")
  const linked=new Set((data??[]).filter(row=>isCurrentStyle(row.foodImageId)).map(row=>row.foodItemId))
  const queue=enqueue??(async(foodId:number)=>{
    const {generateFoodIconQueue}=await import("@/app/api/queues/generate-food-icon/generate-food-icon")
    return generateFoodIconQueue.enqueue(String(foodId),{id:`icon-${foodId}`})
  })
  for (const id of ids.filter(id=>!linked.has(id))) await queue(id)
}
